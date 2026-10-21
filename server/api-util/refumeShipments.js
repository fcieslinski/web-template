/**
 * Refume: shipments through Furgonetka.pl, created automatically for paid orders.
 *
 *   paid order (last transition confirm-payment, delivery by shipping)
 *     → package created and ordered on the Refume Furgonetka account
 *     → label ready: the seller prints it and drops the parcel at a point / locker
 *     → tracking (webhook, and polling as a fallback):
 *         collected / transit      → "nadana": operator-mark-delivered (order becomes "sent")
 *         waiting-for-receiver     → "czeka na odbiór"
 *         delivered                → "doręczona"
 *     → order cancelled before the parcel was sent: the package is cancelled (label refunded)
 *
 * Progress is kept in the Refume database (refume_shipments) and what both sides may see
 * (status, carrier, waybill number, tracking link, events) in the order's metadata
 * (metadata.refumePrzesylka), which the chat shows.
 *
 * The seller's sender details are in their privateData.refumeNadawca
 * { imie, telefon, ulica, kod, miasto }. The buyer's are in the order (protectedData
 * shippingDetails + shippingPointCode).
 */
const crypto = require('crypto');
const furgonetka = require('./furgonetka');
const { isDbConfigured, query } = require('./refumeDb');
const {
  isIntegrationApiConfigured,
  queryTransactions,
  showTransaction,
  transitionTransaction,
  updateTransactionMetadata,
  showUser,
} = require('./refumeIntegrationApi');
const { addNotification } = require('./refumeNotifications');

const META_KEY = 'refumePrzesylka';
const SENDER_KEY = 'refumeNadawca';

// Our carrier keys (checkout) → Furgonetka service names (GET /account/services)
const CARRIER_SERVICE = { inpost: 'inpost', orlen: 'orlen', 'dpd-pickup': 'dpd', pocztex: 'poczta' };
const CARRIER_LABEL = {
  inpost: 'InPost Paczkomat',
  orlen: 'Orlen Paczka',
  'dpd-pickup': 'DPD Pickup',
  pocztex: 'Pocztex',
};
// Parcel per listing size (cm, kg). S and M fit InPost lockers A and B.
const PARCELS = {
  S: { width: 38, depth: 64, height: 8, weight: 1 },
  M: { width: 38, depth: 64, height: 19, weight: 2 },
  L: { width: 41, depth: 38, height: 64, weight: 5 },
};

// Furgonetka tracking state → our status (what the chat shows)
const STATUS_OF_STATE = {
  ordered: 'etykieta',
  'ready-for-transport': 'nadana',
  collected: 'nadana',
  transit: 'w-drodze',
  delivery: 'w-doreczeniu',
  'waiting-for-receiver': 'czeka-na-odbior',
  delivered: 'doreczona',
  'collect-problem': 'problem',
  'delivery-problem': 'problem',
  'unexpected-situation': 'problem',
  returned: 'zwrot',
  canceled: 'anulowana',
};
// Order of statuses, so an older event never moves the status back
const STATUS_RANK = {
  nowa: 0,
  'brak-danych-nadawcy': 1,
  'zly-punkt': 1,
  blad: 1,
  etykieta: 2,
  nadana: 3,
  'w-drodze': 4,
  'w-doreczeniu': 5,
  'czeka-na-odbior': 6,
  problem: 6,
  doreczona: 7,
  zwrot: 8,
  anulowana: 9,
};
const SENT_STATUSES = ['nadana', 'w-drodze', 'w-doreczeniu', 'czeka-na-odbior', 'doreczona'];
const ACTIVE_STATUSES = ['etykieta', 'nadana', 'w-drodze', 'w-doreczeniu', 'czeka-na-odbior', 'problem'];

const MAX_ATTEMPTS = 8;
const MAX_EVENTS = 30;

const isShipmentsEnabled = () =>
  isDbConfigured() && isIntegrationApiConfigured() && furgonetka.isFurgonetkaConfigured();

const httpError = (status, message) =>
  Object.assign(new Error(message), { status, statusText: message, data: {} });
const digits = s => String(s || '').replace(/\D/g, '');
const phone9 = s => {
  const d = digits(s);
  return d.length > 9 && d.startsWith('48') ? d.slice(-9) : d;
};
const postcode = s => {
  const d = digits(s);
  return d.length === 5 ? `${d.slice(0, 2)}-${d.slice(2)}` : String(s || '').trim();
};

// ---------- Database ----------

const getRow = async txId => (await query('SELECT * FROM refume_shipments WHERE tx_id = $1', [txId])).rows[0] || null;
const getRowByPackage = async packageId =>
  (await query('SELECT * FROM refume_shipments WHERE package_id = $1', [String(packageId)])).rows[0] || null;

const saveRow = async (txId, fields) => {
  const keys = Object.keys(fields);
  const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  const values = keys.map(k => (k === 'events' ? JSON.stringify(fields[k]) : fields[k]));
  await query(`UPDATE refume_shipments SET ${sets}, updated_at = now() WHERE tx_id = $1`, [txId, ...values]);
};

// ---------- Order data ----------

const loadTx = async txId => {
  const r = await showTransaction({ id: txId, include: 'customer,provider,listing' });
  const tx = r.data;
  const byKey = new Map((r.included || []).map(i => [`${i.type}/${i.id}`, i]));
  const rel = name => {
    const ref = tx.relationships?.[name]?.data;
    return ref ? byKey.get(`${ref.type}/${ref.id}`) : null;
  };
  return { tx, customer: rel('customer'), provider: rel('provider'), listing: rel('listing') };
};

const listingSize = listing => {
  const g = listing?.attributes?.publicData?.gabaryt;
  return PARCELS[g] ? g : 'M';
};

/** What both sides see in the chat (order metadata). */
const publishStatus = async (txId, row, extra = {}) => {
  const value = {
    status: row.status,
    przewoznik: row.carrier || null,
    numer: row.waybill || null,
    sledzenie: row.tracking_url || null,
    zdarzenia: (row.events || []).slice(-MAX_EVENTS),
    // Pickup point chosen again after payment (the first one was refused)
    punkt: row.point_code ? { kod: row.point_code, nazwa: row.point_name || '' } : null,
    aktualizacja: new Date().toISOString(),
    ...extra,
  };
  await updateTransactionMetadata({ id: txId, metadata: { [META_KEY]: value } });
};

const notify = (userId, n) => (userId ? addNotification(userId, n).catch(() => null) : null);

/**
 * Builds the Furgonetka package of an order. Throws { code: 'brak-danych-nadawcy' } when the
 * seller hasn't filled in their sender details.
 */
const buildPackage = async ({ tx, customer, provider, listing }, serviceId, override = {}) => {
  const pd = tx.attributes?.protectedData || {};
  const carrier = pd.shippingCarrier;
  const providerUser = provider ? (await showUser({ id: provider.id })).data : null;
  const sender = providerUser?.attributes?.profile?.privateData?.[SENDER_KEY] || {};
  const senderOk = sender.imie && phone9(sender.telefon).length === 9 && sender.ulica && sender.kod && sender.miasto;
  if (!senderOk) {
    throw Object.assign(new Error('Missing sender details.'), { code: 'brak-danych-nadawcy' });
  }
  const sd = pd.shippingDetails || {};
  const address = sd.address || {};
  const point = String(override.pointCode || pd.shippingPointCode || '').trim();
  const needsPoint = carrier !== 'pocztex';
  if (needsPoint && !point) throw new Error('The order has no pickup point.');
  const size = listingSize(listing);
  const total = tx.attributes?.payinTotal?.amount || 0;
  const shipping = (tx.attributes?.lineItems || [])
    .filter(li => li.code === 'line-item/shipping-fee')
    .reduce((s, li) => s + (li.lineTotal?.amount || 0), 0);
  const value = Math.max(1, Math.round((total - shipping) / 100));

  return {
    service_id: Number(serviceId),
    user_reference_number: `Refume ${tx.id.slice(0, 8)}`,
    pickup: {
      name: String(sender.imie).trim(),
      street: String(sender.ulica).trim(),
      postcode: postcode(sender.kod),
      city: String(sender.miasto).trim(),
      country_code: 'PL',
      email: providerUser?.attributes?.email || undefined,
      phone: phone9(sender.telefon),
    },
    receiver: {
      name: String(sd.name || customer?.attributes?.profile?.displayName || '').trim(),
      ...(needsPoint
        ? { point }
        : {
            street: [address.line1, address.line2].filter(Boolean).join(' ').trim(),
            postcode: postcode(address.postalCode),
            city: String(address.city || '').trim(),
          }),
      country_code: 'PL',
      email: customer?.attributes?.email || undefined,
      phone: phone9(sd.phoneNumber),
    },
    parcels: [{ type: 'package', ...PARCELS[size], value, description: 'Perfumy' }],
  };
};

let servicesCache = null;
const serviceIdFor = async carrier => {
  const name = CARRIER_SERVICE[carrier];
  if (!name) throw new Error(`Carrier ${carrier} is not handled.`);
  if (!servicesCache || Date.now() - servicesCache.at > 60 * 60 * 1000) {
    servicesCache = { at: Date.now(), list: await furgonetka.listServices() };
  }
  // Prefer Furgonetka's own contract
  const matching = servicesCache.list.filter(s => s.service === name);
  const chosen = matching.find(s => s.owner === 'furgonetka') || matching[0];
  if (!chosen) throw new Error(`The Furgonetka account has no ${name} service.`);
  return chosen.id;
};

const errorText = e => {
  const first = e?.data?.errors?.[0];
  const where = first?.path ? ` (${first.path})` : '';
  return `${first?.message || e?.message || 'Unknown error'}${where}`.slice(0, 500);
};

// ---------- Creating and ordering ----------

/**
 * Makes sure the paid order has a shipment: creates the row, the package, orders it and saves
 * the waybill. Safe to call again at any point (each step is skipped when already done).
 */
const processOrder = async txId => {
  await query(
    `INSERT INTO refume_shipments (tx_id, status) VALUES ($1, 'nowa') ON CONFLICT (tx_id) DO NOTHING`,
    [txId]
  );
  let row = await getRow(txId);
  if (!['nowa', 'blad', 'brak-danych-nadawcy', 'zly-punkt'].includes(row.status) && row.waybill) return row;

  const data = await loadTx(txId);
  const pd = data.tx.attributes?.protectedData || {};
  const carrier = pd.shippingCarrier;
  if (pd.deliveryMethod !== 'shipping' || !carrier) {
    await saveRow(txId, { status: 'pomijana', error: 'Not a shipping order.' });
    return getRow(txId);
  }

  try {
    let packageId = row.package_id;
    if (!packageId) {
      const serviceId = await serviceIdFor(carrier);
      const pkg = await buildPackage(data, serviceId, { pointCode: row.point_code });
      const created = await furgonetka.createPackage(pkg);
      packageId = String(created?.package_id || created?.id || '');
      if (!packageId) throw new Error('Furgonetka did not return a package id.');
      await saveRow(txId, { package_id: packageId, carrier, error: null });
    }

    const orderUuid = row.order_uuid || crypto.randomUUID();
    if (!row.order_uuid) await saveRow(txId, { order_uuid: orderUuid });
    const result = await furgonetka.orderPackages([packageId], orderUuid);
    if (result.status !== 'successful') {
      const errs = (result.errors || []).map(x => x.message).filter(Boolean).join('; ');
      throw new Error(errs || `Order command ${result.status}`);
    }

    const pkg = await furgonetka.getPackage(packageId);
    const parcel = (pkg?.parcels || [])[0] || {};
    const waybill = parcel.package_no || null;
    const events = [{ state: 'ordered', status: 'etykieta', at: new Date().toISOString(), opis: 'Etykieta gotowa' }];
    await saveRow(txId, {
      status: 'etykieta',
      waybill,
      tracking_url: parcel.tracking_url || null,
      state: 'ordered',
      events,
      error: null,
      attempts: 0,
      next_try_at: null,
    });
    row = await getRow(txId);
    await publishStatus(txId, row);
    const title = data.listing?.attributes?.title || 'zamówienie';
    await notify(data.provider?.id, {
      type: 'przesylka-etykieta',
      title: `Etykieta gotowa – „${title}”`,
      body: `Wydrukuj etykietę ${CARRIER_LABEL[carrier] || ''} i nadaj paczkę. Numer przesyłki: ${waybill || '—'}.`,
      txId,
      tab: 'sales',
      dedupeKey: `etykieta-${txId}`,
    });
    return row;
  } catch (e) {
    const missingSender = e.code === 'brak-danych-nadawcy';
    const badPoint = (e.data?.errors || []).some(x => /\/receiver\/point/.test(x.path || ''));
    const regulations = e.status === 409;
    const attempts = (row.attempts || 0) + 1;
    const status = missingSender ? 'brak-danych-nadawcy' : badPoint ? 'zly-punkt' : 'blad';
    const waitMin = missingSender ? 60 : Math.min(240, 2 ** attempts);
    await saveRow(txId, {
      status,
      error: missingSender
        ? 'Sprzedawca nie uzupełnił danych nadawcy.'
        : badPoint
        ? 'Przewoźnik nie przyjął punktu odbioru – czekamy, aż kupujący wybierze inny.'
        : regulations
        ? `Zaakceptuj regulamin przewoźnika w panelu Furgonetki: ${errorText(e)}`
        : errorText(e),
      attempts: missingSender ? row.attempts || 0 : attempts,
      // A wrong point waits for the buyer to choose another one
      next_try_at:
        badPoint || (attempts >= MAX_ATTEMPTS && !missingSender) ? null : new Date(Date.now() + waitMin * 60000),
    });
    row = await getRow(txId);
    await publishStatus(txId, row).catch(() => null);
    if (missingSender) {
      const title = data.listing?.attributes?.title || 'zamówienie';
      await notify(data.provider?.id, {
        type: 'przesylka-dane-nadawcy',
        title: `Uzupełnij dane nadawcy – „${title}”`,
        body: 'Żeby wygenerować etykietę, podaj imię i nazwisko, telefon i adres nadawcy w rozmowie z kupującym.',
        txId,
        tab: 'sales',
        dedupeKey: `nadawca-${txId}`,
      });
    } else if (badPoint) {
      const title = data.listing?.attributes?.title || 'zamówienie';
      await notify(data.customer?.id, {
        type: 'przesylka-zly-punkt',
        title: `Wybierz punkt odbioru – „${title}”`,
        body: 'Przewoźnik nie przyjął wybranego punktu odbioru. Wybierz inny punkt w rozmowie z zamówieniem.',
        txId,
        tab: 'orders',
        dedupeKey: `punkt-${txId}-${row.point_code || 'pierwszy'}`,
      });
    } else {
      console.error(`[refume-przesylki] ${txId}: ${row.error}`);
    }
    return row;
  }
};

// ---------- Tracking ----------

const NOTIFY = {
  nadana: { to: 'customer', title: t => `Paczka nadana – „${t}”`, body: 'Sprzedawca nadał paczkę. Możesz śledzić ją w rozmowie.' },
  'czeka-na-odbior': { to: 'customer', title: t => `Paczka czeka na odbiór – „${t}”`, body: 'Twoja paczka jest w punkcie odbioru.' },
  doreczona: {
    to: 'both',
    title: t => `Paczka doręczona – „${t}”`,
    body: 'Sprawdź zamówienie i potwierdź odbiór albo zgłoś problem.',
  },
  problem: { to: 'both', title: t => `Problem z przesyłką – „${t}”`, body: 'Przewoźnik zgłosił problem z doręczeniem. Szczegóły w rozmowie.' },
  zwrot: { to: 'both', title: t => `Paczka wraca do nadawcy – „${t}”`, body: 'Przewoźnik zwraca paczkę do sprzedawcy.' },
};

/**
 * Applies a tracking state (from the webhook or polling) to the order: status, events,
 * the order transition after sending, notifications.
 */
const applyTracking = async (row, events) => {
  const known = new Set((row.events || []).map(e => `${e.state}|${e.at}`));
  const hasOrdered = (row.events || []).some(e => e.state === 'ordered');
  const added = events.filter(
    e => e.state && !known.has(`${e.state}|${e.at}`) && !(e.state === 'ordered' && hasOrdered)
  );
  if (!added.length) return row;
  const all = [...(row.events || []), ...added].sort((a, b) => (a.at || '').localeCompare(b.at || '')).slice(-MAX_EVENTS);
  // The newest carrier event decides (our own "label ready" entry doesn't: sandbox times are made up)
  const carrierEvents = all.filter(e => e.state !== 'ordered');
  const latest = carrierEvents[carrierEvents.length - 1] || all[all.length - 1];
  const nextStatus = STATUS_OF_STATE[latest.state] || row.status;
  const status = STATUS_RANK[nextStatus] >= STATUS_RANK[row.status] || nextStatus === 'problem' ? nextStatus : row.status;
  await saveRow(row.tx_id, { events: all, state: latest.state, status });
  const updated = await getRow(row.tx_id);

  const { tx, customer, provider, listing } = await loadTx(row.tx_id);
  const lastTransition = tx.attributes?.lastTransition;
  // Sent: the order becomes "delivered" (Sharetribe's word for sent); 14 days to confirm
  if (SENT_STATUSES.includes(status) && lastTransition === 'transition/confirm-payment') {
    await transitionTransaction({ id: row.tx_id, transition: 'transition/operator-mark-delivered', params: {} }).catch(e =>
      console.error(`[refume-przesylki] ${row.tx_id}: mark-delivered failed: ${e.message}`)
    );
  }
  await publishStatus(row.tx_id, updated);

  if (status !== row.status && NOTIFY[status]) {
    const n = NOTIFY[status];
    const title = listing?.attributes?.title || 'zamówienie';
    const base = { type: `przesylka-${status}`, title: n.title(title), body: n.body, txId: row.tx_id, dedupeKey: `${status}-${row.tx_id}` };
    if (n.to === 'customer' || n.to === 'both') await notify(customer?.id, { ...base, tab: 'orders' });
    if (n.to === 'both') await notify(provider?.id, { ...base, tab: 'sales' });
  }
  return updated;
};

// Furgonetka's times without an offset are Warsaw time
const warsawOffset = date => {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Warsaw', timeZoneName: 'shortOffset' })
    .formatToParts(date)
    .find(p => p.type === 'timeZoneName')?.value; // "GMT+2"
  const m = /GMT([+-]\d+)/.exec(parts || '');
  const h = m ? Number(m[1]) : 1;
  return `${h >= 0 ? '+' : '-'}${String(Math.abs(h)).padStart(2, '0')}:00`;
};
const toIso = value => {
  const text = String(value || '').trim();
  if (!text) return new Date().toISOString();
  const local = text.replace(' ', 'T');
  if (/[zZ]|[+-]\d\d:?\d\d$/.test(local.slice(10))) return new Date(local).toISOString();
  const guess = new Date(`${local}Z`);
  const d = new Date(`${local}${warsawOffset(guess)}`);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
};

const toEvent = e => ({
  state: e.state,
  status: STATUS_OF_STATE[e.state] || null,
  at: toIso(e.datetime),
  opis: String(e.status || e.description || '').slice(0, 200),
  punkt: String(e.branch || '').slice(0, 120) || undefined,
});

/** Asks Furgonetka for the tracking of one shipment and applies it. */
const refreshTracking = async row => {
  if (!row?.package_id) return row;
  const t = await furgonetka.getTracking(row.package_id);
  const parcels = t?.parcels || {};
  const parcel = parcels[row.waybill] || Object.values(parcels)[0] || {};
  const list = Array.isArray(parcel.tracking) ? parcel.tracking : [];
  const info = parcel.additionalInfoTracking || {};
  const trackingUrl = (Array.isArray(info) ? info[0] : info)?.deliveryTrackingUrl;
  if (trackingUrl && trackingUrl !== row.tracking_url) await saveRow(row.tx_id, { tracking_url: trackingUrl });
  return applyTracking({ ...row, tracking_url: trackingUrl || row.tracking_url }, list.map(toEvent));
};

/** Webhook notification (already verified). */
const handleWebhook = async n => {
  const row = await getRowByPackage(n.package_id);
  if (!row) return false;
  await applyTracking(row, [toEvent(n.tracking || {})]);
  return true;
};

// ---------- Cancelled orders ----------

const cancelIfNeeded = async row => {
  if (!row.package_id || !['etykieta', 'blad'].includes(row.status)) return;
  const r = await furgonetka.cancelPackage(row.package_id).catch(e => ({ status: 'error', errors: [{ message: e.message }] }));
  const ok = r.status === 'successful';
  const events = [...(row.events || []), { state: 'canceled', status: 'anulowana', at: new Date().toISOString(), opis: 'Zamówienie anulowane – etykieta anulowana' }];
  await saveRow(row.tx_id, ok ? { status: 'anulowana', state: 'canceled', events } : { error: `Anulowanie etykiety: ${errorText(r.errors?.[0] ? { data: r } : null)}` });
  if (ok) await publishStatus(row.tx_id, await getRow(row.tx_id)).catch(() => null);
};

// ---------- Background work ----------

const CANCELLED = ['transition/cancel', 'transition/auto-cancel', 'transition/expire-payment'];

/** Paid orders waiting for shipping (last transition confirm-payment). */
const paidOrders = async () => {
  const ids = [];
  for (let page = 1; page <= 5; page++) {
    let r;
    try {
      r = await queryTransactions({ lastTransitions: 'transition/confirm-payment', perPage: 100, page });
    } catch (e) {
      if (e.status !== 400) throw e;
      r = await queryTransactions({ perPage: 100, page });
    }
    (r.data || [])
      .filter(t => t.attributes?.lastTransition === 'transition/confirm-payment')
      .forEach(t => ids.push(t.id));
    if (page >= (r.meta?.totalPages || 1)) break;
  }
  return ids;
};

let running = false;
const tick = async () => {
  if (running || !isShipmentsEnabled()) return;
  running = true;
  try {
    // New paid orders
    const paid = await paidOrders();
    const known = new Set((await query('SELECT tx_id FROM refume_shipments WHERE tx_id = ANY($1)', [paid])).rows.map(r => r.tx_id));
    for (const txId of paid.filter(id => !known.has(id))) {
      await processOrder(txId).catch(e => console.error(`[refume-przesylki] ${txId}: ${e.message}`));
    }
    // Retries
    const retry = await query(
      `SELECT tx_id FROM refume_shipments WHERE status IN ('nowa','blad','brak-danych-nadawcy')
       AND next_try_at IS NOT NULL AND next_try_at <= now() LIMIT 20`
    );
    for (const r of retry.rows) {
      await processOrder(r.tx_id).catch(e => console.error(`[refume-przesylki] ${r.tx_id}: ${e.message}`));
    }
    // Tracking fallback (webhook may be missing, e.g. on localhost)
    const active = await query(
      `SELECT * FROM refume_shipments WHERE status = ANY($1) AND updated_at < now() - interval '30 minutes' ORDER BY updated_at LIMIT 20`,
      [ACTIVE_STATUSES]
    );
    for (const row of active.rows) {
      await refreshTracking(row).catch(e => console.error(`[refume-przesylki] tracking ${row.tx_id}: ${e.message}`));
      // Cancelled orders whose parcel was never sent
      const { tx } = await loadTx(row.tx_id).catch(() => ({ tx: null }));
      if (tx && CANCELLED.includes(tx.attributes?.lastTransition)) {
        await cancelIfNeeded(await getRow(row.tx_id));
      }
    }
  } catch (e) {
    console.error('[refume-przesylki] tick failed:', e.message);
  } finally {
    running = false;
  }
};

let started = false;
const startShipments = () => {
  if (started) return;
  started = true;
  setTimeout(tick, 20 * 1000).unref?.();
  setInterval(tick, 60 * 1000).unref?.();
};

/** The buyer chose another pickup point (after the first one was refused). */
const changePoint = async (txId, code, name) => {
  const row = await getRow(txId);
  if (!row) throw Object.assign(new Error('No shipment.'), { status: 404 });
  if (row.waybill || !['zly-punkt', 'blad', 'brak-danych-nadawcy', 'nowa'].includes(row.status)) {
    throw Object.assign(new Error('The label is already made.'), { status: 409 });
  }
  if (row.package_id) await furgonetka.deletePackage(row.package_id).catch(() => null);
  await saveRow(txId, {
    point_code: String(code).trim().slice(0, 40),
    point_name: String(name || '').slice(0, 200),
    // Package with the old point is replaced
    package_id: null,
    order_uuid: null,
    status: row.status === 'zly-punkt' ? 'nowa' : row.status,
  });
  return processOrder(txId);
};

module.exports = {
  isShipmentsEnabled,
  changePoint,
  processOrder,
  refreshTracking,
  handleWebhook,
  getRow,
  tick,
  startShipments,
  buildPackage,
  toEvent,
  META_KEY,
  SENDER_KEY,
  CARRIER_LABEL,
};
