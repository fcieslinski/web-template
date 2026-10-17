/**
 * Refume: fixed shipping options the buyer picks from at checkout.
 *
 * DISPLAY ONLY. The real prices are set on the server in
 * server/api-util/refumeShipping.js — keep the two lists in sync.
 * Prices are in subunits (grosze).
 */
export const REFUME_SHIPPING_CARRIERS = [
  {
    key: 'inpost',
    label: 'InPost Paczkomat',
    priceInSubunits: 1399,
    needsPickupPoint: true,
    pickupPointLabel: 'Kod paczkomatu',
    pickupPointPlaceholder: 'np. KRA01M',
  },
  {
    key: 'dpd',
    label: 'Kurier DPD',
    priceInSubunits: 1499,
    needsPickupPoint: false,
  },
  {
    key: 'dpd-pickup',
    label: 'DPD Pickup',
    priceInSubunits: 999,
    needsPickupPoint: true,
    pickupPointLabel: 'Kod punktu DPD Pickup',
    pickupPointPlaceholder: 'np. PL12345',
  },
];

export const DEFAULT_SHIPPING_CARRIER = 'inpost';

export const getShippingCarrier = key => REFUME_SHIPPING_CARRIERS.find(c => c.key === key) || null;

/**
 * Label with price for a carrier option, e.g. "InPost Paczkomat – 13,99 zł".
 */
export const formatCarrierOption = (carrier, intl, currency = 'PLN') => {
  const price = intl.formatNumber(carrier.priceInSubunits / 100, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${carrier.label} – ${price}`;
};
