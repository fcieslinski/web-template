/**
 * Refume: Vinted-style price offers inside an inquiry chat (default-purchase process).
 *
 * Offers live in the inquiry transaction's metadata (operator-only writes, so neither side
 * can fake an accepted price):
 *   metadata.refumeOferty = [{ by: 'customer'|'provider', amount, currency, status, createdAt, decidedAt? }]
 *   status: 'pending' | 'accepted' | 'rejected' | 'countered'
 *
 * When the last offer is accepted, the buyer pays that price with the existing
 * transition/request-payment-after-inquiry (line items are set privileged on the server).
 */
const sharetribeSdk = require('sharetribe-flex-sdk');
const { Money } = sharetribeSdk.types;

const OFFERS_KEY = 'refumeOferty';
const ACCEPTED_OFFER_VALID_HOURS = 48;
const MAX_OFFERS = 30;
const MIN_OFFER_SHARE = 0.3; // offers below 30% of the listing price are refused

const getOffers = metadata => (Array.isArray(metadata?.[OFFERS_KEY]) ? metadata[OFFERS_KEY] : []);

const getLastOffer = metadata => {
  const offers = getOffers(metadata);
  return offers.length ? offers[offers.length - 1] : null;
};

/** Last offer if it is accepted and still valid, else null. */
const getValidAcceptedOffer = (metadata, now = Date.now()) => {
  const last = getLastOffer(metadata);
  if (last?.status !== 'accepted' || !last.decidedAt) {
    return null;
  }
  const ageMs = now - new Date(last.decidedAt).getTime();
  return ageMs <= ACCEPTED_OFFER_VALID_HOURS * 3600 * 1000 ? last : null;
};

/** Client must never set the offer price itself. */
const stripOfferPrice = orderData => {
  if (!orderData) {
    return orderData;
  }
  const { refumeOfferPrice, ...rest } = orderData;
  return rest;
};

/**
 * Returns orderData with the accepted offer price (server-trusted) when the transaction
 * has a valid accepted offer for this listing. Quantity is forced to 1.
 */
const withAcceptedOfferPrice = (orderData, transactionMetadata, listing) => {
  const clean = stripOfferPrice(orderData) || {};
  const offer = getValidAcceptedOffer(transactionMetadata);
  const currency = listing?.attributes?.price?.currency;
  if (!offer || !currency || offer.currency !== currency) {
    return clean;
  }
  return {
    ...clean,
    stockReservationQuantity: 1,
    refumeOfferPrice: new Money(offer.amount, currency),
  };
};

/**
 * Validates an offer amount against the listing price. Returns an error message or null.
 */
const validateOfferAmount = (amount, listingPrice) => {
  if (!Number.isInteger(amount) || amount <= 0) {
    return 'Invalid amount.';
  }
  if (!listingPrice?.amount) {
    return 'Listing has no price.';
  }
  if (amount >= listingPrice.amount) {
    return 'Offer must be lower than the listing price.';
  }
  if (amount < Math.ceil(listingPrice.amount * MIN_OFFER_SHARE)) {
    return 'Offer is too low.';
  }
  return null;
};

/**
 * Applies a participant's action to the offer list. Throws { status, message } on invalid moves.
 * @param {Array} offers existing offers
 * @param {Object} action { role, type: 'offer'|'accept'|'reject'|'counter', amount?, currency, now }
 * @returns {Array} new offers list
 */
const applyOfferAction = (offers, action) => {
  const { role, type, amount, currency, now = new Date().toISOString() } = action;
  const fail = message => {
    const e = new Error(message);
    e.status = 409;
    throw e;
  };
  const last = offers.length ? offers[offers.length - 1] : null;
  const lastIsPending = last?.status === 'pending';

  if (offers.length >= MAX_OFFERS && ['offer', 'counter'].includes(type)) {
    fail('Too many offers in this conversation.');
  }

  switch (type) {
    case 'offer': {
      // A buyer starts (or restarts) negotiation when nothing is pending.
      if (role !== 'customer') fail('Only the buyer can start an offer.');
      if (lastIsPending) fail('An offer is already waiting for an answer.');
      return [...offers, { by: role, amount, currency, status: 'pending', createdAt: now }];
    }
    case 'accept':
    case 'reject':
    case 'counter': {
      if (!lastIsPending) fail('There is no offer waiting for an answer.');
      if (last.by === role) fail('You cannot answer your own offer.');
      const decided = {
        ...last,
        status: type === 'accept' ? 'accepted' : type === 'reject' ? 'rejected' : 'countered',
        decidedAt: now,
      };
      const rest = [...offers.slice(0, -1), decided];
      return type === 'counter'
        ? [...rest, { by: role, amount, currency, status: 'pending', createdAt: now }]
        : rest;
    }
    default:
      fail('Unknown action.');
  }
  return offers;
};

module.exports = {
  OFFERS_KEY,
  ACCEPTED_OFFER_VALID_HOURS,
  MIN_OFFER_SHARE,
  getOffers,
  getLastOffer,
  getValidAcceptedOffer,
  stripOfferPrice,
  withAcceptedOfferPrice,
  validateOfferAmount,
  applyOfferAction,
};
