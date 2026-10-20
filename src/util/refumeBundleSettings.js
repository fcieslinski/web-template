/**
 * Refume: seller's bundle ("zestaw") settings in user publicData.refumeZestawy:
 *   { wylaczone?: true, rabaty: [{ od: 2, procent: 5 }, { od: 3, procent: 10 }] }
 * "od" = from how many items in one order, "procent" = discount on the items.
 * Keep in sync with server/api-util/refumeBundleSettings.js.
 */
const MAX_TIERS = 4;
const MIN_ITEMS = 2;
const MAX_ITEMS = 10;
const MAX_PERCENT = 50;

const cleanBundleSettings = value => {
  const v = value && typeof value === 'object' ? value : {};
  const seen = new Set();
  const rabaty = (Array.isArray(v.rabaty) ? v.rabaty : [])
    .map(t => ({ od: Number(t?.od), procent: Number(t?.procent) }))
    .filter(
      t =>
        Number.isInteger(t.od) &&
        Number.isInteger(t.procent) &&
        t.od >= MIN_ITEMS &&
        t.od <= MAX_ITEMS &&
        t.procent >= 1 &&
        t.procent <= MAX_PERCENT
    )
    .sort((a, b) => a.od - b.od)
    .filter(t => (seen.has(t.od) ? false : seen.add(t.od)))
    .slice(0, MAX_TIERS);
  return { wylaczone: v.wylaczone === true, rabaty };
};

/** Discount percent for an order with itemCount items (the best tier reached). */
const bundleDiscountPercent = (settings, itemCount) => {
  const { rabaty } = cleanBundleSettings(settings);
  return rabaty.filter(t => itemCount >= t.od).reduce((max, t) => Math.max(max, t.procent), 0);
};

export { cleanBundleSettings, bundleDiscountPercent, MAX_TIERS, MIN_ITEMS, MAX_ITEMS, MAX_PERCENT };

/** "2 rzeczy −5%, 3+ rzeczy −10%" */
export const describeBundleDiscounts = settings => {
  const { rabaty } = cleanBundleSettings(settings);
  return rabaty
    .map((t, i) => {
      const last = i === rabaty.length - 1;
      return `${t.od}${last ? '+' : ''} rzeczy −${t.procent}%`;
    })
    .join(', ');
};
