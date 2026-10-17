/**
 * Refume: seller uploads a proof-of-purchase photo for their listing.
 *
 * The photo is uploaded as a Sharetribe image but is NOT attached to the listing's
 * public images. Its URL is stored in the listing's privateData, which only the seller
 * and the marketplace operator (moderation panel, via Integration API) can read.
 *
 * Plain thunk (no reducer): the calling component keeps its own UI state.
 *
 * @param {Object} params
 * @param {UUID} params.listingId
 * @param {File} params.file
 * @returns {Promise<Object>} the stored proof { imageId, url, uploadedAt }
 */
export const uploadProofOfPurchase = ({ listingId, file }) => (dispatch, getState, sdk) => {
  return sdk.images
    .upload({ image: file }, { expand: true, 'fields.image': ['variants.scaled-large'] })
    .then(response => {
      const image = response.data.data;
      const url = image?.attributes?.variants?.['scaled-large']?.url;
      if (!url) {
        throw new Error('Uploaded image has no URL.');
      }
      const proof = {
        imageId: image.id.uuid,
        url,
        uploadedAt: new Date().toISOString(),
      };
      return sdk.ownListings
        .update({ id: listingId, privateData: { dowodZakupu: proof } })
        .then(() => proof);
    });
};
