/**
 * Refume: extra data for the listing page — seller rating, seller's other listings and
 * similar listings. Plain thunks; components keep the returned ids in local state and
 * read the denormalised listings from marketplaceData.
 */
import { createImageVariantConfig } from '../../../util/sdkLoader';
import { addMarketplaceEntities } from '../../../ducks/marketplaceData.duck';

export const LISTING_CARD_FIELDS = [
  'title',
  'price',
  'deleted',
  'state',
  'publicData.listingType',
  'publicData.transactionProcessAlias',
  'publicData.unitType',
  'publicData.cardStyle',
  'publicData.priceVariationsEnabled',
  'publicData.priceVariants',
  'publicData.marka',
  'publicData.stezenie',
  'publicData.stan',
  'publicData.pojemnosc_ml',
  'publicData.pojemnosc_odlewki',
  'metadata.weryfikacja',
];

const cardQueryParams = (listingImageConfig, includeSoldOut) => {
  const { aspectWidth = 1, aspectHeight = 1, variantPrefix = 'listing-card' } =
    listingImageConfig || {};
  const aspectRatio = aspectHeight / aspectWidth;
  return {
    ...(includeSoldOut ? {} : { minStock: 1, stockMode: 'match-undefined' }),
    include: ['images', 'author'],
    'fields.listing': LISTING_CARD_FIELDS,
    'fields.user': ['profile.displayName', 'profile.abbreviatedName'],
    'fields.image': [
      'variants.listing-card',
      'variants.listing-card-2x',
      'variants.scaled-small',
      'variants.scaled-medium',
    ],
    ...createImageVariantConfig(`${variantPrefix}`, 400, aspectRatio),
    ...createImageVariantConfig(`${variantPrefix}-2x`, 800, aspectRatio),
    'limit.images': 1,
  };
};

/**
 * @returns {Promise<Array<UUID>>} listing ids (current listing excluded)
 */
export const fetchListingIds = ({
  query,
  excludeId,
  limit,
  listingImageConfig,
  includeSoldOut = false,
}) => (
  dispatch,
  getState,
  sdk
) =>
  sdk.listings
    .query({
      ...query,
      perPage: Math.min(limit + 1, 100),
      page: 1,
      ...cardQueryParams(listingImageConfig, includeSoldOut),
    })
    .then(response => {
      // Leave the listing being viewed out of the store update: these card queries return
      // only a few fields, which would replace its full data (notes, accords, metadata).
      const isExcluded = l => l.type === 'listing' && l.id.uuid === excludeId?.uuid;
      const cardsOnly = {
        ...response,
        data: {
          ...response.data,
          data: response.data.data.filter(l => !isExcluded(l)),
          included: (response.data.included || []).filter(l => !isExcluded(l)),
        },
      };
      dispatch(addMarketplaceEntities(cardsOnly));
      return cardsOnly.data.data.map(l => l.id).slice(0, limit);
    });

/**
 * @returns {Promise<{ average: number|null, count: number }>} seller's public rating
 */
export const fetchSellerRating = userId => (dispatch, getState, sdk) =>
  sdk.reviews
    .query({ subject_id: userId, state: 'public', type: 'ofProvider', perPage: 100 })
    .then(response => {
      const ratings = (response.data.data || [])
        .map(r => r.attributes.rating)
        .filter(r => Number.isFinite(r));
      const count = response.data.meta?.totalItems ?? ratings.length;
      const average = ratings.length
        ? ratings.reduce((sum, r) => sum + r, 0) / ratings.length
        : null;
      return { average, count };
    });
