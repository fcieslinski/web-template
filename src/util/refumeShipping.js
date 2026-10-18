/**
 * Refume: fixed shipping options by parcel size.
 *
 * DISPLAY ONLY. The real prices are set on the server in
 * server/api-util/refumeShipping.js — keep the two tables in sync.
 * Prices are in subunits (grosze).
 *
 * Listing public data:
 * - gabaryt: 'S' | 'M' | 'L' — parcel size chosen by the seller
 * - shippingCarriers: carrier keys the seller is willing to use (at least one)
 */

// Carrier details, independent of size
export const REFUME_CARRIERS = {
  orlen: {
    key: 'orlen',
    label: 'Orlen Paczka',
    needsPickupPoint: true,
    pickupPointLabel: 'Kod punktu Orlen Paczka',
    pickupPointPlaceholder: 'np. kod automatu lub punktu',
  },
  inpost: {
    key: 'inpost',
    label: 'InPost Paczkomat',
    needsPickupPoint: true,
    pickupPointLabel: 'Kod paczkomatu',
    pickupPointPlaceholder: 'np. KRA01M',
  },
  'dpd-pickup': {
    key: 'dpd-pickup',
    label: 'DPD Pickup',
    needsPickupPoint: true,
    pickupPointLabel: 'Kod punktu DPD Pickup',
    pickupPointPlaceholder: 'np. PL12345',
  },
  pocztex: {
    key: 'pocztex',
    label: 'Pocztex Kurier',
    needsPickupPoint: false,
  },
};

// Prices per parcel size, in the order they are shown
export const REFUME_SHIPPING_PRICES = {
  S: { orlen: 799, inpost: 1299, 'dpd-pickup': 899, pocztex: 1399 },
  M: { orlen: 899, inpost: 1299, 'dpd-pickup': 899, pocztex: 1399 },
  L: { pocztex: 1499 },
};

export const REFUME_PARCEL_SIZES = [
  { key: 'S', label: 'S – mały' },
  { key: 'M', label: 'M – średni' },
  { key: 'L', label: 'L – duży' },
];

/** Carrier details by key, or null. */
export const getShippingCarrier = key => REFUME_CARRIERS[key] || null;

/** All carriers available for a parcel size, with prices: [{ ...carrier, priceInSubunits }] */
export const getCarriersForSize = size =>
  Object.entries(REFUME_SHIPPING_PRICES[size] || {}).map(([key, priceInSubunits]) => ({
    ...REFUME_CARRIERS[key],
    priceInSubunits,
  }));

/**
 * Carriers the buyer can pick for a listing: available for its size AND enabled by the seller.
 * @param {Object} publicData listing public data
 */
// Listings created before parcel sizes existed: assume M and every carrier for it.
// Keep in sync with server/api-util/refumeShipping.js.
export const DEFAULT_PARCEL_SIZE = 'M';

export const getShippingSetup = publicData => {
  const { gabaryt, shippingCarriers } = publicData || {};
  const size = REFUME_SHIPPING_PRICES[gabaryt] ? gabaryt : DEFAULT_PARCEL_SIZE;
  const carriers =
    Array.isArray(shippingCarriers) && shippingCarriers.length
      ? shippingCarriers
      : Object.keys(REFUME_SHIPPING_PRICES[size]);
  return { size, carriers };
};

export const getAvailableCarriers = publicData => {
  const { size, carriers } = getShippingSetup(publicData);
  return getCarriersForSize(size).filter(c => carriers.includes(c.key));
};

/** "Orlen Paczka – 7,99 zł" */
export const formatCarrierOption = (carrier, intl, currency = 'PLN') => {
  const price = intl.formatNumber(carrier.priceInSubunits / 100, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${carrier.label} – ${price}`;
};
