/**
 * Refume: buyer protection fee ("Ochrona Kupującego"), paid by the buyer on top of the
 * item price (shipping excluded). The seller receives the full listing price.
 * Keep in sync with src/util/refumeFee.js.
 *
 * This replaces the customer commission set in Sharetribe Console, so the price shown on
 * the site and the price charged always match.
 */
const REFUME_BUYER_FEE_PERCENT = 10;

module.exports = {
  REFUME_BUYER_FEE_PERCENT,
  REFUME_BUYER_COMMISSION: { percentage: REFUME_BUYER_FEE_PERCENT },
};
