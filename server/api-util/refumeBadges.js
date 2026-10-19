/**
 * Refume: seller badges, computed from the seller's real order history.
 * Keep the thresholds in sync with src/util/refumeBadges.js (texts shown to users).
 *
 * "Szybka wysyłka": in the seller's recent paid orders (min. 3), at least 80% were marked
 * as sent within 24 hours of payment. Orders still not sent after 24 h, and orders cancelled
 * because they weren't sent, count as slow.
 *
 * "Top sprzedawca":
 *   - at least 10 completed sales,
 *   - at least 5 reviews with an average of 4.7 or more,
 *   - at most 5% of paid orders cancelled or disputed,
 *   - at least one sale in the last 90 days.
 */
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const RULES = {
  fastShipping: { hours: 24, minOrders: 3, minRatio: 0.8, lastOrders: 20, windowDays: 180 },
  topSeller: { minSales: 10, minReviews: 5, minRating: 4.7, maxProblemRatio: 0.05, activeDays: 90 },
};

const PAID = ['transition/confirm-payment'];
const SENT = ['transition/mark-delivered', 'transition/operator-mark-delivered'];
const COMPLETED = [
  'transition/mark-received',
  'transition/mark-received-from-purchased',
  'transition/auto-mark-received',
  'transition/mark-received-from-disputed',
];
const CANCELLED = [
  'transition/cancel',
  'transition/auto-cancel',
  'transition/cancel-from-disputed',
  'transition/auto-cancel-from-disputed',
];
const DISPUTED = ['transition/dispute', 'transition/operator-dispute'];

const firstAt = (transitions, names) => {
  const t = transitions.find(tr => names.includes(tr.transition));
  return t ? new Date(t.createdAt).getTime() : null;
};

/**
 * @param {Array<Object>} transactions Integration API transaction resources (seller = provider)
 * @param {Array<Object>} reviews Integration API review resources of those transactions
 * @param {number} now
 */
const computeBadges = (transactions, reviews, now = Date.now()) => {
  const orders = transactions
    .map(tx => {
      const transitions = tx.attributes?.transitions || [];
      const paidAt = firstAt(transitions, PAID);
      if (!paidAt) return null; // inquiry or unpaid checkout
      return {
        paidAt,
        sentAt: firstAt(transitions, SENT),
        completedAt: firstAt(transitions, COMPLETED),
        cancelled: !!firstAt(transitions, CANCELLED),
        disputed: !!firstAt(transitions, DISPUTED),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.paidAt - a.paidAt);

  // --- Fast shipping ---
  const fs = RULES.fastShipping;
  const evaluable = orders
    .filter(o => now - o.paidAt <= fs.windowDays * DAY)
    .filter(o => o.sentAt || o.cancelled || now - o.paidAt > fs.hours * HOUR) // skip still-fresh orders
    .slice(0, fs.lastOrders);
  const fast = evaluable.filter(o => o.sentAt && o.sentAt - o.paidAt <= fs.hours * HOUR);
  const sentTimes = evaluable.filter(o => o.sentAt).map(o => (o.sentAt - o.paidAt) / HOUR);
  const avgSendHours = sentTimes.length
    ? Math.round((sentTimes.reduce((s, h) => s + h, 0) / sentTimes.length) * 10) / 10
    : null;
  const fastShipping =
    evaluable.length >= fs.minOrders && fast.length / evaluable.length >= fs.minRatio;

  // --- Top seller ---
  const ts = RULES.topSeller;
  const completed = orders.filter(o => o.completedAt);
  const problems = orders.filter(o => o.cancelled || o.disputed);
  const ratings = reviews
    .filter(r => r.attributes?.type === 'ofProvider' && r.attributes?.state === 'public')
    .map(r => r.attributes.rating)
    .filter(r => Number.isFinite(r));
  const avgRating = ratings.length
    ? Math.round((ratings.reduce((s, r) => s + r, 0) / ratings.length) * 100) / 100
    : null;
  const lastSaleAt = completed.length ? Math.max(...completed.map(o => o.completedAt)) : null;
  const topSeller =
    completed.length >= ts.minSales &&
    ratings.length >= ts.minReviews &&
    avgRating >= ts.minRating &&
    (orders.length ? problems.length / orders.length : 0) <= ts.maxProblemRatio &&
    !!lastSaleAt &&
    now - lastSaleAt <= ts.activeDays * DAY;

  return {
    szybkaWysylka: fastShipping,
    topSprzedawca: topSeller,
    statystyki: {
      sprzedane: completed.length,
      oplacone: orders.length,
      problemy: problems.length,
      wysylkiOcenione: evaluable.length,
      wysylkiSzybkie: fast.length,
      srednioGodzinDoWysylki: avgSendHours,
      ocena: avgRating,
      opinie: ratings.length,
    },
  };
};

module.exports = { computeBadges, BADGE_RULES: RULES };
