/**
 * Refume: "Poszukiwane" — perfumes people are looking for.
 *
 * Each user keeps the perfumes they wait for in their own profile privateData:
 *   privateData.refumePoszukiwane = [{ key, name, brand, perfumeId?, createdAt }]
 * (written by the user in the browser; only the user and the operator can read it).
 *
 * GET  /api/poszukiwane            public list grouped by perfume (with watcher counts)
 * POST /api/poszukiwane/powiadom   { listingId } — after a listing is published, email everyone
 *                                  waiting for that perfume (once per listing)
 */
const { getSdk, handleError } = require('../api-util/sdk');
const {
  isIntegrationApiConfigured,
  queryUsers,
  showListing,
  updateListing,
} = require('../api-util/refumeIntegrationApi');
const { sendEmail, scentRequestEmail } = require('../api-util/refumeEmail');

const KEY = 'refumePoszukiwane';
const CACHE_MS = 60 * 1000;
const MAX_USER_PAGES = 50; // up to 5000 users scanned
let cache = null;

const httpError = (status, message) =>
  Object.assign(new Error(message), { status, statusText: message, data: {} });

const normalize = s =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

// Same perfume → same key (keep in sync with src/ducks/refumeRequests.js)
const requestKey = ({ brand, name }) => {
  const b = normalize(brand);
  const n = normalize(name);
  return `n:${b && !` ${n} `.includes(` ${b} `) ? `${b} ${n}` : n}`;
};

// Everyone's requests, grouped by perfume. Cached for a minute.
const loadAll = async () => {
  if (cache && Date.now() - cache.at < CACHE_MS) {
    return cache.data;
  }
  const groups = new Map();
  for (let page = 1; page <= MAX_USER_PAGES; page++) {
    const result = await queryUsers({ page, perPage: 100 });
    (result.data || []).forEach(u => {
      const list = u.attributes?.profile?.privateData?.[KEY];
      if (!Array.isArray(list) || u.attributes?.banned || u.attributes?.deleted) return;
      list.forEach(r => {
        if (!r?.name) return;
        const key = requestKey(r);
        const g = groups.get(key) || {
          key,
          name: r.name,
          brand: r.brand || '',
          perfumeId: r.perfumeId || null,
          createdAt: r.createdAt,
          watchers: [],
        };
        if (r.createdAt && (!g.createdAt || r.createdAt < g.createdAt)) g.createdAt = r.createdAt;
        if (!g.perfumeId && r.perfumeId) g.perfumeId = r.perfumeId;
        if (!g.image && typeof r.image === 'string' && r.image.startsWith('https://')) g.image = r.image;
        if (g.watchers.some(w => w.id === u.id)) return; // same person twice
        g.watchers.push({
          id: u.id,
          email: u.attributes?.email,
          firstName: u.attributes?.profile?.firstName,
        });
        groups.set(key, g);
      });
    });
    const totalPages = result.meta?.totalPages || 1;
    if (page >= totalPages) break;
  }
  const data = Array.from(groups.values());
  cache = { at: Date.now(), data };
  return data;
};

const listRequests = (req, res) => {
  Promise.resolve()
    .then(async () => {
      if (!isIntegrationApiConfigured()) {
        throw httpError(500, 'Integration API is not configured.');
      }
      const all = await loadAll();
      // Public view: no emails, only counts
      const data = all
        .map(({ watchers, ...g }) => ({ ...g, count: watchers.length }))
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      res.status(200).json({ data });
    })
    .catch(e => handleError(res, e));
};

// Does this listing match the request? Same Fragella perfume, or every word of
// "brand + name" appears in the listing's brand + title.
const matches = (request, listing) => {
  const pd = listing.attributes.publicData || {};
  if (request.perfumeId && pd.fragellaId && request.perfumeId === pd.fragellaId) return true;
  const haystack = ` ${normalize(`${pd.marka || ''} ${listing.attributes.title}`)} `;
  const words = normalize(`${request.brand} ${request.name}`)
    .split(' ')
    .filter(w => w.length >= 2);
  return words.length > 0 && words.every(w => haystack.includes(` ${w} `));
};

const formatPrice = price =>
  price?.amount != null ? `${(price.amount / 100).toFixed(2).replace('.', ',')} zł` : '';

const notifyForListing = (req, res) => {
  const { listingId } = req.body || {};
  const sdk = getSdk(req, res);
  Promise.resolve()
    .then(async () => {
      if (!isIntegrationApiConfigured()) {
        throw httpError(500, 'Integration API is not configured.');
      }
      const listingUuid = typeof listingId === 'string' ? listingId : listingId?.uuid;
      if (!listingUuid) throw httpError(400, 'Missing listingId.');

      // Only the author can trigger it, and only for a published listing
      const me = (await sdk.currentUser.show()).data.data;
      const shown = await showListing({ id: listingUuid, include: 'author' });
      const listing = shown.data;
      if (listing.relationships?.author?.data?.id !== me.id.uuid) throw httpError(403, 'Not yours.');
      if (listing.attributes.state !== 'published') {
        return res.status(200).json({ data: { notified: 0 } });
      }
      if (listing.attributes.metadata?.poszukiwanePowiadomiono) {
        return res.status(200).json({ data: { notified: 0 } });
      }

      cache = null; // fresh data
      const all = await loadAll();
      const matched = all.filter(r => matches(r, listing));
      console.log(
        `[refume-requests] "${listing.attributes.title}": ${all.length} requests, ` +
          `${matched.length} match (${matched.map(r => r.name).join(', ') || '-'})`
      );
      const rootUrl = (process.env.REACT_APP_MARKETPLACE_ROOT_URL || '').replace(/\/$/, '');
      const listingUrl = `${rootUrl}/l/${listingUuid}`;
      const sent = new Set();
      for (const request of matched) {
        for (const w of request.watchers) {
          if (w.id === me.id.uuid) {
            console.log('[refume-requests]  skip: the seller is waiting for it themselves');
            continue;
          }
          if (!w.email || sent.has(w.id)) continue;
          sent.add(w.id);
          const content = scentRequestEmail({
            name: w.firstName,
            requestLabel: [request.brand, request.name].filter(Boolean).join(' '),
            listingTitle: listing.attributes.title,
            price: formatPrice(listing.attributes.price),
            listingUrl,
          });
          await sendEmail({ to: w.email, ...content })
            .then(r =>
              console.log(
                `[refume-requests]  email to ${w.email}: ${r?.skipped ? 'skipped (no RESEND_API_KEY)' : 'sent'}`
              )
            )
            .catch(e => console.error(`[refume-requests]  email to ${w.email} failed:`, e.message));
        }
      }
      await updateListing({ id: listingUuid, metadata: { poszukiwanePowiadomiono: true } }).catch(
        () => null
      );
      res.status(200).json({ data: { notified: sent.size } });
    })
    .catch(e => handleError(res, e));
};

module.exports = { listRequests, notifyForListing, normalizeRequestText: normalize };
