import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';

import * as log from '../../util/log';
import { isForbiddenError, storableError } from '../../util/errors';
import { createImageVariantConfig } from '../../util/sdkLoader';
import { fetchPageAssets } from '../../ducks/hostedAssets.duck';
import { addMarketplaceEntities } from '../../ducks/marketplaceData.duck';

export const ASSET_NAME = 'landing-page';

// Refume: how many of the newest listings the catalog grid on the landing page shows
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
      return response.data.data.map(listing => listing.id);
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

const landingPageSlice = createSlice({
  name: 'LandingPage',
  initialState: {
    latestListingIds: [],
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
        state.latestListingIds = action.payload;
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
  ]);
};
