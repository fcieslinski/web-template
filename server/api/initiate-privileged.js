const sharetribeSdk = require('sharetribe-flex-sdk');
const { assertExpectedPayinTotal } = require('../api-util/assertExpectedPayinTotal');
const { transactionLineItems } = require('../api-util/lineItems');
const { isIntentionToMakeOffer } = require('../api-util/negotiation');
const { stripOfferPrice } = require('../api-util/refumeOffers');
const {
  createCookieTokenStore,
  getSdk,
  getTrustedSdk,
  handleError,
  serialize,
  fetchCommission,
} = require('../api-util/sdk');

const { Money } = sharetribeSdk.types;

const listingPromise = (sdk, id) => sdk.listings.show({ id });

const getFullOrderData = (orderData, bodyParams, currency) => {
  const { offerInSubunits } = orderData || {};
  const transitionName = bodyParams.transition;

  return isIntentionToMakeOffer(offerInSubunits, transitionName)
    ? {
        ...orderData,
        ...bodyParams.params,
        currency,
        offer: new Money(offerInSubunits, currency),
      }
    : { ...orderData, ...bodyParams.params };
};

const getMetadata = (orderData, transition) => {
  const { actor, offerInSubunits } = orderData || {};
  // NOTE: for now, the actor is always "provider".
  const hasActor = ['provider', 'customer'].includes(actor);
  const by = hasActor ? actor : null;

  return isIntentionToMakeOffer(offerInSubunits, transition)
    ? {
        metadata: {
          offers: [
            {
              offerInSubunits,
              by,
              transition,
            },
          ],
        },
      }
    : {};
};

module.exports = (req, res) => {
  const { isSpeculative, bodyParams, queryParams } = req.body || {};
  const orderData = stripOfferPrice(req.body?.orderData);
  const transitionName = bodyParams.transition;
  // Share one cookie token store so a refresh during listings.show is reused for exchangeToken.
  const tokenStore = createCookieTokenStore(req, res);
  const sdk = getSdk(req, res, tokenStore);
  let lineItems = null;
  let metadataMaybe = {};

  Promise.all([
    listingPromise(sdk, bodyParams?.params?.listingId),
    fetchCommission(sdk),
    sdk.currentUser.show().catch(() => null),
  ])
    .then(([showListingResponse, fetchAssetsResponse, currentUserResponse]) => {
      const listing = showListingResponse.data.data;
      // Refume: blocked accounts can't buy, hidden listings can't be bought
      const buyer = currentUserResponse?.data?.data;
      if (buyer?.attributes?.profile?.metadata?.refumeBlokada) {
        const e = new Error('Account blocked.');
        Object.assign(e, { status: 403, statusText: 'Account blocked.', data: {} });
        throw e;
      }
      if (listing.attributes?.metadata?.moderacja?.ukryta) {
        const e = new Error('Listing hidden by a moderator.');
        Object.assign(e, { status: 403, statusText: 'Listing hidden.', data: {} });
        throw e;
      }
      const commissionAsset = fetchAssetsResponse.data.data[0];

      const currency = listing.attributes.price?.currency || orderData.currency;
      const { providerCommission, customerCommission } =
        commissionAsset?.type === 'jsonAsset' ? commissionAsset.attributes.data : {};

      lineItems = transactionLineItems(
        listing,
        getFullOrderData(orderData, bodyParams, currency),
        providerCommission,
        customerCommission
      );

      // If the client sends expectedPayinTotal (checkout payment flows), ensure it
      assertExpectedPayinTotal(lineItems, orderData?.expectedPayinTotal);

      metadataMaybe = getMetadata(orderData, transitionName);

      return getTrustedSdk(req, res, tokenStore);
    })
    .then(trustedSdk => {
      const { params } = bodyParams;

      // Add lineItems to the body params
      const body = {
        ...bodyParams,
        params: {
          ...params,
          lineItems,
          ...metadataMaybe,
        },
      };

      if (isSpeculative) {
        return trustedSdk.transactions.initiateSpeculative(body, queryParams);
      }
      return trustedSdk.transactions.initiate(body, queryParams);
    })
    .then(apiResponse => {
      const { status, statusText, data } = apiResponse;
      res
        .status(status)
        .set('Content-Type', 'application/transit+json')
        .send(
          serialize({
            status,
            statusText,
            data,
          })
        )
        .end();
    })
    .catch(e => {
      handleError(res, e);
    });
};
