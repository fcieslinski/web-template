/**
 * Refume: fixed shipping prices by parcel size and carrier.
 *
 * The seller picks the parcel size (gabaryt S / M / L) and which of the carriers
 * available for that size they are willing to use. The buyer picks one of those at
 * checkout. Prices are set by the marketplace, never by the seller or the buyer.
 *
 * This file is the single source of truth for the shipping fee line item. The client
 * shows the same table for display only (src/util/refumeShipping.js) — keep them in sync.
 *
 * Prices are in subunits (grosze). One shipping fee is charged per order.
 */
const { types } = require('sharetribe-flex-sdk');
const { Money } = types;

const REFUME_SHIPPING_PRICES = {
  S: { orlen: 799, inpost: 1299, 'dpd-pickup': 899, pocztex: 1399 },
  M: { orlen: 899, inpost: 1299, 'dpd-pickup': 899, pocztex: 1399 },
  L: { pocztex: 1499 },
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
 *
 * Throws a 400 error when the parcel size or carrier is unknown, or when the seller
 * hasn't enabled that carrier for the listing, so an order can't go through without a
 * valid, marketplace-priced shipping option.
 *
 * @param {Object} params
 * @param {string} params.carrier buyer's choice, e.g. 'inpost'
 * @param {string} params.size listing's parcel size: 'S' | 'M' | 'L'
 * @param {Array<string>?} params.enabledCarriers carriers the seller enabled for the listing
 * @param {string} params.currency listing currency, e.g. 'PLN'
 * @returns {Money}
 */
const getCarrierShippingFee = ({ carrier, size, enabledCarriers, currency }) => {
  const pricesForSize = REFUME_SHIPPING_PRICES[size];
  if (!pricesForSize) {
    throw badRequest(`Unknown parcel size: ${size}`);
  }
  const price = pricesForSize[carrier];
  if (price == null) {
    throw badRequest(`Shipping carrier ${carrier} is not available for parcel size ${size}`);
  }
  if (!Array.isArray(enabledCarriers) || !enabledCarriers.includes(carrier)) {
    throw badRequest(`Shipping carrier ${carrier} is not offered for this listing`);
  }
  return new Money(price, currency);
};

module.exports = { REFUME_SHIPPING_PRICES, getCarrierShippingFee };
