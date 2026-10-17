const { transactionLineItems } = require('../api-util/lineItems');
const { getSdk, handleError, serialize, fetchCommission } = require('../api-util/sdk');
const { constructValidLineItems } = require('../api-util/lineItemHelpers');
const { withAcceptedOfferPrice } = require('../api-util/refumeOffers');

module.exports = (req, res) => {
  const { isOwnListing, listingId, orderData } = req.body || {};

  const sdk = getSdk(req, res);

  const listingPromise = () =>
    isOwnListing ? sdk.ownListings.show({ id: listingId }) : sdk.listings.show({ id: listingId });

  // Refume: on the chat page, the estimate uses the accepted price offer of that conversation
  const offerTransactionId = orderData?.offerTransactionId;
  const offerTxPromise = () =>
    offerTransactionId && !isOwnListing
      ? sdk.transactions
          .show({ id: offerTransactionId, include: ['listing'] })
          .catch(() => null)
      : Promise.resolve(null);

  Promise.all([listingPromise(), fetchCommission(sdk), offerTxPromise()])
    .then(([showListingResponse, fetchAssetsResponse, offerTxResponse]) => {
      const listing = showListingResponse.data.data;
      const offerTx = offerTxResponse?.data?.data;
      const offerTxListingId = offerTx?.relationships?.listing?.data?.id?.uuid;
      const sameListing = offerTxListingId && offerTxListingId === listing.id.uuid;
      const offerOrderData = withAcceptedOfferPrice(
        orderData,
        sameListing ? offerTx.attributes.metadata : null,
        listing
      );
      const commissionAsset = fetchAssetsResponse.data.data[0];

      const { providerCommission, customerCommission } =
        commissionAsset?.type === 'jsonAsset' ? commissionAsset.attributes.data : {};

      const lineItems = transactionLineItems(
        listing,
        offerOrderData,
        providerCommission,
        customerCommission
      );

      // Because we are using returned lineItems directly in this template we need to use the helper function
      // to add some attributes like lineTotal and reversal that Marketplace API also adds to the response.
      const validLineItems = constructValidLineItems(lineItems);

      res
        .status(200)
        .set('Content-Type', 'application/transit+json')
        .send(serialize({ data: validLineItems }))
        .end();
    })
    .catch(e => {
      handleError(res, e);
    });
};
