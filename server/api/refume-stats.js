/**
 * Refume: listing statistics — views and likes — stored in listing metadata:
 *   metadata.refumeWyswietlenia = { n, dni: { 'YYYY-MM-DD': count } }   (last 30 days)
 *   metadata.refumePolubienia   = { n, h: [hash, …] }                    (one hash per user)
 *
 * POST /api/statystyki/wyswietlenie { listingId }  count a view (one per visitor per 12 h)
 * POST /api/statystyki/polubienie   { listingId }  sync the like of the current user with
 *                                                  their favourites (privateData)
 *
 * Views are buffered in memory and written in batches every few minutes, because the
 * Integration API allows only ~30 writes per minute (dev/test).
 */
const crypto = require('crypto');
const { getSdk, handleError } = require('../api-util/sdk');
const {
  isIntegrationApiConfigured,
  showListing,
  updateListing,
} = require('../api-util/refumeIntegrationApi');

const VIEWS_KEY = 'refumeWyswietlenia';
const LIKES_KEY = 'refumePolubienia';
const FAVORITES_KEY = 'refumeUlubione';
const DEDUPE_MS = 12 * 60 * 60 * 1000;
const FLUSH_EVERY_MS = 3 * 60 * 1000;
const WRITE_GAP_MS = 2100;
const KEEP_DAYS = 30;
const MAX_LIKE_HASHES = 3000;
const MAX_BUFFERED_LISTINGS = 5000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuidOf = id => (typeof id === 'string' ? id : id?.uuid);
const httpError = (status, message) =>
  Object.assign(new Error(message), { status, statusText: message, data: {} });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const hash = text =>
  crypto
    .createHash('sha256')
    .update(text)
    .digest('hex')
    .slice(0, 16);
const today = () => new Date().toISOString().slice(0, 10);

// ---------- Views ----------

const seen = new Map(); // `${listingId}|${visitor}` -> timestamp
const buffer = new Map(); // listingId -> { day -> count }
let flushing = null;

const visitorKey = req => {
  const ip = (req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();
  return hash(`${ip}|${req.headers['user-agent'] || ''}`);
};

const pruneSeen = () => {
  const now = Date.now();
  for (const [key, at] of seen) {
    if (now - at > DEDUPE_MS) seen.delete(key);
  }
};

const addDays = (target, days) => {
  Object.entries(days).forEach(([day, count]) => {
    target[day] = (target[day] || 0) + count;
  });
  return target;
};

const flushViews = async () => {
  if (flushing) return flushing;
  if (!buffer.size || !isIntegrationApiConfigured()) return null;
  flushing = (async () => {
    const batch = Array.from(buffer.entries());
    buffer.clear();
    for (const [listingId, days] of batch) {
      try {
        const shown = await showListing({ id: listingId });
        const current = shown.data?.attributes?.metadata?.[VIEWS_KEY] || {};
        const merged = addDays({ ...(current.dni || {}) }, days);
        const keep = Object.keys(merged)
          .sort()
          .slice(-KEEP_DAYS)
          .reduce((acc, day) => ({ ...acc, [day]: merged[day] }), {});
        const added = Object.values(days).reduce((s, c) => s + c, 0);
        await updateListing({
          id: listingId,
          metadata: { [VIEWS_KEY]: { n: (current.n || 0) + added, dni: keep } },
        });
      } catch (e) {
        if (e.status !== 404 && e.status !== 403) {
          // Try again in the next round
          buffer.set(listingId, addDays(buffer.get(listingId) || {}, days));
        }
        console.error(`[refume-stats] views of ${listingId} not saved:`, e.message);
      }
      await sleep(WRITE_GAP_MS);
    }
  })().finally(() => {
    flushing = null;
  });
  return flushing;
};

const timer = setInterval(() => {
  pruneSeen();
  flushViews().catch(() => null);
}, FLUSH_EVERY_MS);
if (timer.unref) timer.unref();

['SIGINT', 'SIGTERM'].forEach(signal =>
  process.once(signal, () => {
    flushViews().catch(() => null);
  })
);

const recordView = (req, res) => {
  const listingId = uuidOf(req.body?.listingId);
  if (!listingId || !UUID_RE.test(listingId)) {
    return res.status(400).json({ error: 'Invalid listingId.' });
  }
  const key = `${listingId}|${visitorKey(req)}`;
  const counted = !seen.has(key) || Date.now() - seen.get(key) > DEDUPE_MS;
  if (counted && (buffer.has(listingId) || buffer.size < MAX_BUFFERED_LISTINGS)) {
    seen.set(key, Date.now());
    const days = buffer.get(listingId) || {};
    days[today()] = (days[today()] || 0) + 1;
    buffer.set(listingId, days);
  }
  res.status(200).json({ data: { counted } });
};

// ---------- Likes ----------

const likeQueues = new Map(); // listingId -> Promise (one write at a time per listing)

const syncLike = (req, res) => {
  const listingId = uuidOf(req.body?.listingId);
  const sdk = getSdk(req, res);
  Promise.resolve()
    .then(async () => {
      if (!listingId || !UUID_RE.test(listingId)) throw httpError(400, 'Invalid listingId.');
      if (!isIntegrationApiConfigured()) throw httpError(500, 'Integration API is not configured.');

      const me = (await sdk.currentUser.show()).data.data;
      const favorites = me.attributes?.profile?.privateData?.[FAVORITES_KEY];
      const likes = Array.isArray(favorites) && favorites.includes(listingId);
      const userHash = hash(`${me.id.uuid}|${listingId}`);

      const previous = likeQueues.get(listingId) || Promise.resolve();
      const job = previous
        .catch(() => null)
        .then(async () => {
          const shown = await showListing({ id: listingId });
          const current = shown.data?.attributes?.metadata?.[LIKES_KEY] || {};
          const hashes = Array.isArray(current.h) ? current.h : [];
          const has = hashes.includes(userHash);
          if (has === likes) return hashes.length;
          const next = likes
            ? [userHash, ...hashes].slice(0, MAX_LIKE_HASHES)
            : hashes.filter(h => h !== userHash);
          await updateListing({ id: listingId, metadata: { [LIKES_KEY]: { n: next.length, h: next } } });
          return next.length;
        });
      likeQueues.set(listingId, job);
      const count = await job.finally(() => {
        if (likeQueues.get(listingId) === job) likeQueues.delete(listingId);
      });
      res.status(200).json({ data: { likes: count } });
    })
    .catch(e => handleError(res, e));
};

module.exports = { recordView, syncLike, flushViews };
