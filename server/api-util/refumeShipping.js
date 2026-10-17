/**
 * Refume: fixed shipping options chosen by the buyer at checkout.
 *
 * Prices are set by the marketplace (not by sellers) and are the single source of truth
 * for the shipping fee line item. The client shows the same list for display only
 * (src/util/refumeShipping.js) — keep the two in sync when changing prices.
 *
 * Prices are in subunits (grosze). One shipping fee is charged per order.
 */
const { types } = require('sharetribe-flex-sdk');
const { Money } = types;

const REFUME_SHIPPING_CARRIERS = {
  inpost: { label: 'InPost Paczkomat', priceInSubunits: 1399, needsPickupPoint: true },
  dpd: { label: 'Kurier DPD', priceInSubunits: 1499, needsPickupPoint: false },
  'dpd-pickup': { label: 'DPD Pickup', priceInSubunits: 999, needsPickupPoint: true },
};

const badRequest = message => {
  const error = new Error(message);
  error.status = 400;
  error.statusText = message;
  error.data = {};
  return error;
};

/**
 * Shipping fee for the carrier the buyer picked.
 * Throws a 400 error for an unknown carrier so that an order can't go through
 * without a valid, marketplace-priced shipping option.
 *
 * @param {string} carrier one of the keys of REFUME_SHIPPING_CARRIERS
 * @param {string} currency listing currency, e.g. 'PLN'
 * @returns {Money}
 */
const getCarrierShippingFee = (carrier, currency) => {
  const option = REFUME_SHIPPING_CARRIERS[carrier];
  if (!option) {
    throw badRequest(`Unknown shipping carrier: ${carrier}`);
  }
  return new Money(option.priceInSubunits, currency);
};

module.exports = { REFUME_SHIPPING_CARRIERS, getCarrierShippingFee };
