/**
 * Refume: bundles ("Pakiety") — several items from one seller in one order with one shipping fee.
 *
 * A Sharetribe transaction belongs to one listing, so a bundle is one order for the main
 * listing (its stock is handled by the transaction process as usual) plus extra line items
 * for the other listings ("line-item/refume-pakiet-1", …). Their stock is reserved here with
 * the Integration API when the order is created, and given back by a background sweep when the
 * order expires or is cancelled.
 *
 * Transaction metadata (set by the server, readable by both parties):
 *   refumePakiet: { items: [{ id, title, price: { amount, currency } }] }
 *
 * Open bundles are tracked in the first moderator's privateData.refumePakietyAktywne:
 *   [{ txId, listingIds: [...], od }]
 */
const { types } = require('sharetribe-flex-sdk');
const {
  isIntegrationApiConfigured,
  showListing,
  showUser,
  updateUserProfile,
  showTransaction,
  compareAndSetStock,
  createStockAdjustment,
} = require('./refumeIntegrationApi');
const { REFUME_SHIPPING_PRICES } = require('./refumeShipping');
const { cleanBundleSettings, bundleDiscountPercent } = require('./refumeBundleSettings');

const { Money } = types;

const MAX_EXTRA_ITEMS = 9;
const ACTIVE_KEY = 'refumePakietyAktywne';
const SWEEP_MS = 5 * 60 * 1000;
const SIZE_ORDER = ['S', 'M', 'L'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LINE_ITEM_PREFIX = 'line-item/refume-pakiet-';
const DISCOUNT_LINE_ITEM = 'line-item/refume-zestaw-rabat';

const RELEASE_TRANSITIONS = [
  'transition/expire-payment',
  'transition/cancel',
  'transition/auto-cancel',
  'transition/cancel-from-disputed',
  'transition/auto-cancel-from-disputed',
];
const SOLD_TRANSITIONS = [
  'transition/mark-received-from-purchased',
  'transition/mark-received',
  'transition/auto-mark-received',
  'transition/mark-received-from-disputed',
  'transition/auto-complete',
];

const httpError = (status, message) =>
  Object.assign(new Error(message), { status, statusText: message, data: {} });
const uuidOf = id => (typeof id === 'string' ? id : id?.uuid);

// Bundles checked by the server. Line items use only these, never data from the browser.
const verified = new WeakSet();
const isVerifiedBundle = bundle => !!bundle && typeof bundle === 'object' && verified.has(bundle);

/** Listing ids the buyer asked to add (without the main listing, no duplicates). */
const requestedBundleIds = (orderData, mainListingId) => {
  const raw = Array.isArray(orderData?.refumePakiet) ? orderData.refumePakiet : [];
  const ids = [...new Set(raw.map(uuidOf).filter(id => UUID_RE.test(id || '')))].filter(
    id => id !== mainListingId
  );
  if (ids.length > MAX_EXTRA_ITEMS) {
    throw httpError(400, `Zestaw może mieć najwyżej ${MAX_EXTRA_ITEMS + 1} rzeczy.`);
  }
  return ids;
};

/**
 * Loads and checks the extra listings: same seller, published, not hidden, in stock,
 * same currency, items for sale. Returns a verified bundle object or null.
 */
const loadBundle = async (sdk, mainListing, ids, sellerPublicData) => {
  if (!ids.length) return null;
  const settings = cleanBundleSettings(sellerPublicData?.refumeZestawy);
  if (settings.wylaczone) throw httpError(400, 'Ten sprzedawca nie przyjmuje zamówień w zestawach.');
  if (!isIntegrationApiConfigured()) throw httpError(400, 'Zestawy są chwilowo niedostępne.');
  const mainAuthorId = mainListing.relationships?.author?.data?.id?.uuid;
  const currency = mainListing.attributes.price?.currency;
  const items = [];
  for (const id of ids) {
    const res = await sdk.listings
      .show({ id, include: ['author', 'currentStock'] })
      .catch(() => null);
    const l = res?.data?.data;
    const stock = (res?.data?.included || []).find(i => i.type === 'stock');
    const a = l?.attributes;
    const unavailable = httpError(409, 'Jedna z rzeczy z zestawu nie jest już dostępna.');
    if (!l || a.state !== 'published' || a.deleted) throw unavailable;
    if (l.relationships?.author?.data?.id?.uuid !== mainAuthorId) {
      throw httpError(400, 'Zestaw może zawierać tylko rzeczy jednego sprzedawcy.');
    }
    if (a.metadata?.moderacja?.ukryta) throw unavailable;
    if (!(stock?.attributes?.quantity >= 1)) throw unavailable;
    if (!a.price || a.price.currency !== currency) throw httpError(400, 'Różne waluty w zestawie.');
    if ((a.publicData?.unitType || 'item') !== 'item') throw httpError(400, 'Ta oferta nie może być w zestawie.');
    items.push({
      id: l.id.uuid,
      title: a.title || '',
      price: new Money(a.price.amount, a.price.currency),
      publicData: a.publicData || {},
    });
  }
  const bundle = { items, discountPercent: bundleDiscountPercent(settings, items.length + 1) };
  verified.add(bundle);
  return bundle;
};

/**
 * One parcel for all items: the biggest parcel size, and only carriers every listing allows.
 * Pickup only when every listing allows it.
 */
const getBundleShippingSetup = publicDatas => {
  const setups = publicDatas.map(pd => {
    const size = REFUME_SHIPPING_PRICES[pd?.gabaryt] ? pd.gabaryt : 'M';
    const carriers =
      Array.isArray(pd?.shippingCarriers) && pd.shippingCarriers.length
        ? pd.shippingCarriers
        : Object.keys(REFUME_SHIPPING_PRICES[size]);
    return { size, carriers };
  });
  const size = setups.reduce(
    (max, s) => (SIZE_ORDER.indexOf(s.size) > SIZE_ORDER.indexOf(max) ? s.size : max),
    'S'
  );
  const carriers = Object.keys(REFUME_SHIPPING_PRICES[size]).filter(c =>
    setups.every(s => s.carriers.includes(c))
  );
  return { size, carriers, pickupEnabled: publicDatas.every(pd => !!pd?.pickupEnabled) };
};

const bundleLineItems = bundle =>
  bundle.items.map((item, i) => ({
    code: `${LINE_ITEM_PREFIX}${i + 1}`,
    unitPrice: item.price,
    quantity: 1,
    includeFor: ['customer', 'provider'],
  }));

const bundleMetadata = bundle => ({
  refumePakiet: {
    rabatProcent: bundle.discountPercent || 0,
    items: bundle.items.map(i => ({
      id: i.id,
      title: i.title,
      price: { amount: i.price.amount, currency: i.price.currency },
    })),
  },
});

// ---------- Stock reservations ----------

const reserveOne = async listingId => {
  const shown = await showListing({ id: listingId, include: 'currentStock' });
  const stock = (shown.included || []).find(i => i.type === 'stock');
  const quantity = stock?.attributes?.quantity;
  if (!(quantity >= 1)) throw httpError(409, 'Jedna z rzeczy z zestawu właśnie została sprzedana.');
  await compareAndSetStock({ listingId, oldTotal: quantity, newTotal: quantity - 1 }).catch(() => {
    throw httpError(409, 'Jedna z rzeczy z zestawu właśnie została kupiona. Spróbuj ponownie.');
  });
};

const releaseOne = listingId =>
  createStockAdjustment({ listingId, quantity: 1 }).catch(e =>
    console.error(`[refume-pakiety] stock release failed for ${listingId}:`, e.message)
  );

/** Reserves all extra items; on failure gives back what was already reserved. */
const reserveBundle = async bundle => {
  const done = [];
  try {
    for (const item of bundle.items) {
      await reserveOne(item.id);
      done.push(item.id);
    }
  } catch (e) {
    await Promise.all(done.map(releaseOne));
    throw e;
  }
  return done;
};

const releaseBundle = bundle => Promise.all(bundle.items.map(i => releaseOne(i.id)));

// ---------- Open bundles list ----------

const ownerId = () =>
  (process.env.REFUME_MODERATOR_USER_IDS || '')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean)[0] || null;

// Kept in the Refume database (or the first moderator's privateData without one)
const withActive = fn => {
  if (!ownerId()) return Promise.reject(new Error('REFUME_MODERATOR_USER_IDS is not set.'));
  // eslint-disable-next-line global-require
  return require('./refumeStore').withList(ACTIVE_KEY, fn);
};

const trackBundle = (txId, bundle) =>
  withActive(active => [
    ...active.filter(a => a.txId !== txId),
    { txId, listingIds: bundle.items.map(i => i.id), od: new Date().toISOString() },
  ]).catch(e => console.error('[refume-pakiety] could not save open bundle:', e.message));

/** Gives back stock of bundles whose orders expired or were cancelled. */
const sweep = async () => {
  if (!isIntegrationApiConfigured() || !ownerId()) return;
  await withActive(async active => {
    if (!active.length) return active;
    const keep = [];
    for (const entry of active) {
      try {
        const tx = (await showTransaction({ id: entry.txId })).data;
        const last = tx?.attributes?.lastTransition;
        const history = (tx?.attributes?.transitions || []).map(t => t.transition);
        if (RELEASE_TRANSITIONS.includes(last)) {
          await Promise.all(entry.listingIds.map(releaseOne));
          console.log(`[refume-pakiety] ${entry.txId}: ${last}, ${entry.listingIds.length} item(s) back in stock`);
        } else if (SOLD_TRANSITIONS.some(t => history.includes(t))) {
          // Sold: stock stays at 0
        } else {
          keep.push(entry);
        }
      } catch (e) {
        if (e.status === 404) continue;
        keep.push(entry);
      }
    }
    return keep.length === active.length ? active : keep;
  }).catch(e => console.error('[refume-pakiety] sweep failed:', e.message));
};

let sweepTimer = null;
const startBundleSweep = () => {
  if (sweepTimer || process.env.NODE_ENV === 'test') return;
  sweepTimer = setInterval(sweep, SWEEP_MS);
  if (sweepTimer.unref) sweepTimer.unref();
  setTimeout(sweep, 30 * 1000).unref?.();
};

module.exports = {
  MAX_EXTRA_ITEMS,
  LINE_ITEM_PREFIX,
  DISCOUNT_LINE_ITEM,
  requestedBundleIds,
  loadBundle,
  isVerifiedBundle,
  getBundleShippingSetup,
  bundleLineItems,
  bundleMetadata,
  reserveBundle,
  releaseBundle,
  trackBundle,
  sweep,
  startBundleSweep,
};
