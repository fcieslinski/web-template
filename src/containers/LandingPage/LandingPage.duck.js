import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';

import * as log from '../../util/log';
import { isForbiddenError, storableError } from '../../util/errors';
import { createImageVariantConfig } from '../../util/sdkLoader';
import { fetchPageAssets } from '../../ducks/hostedAssets.duck';
import { addMarketplaceEntities } from '../../ducks/marketplaceData.duck';

export const ASSET_NAME = 'landing-page';

// Refume: how many of the newest listings the catalog grid on the landing page shows
// Refume: 6 tiles per row on wide screens (3 rows), 3 on small tablets
const LATEST_LISTINGS_COUNT = 18;

// ================ Async Thunks ================ //

// Refume: newest public listings for the catalog grid on the landing page
export const fetchLatestListings = createAsyncThunk(
  'LandingPage/fetchLatestListings',
  async (listingImageConfig, { extra: sdk, dispatch, rejectWithValue }) => {
    const {
      aspectWidth = 1,
      aspectHeight = 1,
      variantPrefix = 'listing-card',
    } = listingImageConfig || {};
    const aspectRatio = aspectHeight / aspectWidth;

    try {
      const response = await sdk.listings.query({
        perPage: LATEST_LISTINGS_COUNT,
        page: 1,
        minStock: 1,
        stockMode: 'match-undefined',
        include: ['images', 'author'],
        'fields.listing': [
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
        ],
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
      });
      dispatch(addMarketplaceEntities(response));
      return {
        ids: response.data.data.map(listing => listing.id),
        total: response.data.meta?.totalItems ?? null,
      };
    } catch (error) {
      // Private marketplaces return 403 to anonymous users; that is expected.
      log.error(
        error,
        'landing-page-latest-listings-failed',
        {},
        {
          skipSentry: isForbiddenError(error),
        }
      );
      return rejectWithValue(storableError(error));
    }
  }
);

// ================ Slice ================ //

// Refume: category tiles on the home page, with the number of listings in each
export const HOME_CATEGORIES = [
  { key: 'damskie', label: 'Damskie', query: { pub_categoryLevel1: 'damskie' }, to: { search: '?pub_categoryLevel1=damskie' } },
  { key: 'meskie', label: 'Męskie', query: { pub_categoryLevel1: 'meskie' }, to: { search: '?pub_categoryLevel1=meskie' } },
  { key: 'unisex', label: 'Unisex', query: { pub_categoryLevel1: 'unisex' }, to: { search: '?pub_categoryLevel1=unisex' } },
  { key: 'odlewki', label: 'Odlewki', query: { pub_listingType: 'sell-used-products' }, listingType: 'sell-used-products' },
  { key: 'flakony', label: 'Flakony', query: { pub_listingType: 'sell-new-products' }, listingType: 'sell-new-products' },
  { key: 'folia', label: 'Nowe w folii', query: { pub_stan: 'nowe-folia' }, to: { search: '?pub_stan=nowe-folia' } },
  { key: 'do100', label: 'Do 100 zł', query: { price: '0,10000' }, to: { search: '?price=0,100' } },
  { key: 'pudelko', label: 'Z pudełkiem', query: { pub_pudelko: 'tak' }, to: { search: '?pub_pudelko=tak' } },
];

export const fetchCategoryCounts = createAsyncThunk(
  'LandingPage/fetchCategoryCounts',
  async (_, { extra: sdk }) => {
    const counts = await Promise.all(
      HOME_CATEGORIES.map(c =>
        sdk.listings
          .query({
            ...c.query,
            perPage: 1,
            page: 1,
            minStock: 1,
            stockMode: 'match-undefined',
            'fields.listing': ['title'],
          })
          .then(res => [c.key, res.data.meta?.totalItems ?? null])
          .catch(() => [c.key, null])
      )
    );
    return Object.fromEntries(counts);
  }
);

const landingPageSlice = createSlice({
  name: 'LandingPage',
  initialState: {
    latestListingIds: [],
    totalListings: null,
    categoryCounts: {},
    latestListingsInProgress: false,
    latestListingsError: null,
  },
  reducers: {},
  extraReducers: builder => {
    builder
      .addCase(fetchLatestListings.pending, state => {
        state.latestListingsInProgress = true;
        state.latestListingsError = null;
      })
      .addCase(fetchLatestListings.fulfilled, (state, action) => {
        state.latestListingsInProgress = false;
        state.latestListingIds = action.payload.ids;
        state.totalListings = action.payload.total;
      })
      .addCase(fetchCategoryCounts.fulfilled, (state, action) => {
        state.categoryCounts = action.payload || {};
      })
      .addCase(fetchLatestListings.rejected, (state, action) => {
        state.latestListingsInProgress = false;
        state.latestListingsError = action.payload || null;
      });
  },
});

export default landingPageSlice.reducer;

// ================ Load data ================ //

export const loadData = (params, search, config) => dispatch => {
  const pageAsset = { landingPage: `content/pages/${ASSET_NAME}.json` };
  const listingImageConfig = config?.layout?.listingImage;
  return Promise.all([
    dispatch(fetchPageAssets(pageAsset, true)),
    // A failure here must not break the landing page, so it is caught.
    dispatch(fetchLatestListings(listingImageConfig)).catch(() => null),
    dispatch(fetchCategoryCounts()).catch(() => null),
  ]);
};
