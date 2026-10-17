import React from 'react';
import loadable from '@loadable/component';

import { bool, object } from 'prop-types';
import { compose } from 'redux';
import { connect } from 'react-redux';

import { camelize } from '../../util/string';
import { propTypes } from '../../util/types';

import FallbackPage from './FallbackPage';
import CatalogHome from './CatalogHome';
import { ASSET_NAME } from './LandingPage.duck';
import { fetchFeaturedListings } from '../../ducks/featuredListings.duck';
import { getListingsById } from '../../ducks/marketplaceData.duck';
import { getFeaturedListingsProps } from '../../util/data';

const PageBuilder = loadable(() =>
  import(/* webpackChunkName: "PageBuilder" */ '../PageBuilder/PageBuilder')
);

// Refume: the catalog banner replaces the big hero from Console, so hero sections
// of the landing page asset are skipped here (they still show if this code is not used).
const withoutHeroSections = data =>
  data?.sections
    ? { ...data, sections: data.sections.filter(section => section?.sectionType !== 'hero') }
    : data;

export const LandingPageComponent = props => {
  const { pageAssetsData, inProgress, error, latestListings, latestListingsInProgress } = props;

  return (
    <PageBuilder
      pageAssetsData={withoutHeroSections(pageAssetsData?.[camelize(ASSET_NAME)]?.data)}
      inProgress={inProgress}
      error={error}
      fallbackPage={<FallbackPage error={error} />}
      featuredListings={getFeaturedListingsProps(camelize(ASSET_NAME), props)}
      mainContentBefore={
        <CatalogHome listings={latestListings} inProgress={latestListingsInProgress} />
      }
    />
  );
};

LandingPageComponent.propTypes = {
  pageAssetsData: object,
  inProgress: bool,
  error: propTypes.error,
};

const mapStateToProps = state => {
  const { pageAssetsData, inProgress, error } = state.hostedAssets || {};
  const featuredListingData = state.featuredListings || {};

  const getListingEntitiesById = listingIds => getListingsById(state, listingIds);

  // Refume: newest listings for the catalog grid
  const { latestListingIds = [], latestListingsInProgress } = state.LandingPage || {};
  const latestListings = getListingsById(state, latestListingIds);

  return {
    pageAssetsData,
    featuredListingData,
    getListingEntitiesById,
    inProgress,
    error,
    latestListings,
    latestListingsInProgress,
  };
};

const mapDispatchToProps = dispatch => ({
  onFetchFeaturedListings: (sectionId, parentPage, listingImageConfig, allSections) =>
    dispatch(fetchFeaturedListings({ sectionId, parentPage, listingImageConfig, allSections })),
});

// Note: it is important that the withRouter HOC is **outside** the
// connect HOC, otherwise React Router won't rerender any Route
// components since connect implements a shouldComponentUpdate
// lifecycle hook.
//
// See: https://github.com/ReactTraining/react-router/issues/4671
const LandingPage = compose(
  connect(
    mapStateToProps,
    mapDispatchToProps
  )
)(LandingPageComponent);

export default LandingPage;
