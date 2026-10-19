/**
 * Refume: price offers in the buyer–seller chat (see server/api-util/refumeOffers.js).
 *
 * POST /api/oferty/zloz       { listingId, amount }                 buyer makes an offer
 * POST /api/oferty/odpowiedz  { transactionId, action, amount? }     accept | reject | counter | propose
 *
 * Both sides act as themselves through the Marketplace API (their session cookie);
 * only the offer list in transaction metadata is written with the Integration API.
 * Each step also posts a chat message, so the other side gets Sharetribe's usual
 * new-message notification.
 */
const { getSdk, handleError } = require('../api-util/sdk');
const {
  isIntegrationApiConfigured,
  updateTransactionMetadata,
} = require('../api-util/refumeIntegrationApi');
const {
  OFFERS_KEY,
  ACCEPTED_OFFER_VALID_HOURS,
  getOffers,
  validateOfferAmount,
  applyOfferAction,
} = require('../api-util/refumeOffers');

const INQUIRE = 'transition/inquire';

const httpError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  error.statusText = message;
  error.data = {};
  return error;
};

const toHttpError = e =>
  e.status && !e.data ? Object.assign(e, { statusText: e.message, data: {} }) : e;

const formatPln = amount =>
  `${(amount / 100).toFixed(2).replace('.', ',')} zł`;

const uuidOf = id => (typeof id === 'string' ? id : id?.uuid);

const offerMessage = (type, amount) => {
  switch (type) {
    case 'offer':
      return `💬 Propozycja ceny: ${formatPln(amount)}`;
    case 'counter':
      return `💬 Kontroferta: ${formatPln(amount)}`;
    case 'propose':
      return `💬 Propozycja ceny: ${formatPln(amount)}`;
    case 'accept':
      return `✅ Propozycja ${formatPln(amount)} zaakceptowana. Kupujący może teraz kupić za tę cenę (ważne ${ACCEPTED_OFFER_VALID_HOURS} h).`;
    case 'reject':
      return `❌ Propozycja ${formatPln(amount)} odrzucona.`;
    default:
      return '';
  }
};

const requireConfigured = () => {
  if (!isIntegrationApiConfigured()) {
    throw httpError(500, 'Integration API is not configured.');
  }
};

const saveOffersAndNotify = async (sdk, transactionId, offers, type, amount) => {
  await updateTransactionMetadata({
    id: uuidOf(transactionId),
    metadata: { [OFFERS_KEY]: offers },
  });
  // The chat message is informative; the offer is already saved if it fails.
  await sdk.messages
    .send({ transactionId, content: offerMessage(type, amount) })
    .catch(e => console.error('[refume-offers] message failed:', e.message));
};

const findOpenInquiry = async (sdk, listingUuid) => {
  const response = await sdk.transactions.query({
    only: 'order',
    lastTransitions: [INQUIRE],
    include: ['listing'],
    perPage: 100,
  });
  return (response.data.data || []).find(
    tx => tx.relationships?.listing?.data?.id?.uuid === listingUuid
  );
};

const makeOffer = (req, res) => {
  const { listingId, amount } = req.body || {};
  const sdk = getSdk(req, res);

  Promise.resolve()
    .then(async () => {
      requireConfigured();
      const listingUuid = uuidOf(listingId);
      if (!listingUuid) {
        throw httpError(400, 'Missing listingId.');
      }
      const [userRes, listingRes] = await Promise.all([
        sdk.currentUser.show(),
        sdk.listings.show({ id: listingId, include: ['author'] }),
      ]);
      const me = userRes.data.data;
      const listing = listingRes.data.data;
      if (listing.relationships?.author?.data?.id?.uuid === me.id.uuid) {
        throw httpError(400, 'You cannot make an offer on your own listing.');
      }
      const processAlias = listing.attributes.publicData?.transactionProcessAlias || '';
      if (!processAlias.startsWith('default-purchase/')) {
        throw httpError(400, 'Offers are only available for product listings.');
      }
      const price = listing.attributes.price;
      const amountError = validateOfferAmount(amount, price);
      if (amountError) {
        throw httpError(400, amountError);
      }

      let transaction = await findOpenInquiry(sdk, listingUuid);
      if (!transaction) {
        const initiated = await sdk.transactions.initiate({
          processAlias,
          transition: INQUIRE,
          params: { listingId },
        });
        transaction = initiated.data.data;
      }

      const offers = applyOfferAction(getOffers(transaction.attributes.metadata), {
        role: 'customer',
        type: 'offer',
        amount,
        currency: price.currency,
      });
      await saveOffersAndNotify(sdk, transaction.id, offers, 'offer', amount);
      res.status(200).json({ data: { transactionId: transaction.id.uuid } });
    })
    .catch(e => handleError(res, toHttpError(e)));
};

const respondToOffer = (req, res) => {
  const { transactionId, action, amount } = req.body || {};
  const sdk = getSdk(req, res);

  Promise.resolve()
    .then(async () => {
      requireConfigured();
      if (!uuidOf(transactionId) || !['accept', 'reject', 'counter', 'propose'].includes(action)) {
        throw httpError(400, 'Invalid request.');
      }
      const [userRes, txRes] = await Promise.all([
        sdk.currentUser.show(),
        sdk.transactions.show({ id: transactionId, include: ['listing', 'customer', 'provider'] }),
      ]);
      const me = userRes.data.data;
      const transaction = txRes.data.data;
      const listingRef = transaction.relationships?.listing?.data;
      const listing = (txRes.data.included || []).find(
        i => i.type === 'listing' && i.id.uuid === listingRef?.id?.uuid
      );
      const role =
        transaction.relationships?.customer?.data?.id?.uuid === me.id.uuid
          ? 'customer'
          : transaction.relationships?.provider?.data?.id?.uuid === me.id.uuid
          ? 'provider'
          : null;
      if (!role) {
        throw httpError(403, 'Not a participant.');
      }
      if (transaction.attributes.lastTransition !== INQUIRE) {
        throw httpError(409, 'This conversation already has an order.');
      }

      const price = listing?.attributes?.price;
      if (action === 'counter' || action === 'propose') {
        const amountError = validateOfferAmount(amount, price);
        if (amountError) {
          throw httpError(400, amountError);
        }
      }

      const existing = getOffers(transaction.attributes.metadata);
      const offers = applyOfferAction(existing, {
        role,
        type: action,
        amount,
        currency: price?.currency,
      });
      const answered = existing[existing.length - 1];
      const messageAmount = action === 'counter' || action === 'propose' ? amount : answered.amount;
      await saveOffersAndNotify(sdk, transaction.id, offers, action, messageAmount);
      res.status(200).json({ data: { transactionId: transaction.id.uuid, offers } });
    })
    .catch(e => handleError(res, toHttpError(e)));
};

module.exports = { makeOffer, respondToOffer };
