const {
  calculateQuantityFromDates,
  calculateQuantityFromHours,
  getProviderCommissionMaybe,
  getCustomerCommissionMaybe,
} = require('./lineItemHelpers');
const { REFUME_BUYER_COMMISSION } = require('./refumeFee');
const { types } = require('sharetribe-flex-sdk');
const { Money } = types;
const { getCarrierShippingFee, getShippingSetup } = require('./refumeShipping');
const {
  isVerifiedBundle,
  getBundleShippingSetup,
  bundleLineItems,
  DISCOUNT_LINE_ITEM,
} = require('./refumeBundles');

/**
 * Get quantity and add extra line-items that are related to delivery method
 *
 * @param {Object} orderData should contain stockReservationQuantity and deliveryMethod
 * @param {*} publicData should contain shipping prices
 * @param {*} currency should point to the currency of listing's price.
 */
const getItemQuantityAndLineItems = (orderData, publicData, currency) => {
  // Check delivery method and shipping prices
  const quantity = orderData ? orderData.stockReservationQuantity : null;
  const deliveryMethod = orderData && orderData.deliveryMethod;
  const isShipping = deliveryMethod === 'shipping';
  const isPickup = deliveryMethod === 'pickup';

  // Refume: the shipping fee comes from the marketplace's fixed price table by parcel
  // size (publicData.gabaryt) and the carrier the buyer chose, limited to the carriers the
  // seller enabled (publicData.shippingCarriers). Seller-set shipping prices
  // (publicData.shippingPriceInSubunits*) are no longer used.
  // Refume: a bundle travels as one parcel (biggest size, carriers every item allows)
  const bundle = isVerifiedBundle(orderData?.refumeBundle) ? orderData.refumeBundle : null;
  const { size, carriers } = bundle
    ? getBundleShippingSetup([publicData, ...bundle.items.map(i => i.publicData)])
    : getShippingSetup(publicData);
  const shippingFee = isShipping
    ? getCarrierShippingFee({
        carrier: orderData && orderData.shippingCarrier,
        size,
        enabledCarriers: carriers,
        currency,
      })
    : null;

  // Add line-item for given delivery method.
  // Note: by default, pickup considered as free and, therefore, we don't add pickup fee line-item
  const deliveryLineItem = !!shippingFee
    ? [
        {
          code: 'line-item/shipping-fee',
          unitPrice: shippingFee,
          quantity: 1,
          // Refume buys the label (one Furgonetka account), so the fee stays with Refume and
          // isn't paid out to the seller
          includeFor: ['customer'],
        },
      ]
    : [];

  return {
    quantity,
    extraLineItems: deliveryLineItem,
    bundleItems: bundle ? bundleLineItems(bundle) : [],
    bundleDiscountPercent: bundle?.discountPercent || 0,
  };
};

const getOfferQuantityAndLineItems = orderData => {
  return { quantity: 1, extraLineItems: [] };
};

/**
 * Get quantity for digital items. The quantity is always 1, you can't have multiples of digital files.
 * @param {Object} orderData
 */
const getDigitalItemQuantityAndLineItems = orderData => {
  return { quantity: 1, extraLineItems: [] };
};

/**
 * Get quantity for fixed bookings with seats.
 * @param {Object} orderData
 * @param {number} [orderData.seats]
 */
const getFixedQuantityAndLineItems = orderData => {
  const { seats } = orderData || {};
  const hasSeats = !!seats;
  // If there are seats, the quantity is split to factors: units and seats.
  // E.g. 1 session x 2 seats (aka unit price is multiplied by 2)
  return hasSeats ? { units: 1, seats, extraLineItems: [] } : { quantity: 1, extraLineItems: [] };
};

/**
 * Get quantity for arbitrary units for time-based bookings.
 *
 * @param {Object} orderData
 * @param {string} orderData.bookingStart
 * @param {string} orderData.bookingEnd
 * @param {number} [orderData.seats]
 */
const getHourQuantityAndLineItems = orderData => {
  const { bookingStart, bookingEnd, seats } = orderData || {};
  const hasSeats = !!seats;
  const units =
    bookingStart && bookingEnd ? calculateQuantityFromHours(bookingStart, bookingEnd) : null;

  // If there are seats, the quantity is split to factors: units and seats.
  // E.g. 3 hours x 2 seats (aka unit price is multiplied by 6)
  return hasSeats ? { units, seats, extraLineItems: [] } : { quantity: units, extraLineItems: [] };
};

/**
 * Calculate quantity based on days or nights between given bookingDates.
 *
 * @param {Object} orderData
 * @param {string} orderData.bookingStart
 * @param {string} orderData.bookingEnd
 * @param {number} [orderData.seats]
 * @param {'line-item/day' | 'line-item/night'} code
 */
const getDateRangeQuantityAndLineItems = (orderData, code) => {
  const { bookingStart, bookingEnd, seats } = orderData;
  const hasSeats = !!seats;
  const units =
    bookingStart && bookingEnd ? calculateQuantityFromDates(bookingStart, bookingEnd, code) : null;

  // If there are seats, the quantity is split to factors: units and seats.
  // E.g. 3 nights x 4 seats (aka unit price is multiplied by 12)
  return hasSeats ? { units, seats, extraLineItems: [] } : { quantity: units, extraLineItems: [] };
};

/**
 * Returns collection of lineItems (max 50)
 *
 * All the line-items dedicated to _customer_ define the "payin total".
 * Similarly, the sum of all the line-items included for _provider_ create "payout total".
 * Platform gets the commission, which is the difference between payin and payout totals.
 *
 * Each line items has following fields:
 * - `code`: string, mandatory, indentifies line item type (e.g. \"line-item/cleaning-fee\"), maximum length 64 characters.
 * - `unitPrice`: money, mandatory
 * - `lineTotal`: money
 * - `quantity`: number
 * - `percentage`: number (e.g. 15.5 for 15.5%)
 * - `seats`: number
 * - `units`: number
 * - `includeFor`: array containing strings \"customer\" or \"provider\", default [\":customer\"  \":provider\" ]
 *
 * Line item must have either `quantity` or `percentage` or both `seats` and `units`.
 *
 * `includeFor` defines commissions. Customer commission is added by defining `includeFor` array `["customer"]` and provider commission by `["provider"]`.
 *
 * @param {Object} listing
 * @param {Object} orderData
 * @param {string} [orderData.priceVariantName] - The name of the price variant (potentially used with bookable unit types)
 * @param {Money} [orderData.offer] - The offer for the offer (if transition intent is "make-offer")
 * @param {Object} providerCommission
 * @param {Object} customerCommission
 * @returns {Array} lineItems
 */
exports.transactionLineItems = (listing, orderData, providerCommission, customerCommission) => {
  const publicData = listing.attributes.publicData;
  // Note: the unitType needs to be one of the following:
  // day, night, hour, fixed, or item (these are related to payment processes)
  const { unitType, priceVariants, priceVariationsEnabled } = publicData;

  const isBookable = ['day', 'night', 'hour', 'fixed'].includes(unitType);
  const isNegotiationUnitType = ['offer', 'request'].includes(unitType);
  const priceAttribute = listing.attributes.price;
  const currency = priceAttribute?.currency || orderData.currency;

  const { priceVariantName, offer, refumeOfferPrice } = orderData || {};
  const priceVariantConfig = priceVariants
    ? priceVariants.find(pv => pv.name === priceVariantName)
    : null;
  const { priceInSubunits } = priceVariantConfig || {};
  const isPriceInSubunitsValid = Number.isInteger(priceInSubunits) && priceInSubunits >= 0;

  const unitPrice =
    isBookable && priceVariationsEnabled && isPriceInSubunitsValid
      ? new Money(priceInSubunits, currency)
      : offer instanceof Money && isNegotiationUnitType
      ? offer
      : refumeOfferPrice instanceof Money && unitType === 'item'
      ? refumeOfferPrice // Refume: accepted price offer, set only by the server (refumeOffers.js)
      : priceAttribute;

  /**
   * Pricing starts with order's base price:
   * Listing's price is related to a single unit. It needs to be multiplied by quantity
   *
   * Initial line-item needs therefore:
   * - code (based on unitType)
   * - unitPrice
   * - quantity
   * - includedFor
   */

  const code = `line-item/${unitType}`;

  // Here "extra line-items" means line-items that are tied to unit type
  // E.g. by default, "shipping-fee" is tied to 'item' aka buying products.
  const quantityAndExtraLineItems =
    unitType === 'item'
      ? getItemQuantityAndLineItems(orderData, publicData, currency)
      : unitType === 'file'
      ? getDigitalItemQuantityAndLineItems(orderData)
      : unitType === 'fixed'
      ? getFixedQuantityAndLineItems(orderData)
      : unitType === 'hour'
      ? getHourQuantityAndLineItems(orderData)
      : ['day', 'night'].includes(unitType)
      ? getDateRangeQuantityAndLineItems(orderData, code)
      : isNegotiationUnitType
      ? getOfferQuantityAndLineItems(orderData)
      : {};

  const {
    quantity,
    units,
    seats,
    extraLineItems,
    bundleItems = [],
    bundleDiscountPercent = 0,
  } = quantityAndExtraLineItems;

  // Throw error if there is no quantity information given
  if (!quantity && !(units && seats)) {
    const missingFields = [];

    if (!quantity) missingFields.push('quantity');
    if (!units) missingFields.push('units');
    if (!seats) missingFields.push('seats');

    const message = `Error: orderData is missing the following information: ${missingFields.join(
      ', '
    )}. Quantity or either units & seats is required.`;

    const error = new Error(message);
    error.status = 400;
    error.statusText = message;
    error.data = {};
    throw error;
  }

  /**
   * If you want to use pre-defined component and translations for printing the lineItems base price for order,
   * you should use one of the codes:
   * line-item/night, line-item/day, line-item/hour or line-item/item.
   *
   * Pre-definded commission components expects line item code to be one of the following:
   * 'line-item/provider-commission', 'line-item/customer-commission'
   *
   * By default OrderBreakdown prints line items inside LineItemUnknownItemsMaybe if the lineItem code is not recognized. */

  const quantityOrSeats = !!units && !!seats ? { units, seats } : { quantity };
  const order = {
    code,
    unitPrice,
    ...quantityOrSeats,
    includeFor: ['customer', 'provider'],
  };

  // Let's keep the base price (order) as first line item and provider and customer commissions as last.
  // Note: the order matters only if OrderBreakdown component doesn't recognize line-item.
  // Refume: seller's bundle discount ("rabat za zestaw") on the items, never on shipping
  const itemsSum = [order, ...bundleItems].reduce(
    (sum, item) => sum + item.unitPrice.amount * (item.quantity || 1),
    0
  );
  const discountAmount =
    bundleItems.length && bundleDiscountPercent > 0
      ? Math.round((itemsSum * bundleDiscountPercent) / 100)
      : 0;
  const discountLineItems = discountAmount
    ? [
        {
          code: DISCOUNT_LINE_ITEM,
          unitPrice: new Money(-discountAmount, currency),
          quantity: 1,
          includeFor: ['customer', 'provider'],
        },
      ]
    : [];
  // Commissions are counted from all items of a bundle after the discount (never from shipping)
  const itemsTotal = bundleItems.length
    ? {
        code,
        unitPrice: new Money(itemsSum - discountAmount, currency),
        quantity: 1,
        includeFor: ['customer', 'provider'],
      }
    : order;
  if (bundleItems.length && quantity !== 1) {
    const error = new Error('A bundle can contain one piece of each item.');
    Object.assign(error, { status: 400, statusText: error.message, data: {} });
    throw error;
  }
  const lineItems = [
    order,
    ...bundleItems,
    ...discountLineItems,
    ...extraLineItems,
    ...getProviderCommissionMaybe(providerCommission, itemsTotal, currency),
    // Refume: fixed buyer protection fee instead of Console's customer commission
    ...getCustomerCommissionMaybe(REFUME_BUYER_COMMISSION, itemsTotal, currency),
  ];

  return lineItems;
};
