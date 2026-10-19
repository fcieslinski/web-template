/**
 * Refume: seller badges ("Szybka wysyłka", "Top sprzedawca").
 *
 * The result is stored in the seller's profile metadata (users can't edit metadata):
 *   metadata.refumeOdznaki = { szybkaWysylka, topSprzedawca, statystyki, przeliczono }
 *
 * GET  /api/odznaki?userId=…   badges of a user; recomputed when older than 6 hours
 * POST /api/odznaki/przelicz   { txId } — after an order step (e.g. "wysłano"); recomputes the
 *                              seller of that transaction. Caller must be a party of it.
 */
const { getSdk, handleError } = require('../api-util/sdk');
const {
  isIntegrationApiConfigured,
  queryTransactions,
  showUser,
  updateUserProfile,
} = require('../api-util/refumeIntegrationApi');
const { computeBadges } = require('../api-util/refumeBadges');

const KEY = 'refumeOdznaki';
const STALE_MS = 6 * 60 * 60 * 1000;
const MIN_RECOMPUTE_GAP_MS = 30 * 1000;
const CACHE_MS = 5 * 60 * 1000;
const MAX_PAGES = 5; // up to 500 orders per seller

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuidOf = id => (typeof id === 'string' ? id : id?.uuid);

const httpError = (status, message) =>
  Object.assign(new Error(message), { status, statusText: message, data: {} });

const cache = new Map(); // userId -> { at, badges }
const lastRun = new Map(); // userId -> timestamp of last recompute
const running = new Map(); // userId -> Promise

const OVERRIDE_KEY = 'refumeOdznakiReczne';
const BADGE_KEYS = ['szybkaWysylka', 'topSprzedawca'];
const overrides = new Map(); // userId -> manual overrides from a moderator

// Moderator overrides win: 'tak' = given, 'nie' = taken away, missing = automatic
const applyOverrides = (badges, override) => {
  const result = { ...(badges || {}) };
  BADGE_KEYS.forEach(key => {
    if (override?.[key] === 'tak') result[key] = true;
    if (override?.[key] === 'nie') result[key] = false;
  });
  return result;
};

const publicShape = (badges, userId) => {
  const b = applyOverrides(badges, userId ? overrides.get(userId) : null);
  return {
    szybkaWysylka: !!b.szybkaWysylka,
    topSprzedawca: !!b.topSprzedawca,
    statystyki: badges?.statystyki || {},
    przeliczono: badges?.przeliczono || null,
  };
};

const recompute = userId => {
  if (running.has(userId)) return running.get(userId);
  const job = (async () => {
    lastRun.set(userId, Date.now());
    const transactions = [];
    const reviews = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const result = await queryTransactions({
        providerId: userId,
        include: 'reviews',
        perPage: 100,
        page,
      });
      transactions.push(...(result.data || []));
      reviews.push(...(result.included || []).filter(r => r.type === 'review'));
      if (page >= (result.meta?.totalPages || 1)) break;
    }
    const computed = computeBadges(transactions, reviews);
    const badges = { ...computed, przeliczono: new Date().toISOString() };

    const previous = cache.get(userId)?.badges;
    const changed =
      !previous ||
      JSON.stringify({ ...previous, przeliczono: null }) !==
        JSON.stringify({ ...badges, przeliczono: null }) ||
      !previous.przeliczono ||
      Date.now() - new Date(previous.przeliczono).getTime() > STALE_MS;
    if (changed) {
      await updateUserProfile({ id: userId, metadata: { [KEY]: badges } });
    }
    cache.set(userId, { at: Date.now(), badges });
    console.log(
      `[refume-badges] ${userId}: szybka=${badges.szybkaWysylka} top=${badges.topSprzedawca} ` +
        `(${transactions.length} tx)`
    );
    return badges;
  })().finally(() => running.delete(userId));
  running.set(userId, job);
  return job;
};

const loadStored = async userId => {
  const cached = cache.get(userId);
  if (cached && Date.now() - cached.at < CACHE_MS && overrides.has(userId)) return cached.badges;
  const shown = await showUser({ id: userId });
  const user = shown.data;
  if (!user || user.attributes?.banned || user.attributes?.deleted) {
    throw httpError(404, 'User not found.');
  }
  const badges = user.attributes?.profile?.metadata?.[KEY] || null;
  overrides.set(userId, user.attributes?.profile?.metadata?.[OVERRIDE_KEY] || null);
  cache.set(userId, { at: Date.now(), badges });
  return badges;
};

const getBadges = (req, res) => {
  const userId = String(req.query.userId || '');
  Promise.resolve()
    .then(async () => {
      if (!UUID_RE.test(userId)) throw httpError(400, 'Invalid userId.');
      if (!isIntegrationApiConfigured()) throw httpError(500, 'Integration API is not configured.');

      let badges = await loadStored(userId);
      const age = badges?.przeliczono ? Date.now() - new Date(badges.przeliczono).getTime() : Infinity;
      const recentlyRun = Date.now() - (lastRun.get(userId) || 0) < STALE_MS;
      if (age > STALE_MS && !recentlyRun) {
        badges = await recompute(userId).catch(e => {
          console.error('[refume-badges] recompute failed:', e.message);
          return badges;
        });
      }
      res.set('Cache-Control', 'no-store');
      res.status(200).json({ data: publicShape(badges, userId) });
    })
    .catch(e => handleError(res, e));
};

const recomputeForTransaction = (req, res) => {
  const txUuid = uuidOf(req.body?.txId);
  const sdk = getSdk(req, res);
  Promise.resolve()
    .then(async () => {
      if (!txUuid || !UUID_RE.test(txUuid)) throw httpError(400, 'Invalid txId.');
      if (!isIntegrationApiConfigured()) throw httpError(500, 'Integration API is not configured.');
      // Only parties of the transaction can see it through the Marketplace API
      const shown = await sdk.transactions.show({ id: txUuid, include: ['provider'] });
      const providerId = shown.data.data.relationships?.provider?.data?.id?.uuid;
      if (!providerId) throw httpError(404, 'Provider not found.');

      if (Date.now() - (lastRun.get(providerId) || 0) < MIN_RECOMPUTE_GAP_MS) {
        return res.status(200).json({ data: publicShape(cache.get(providerId)?.badges, providerId) });
      }
      const badges = await recompute(providerId);
      res.status(200).json({ data: publicShape(badges, providerId) });
    })
    .catch(e => handleError(res, e));
};

// For the moderator panel: drop cached data after a manual change
const forgetUser = userId => {
  cache.delete(userId);
  overrides.delete(userId);
};

module.exports = { getBadges, recomputeForTransaction, forgetUser, OVERRIDE_KEY, BADGE_KEYS };
