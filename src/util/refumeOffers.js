/**
 * Refume: price offers (client helpers). Keep in sync with server/api-util/refumeOffers.js.
 * metadata.refumeOferty = [{ by, amount, currency, status, createdAt, decidedAt? }]
 */
export const OFFERS_KEY = 'refumeOferty';
export const ACCEPTED_OFFER_VALID_HOURS = 48;
export const MIN_OFFER_SHARE = 0.3;

export const getOffers = metadata =>
  Array.isArray(metadata?.[OFFERS_KEY]) ? metadata[OFFERS_KEY] : [];

export const getLastOffer = metadata => {
  const offers = getOffers(metadata);
  return offers.length ? offers[offers.length - 1] : null;
};

export const isAcceptedOfferValid = (offer, now = Date.now()) =>
  offer?.status === 'accepted' &&
  !!offer.decidedAt &&
  now - new Date(offer.decidedAt).getTime() <= ACCEPTED_OFFER_VALID_HOURS * 3600 * 1000;

export const formatPln = amount => `${(amount / 100).toFixed(2).replace('.', ',')} zł`;

/** Parses "120", "120,50" or "120.50" into subunits (grosze). Returns null if invalid. */
export const parsePlnToSubunits = value => {
  const normalized = String(value || '')
    .trim()
    .replace(/\s|zł/gi, '')
    .replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    return null;
  }
  return Math.round(parseFloat(normalized) * 100);
};

/** Returns an error message (Polish) or null. */
export const validateOfferInput = (amount, listingPriceAmount) => {
  if (!amount || amount <= 0) {
    return 'Wpisz kwotę, np. 120 albo 120,50.';
  }
  if (amount >= listingPriceAmount) {
    return 'Propozycja musi być niższa niż cena ogłoszenia.';
  }
  const min = Math.ceil(listingPriceAmount * MIN_OFFER_SHARE);
  if (amount < min) {
    return `Za niska propozycja. Minimum to ${formatPln(min)}.`;
  }
  return null;
};
