import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { useConfiguration } from '../../context/configurationContext';
import { getListingsById } from '../../ducks/marketplaceData.duck';
import { getFavoriteIds } from '../../ducks/refumeFavorites';
import { Page, LayoutSingleColumn, ListingCard, NamedLink, H3 } from '../../components';
import { fetchListingIds } from '../ListingPage/RefumeListingExtras/refumeListingExtras.thunks';
import TopbarContainer from '../TopbarContainer/TopbarContainer';
import FooterContainer from '../FooterContainer/FooterContainer';

import css from './FavoritesPage.module.css';

const PAGE_LIMIT = 100; // Marketplace API: max 100 ids per query

/**
 * Refume: the current user's favourite listings (route /ulubione).
 */
const FavoritesPage = () => {
  const dispatch = useDispatch();
  const config = useConfiguration();
  const currentUser = useSelector(state => state.user?.currentUser);
  const favoriteUuids = getFavoriteIds(currentUser);
  const [loadedIds, setLoadedIds] = useState(null);
  const [error, setError] = useState(false);

  const idsKey = favoriteUuids.slice(0, PAGE_LIMIT).join(',');

  useEffect(() => {
    if (!currentUser?.id) {
      return;
    }
    if (!idsKey) {
      setLoadedIds([]);
      return;
    }
    let cancelled = false;
    dispatch(
      fetchListingIds({
        query: { ids: idsKey },
        limit: PAGE_LIMIT,
        listingImageConfig: config.layout.listingImage,
        includeSoldOut: true,
      })
    )
      .then(ids => !cancelled && setLoadedIds(ids))
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
    // Load once per user; un-favouriting just hides cards below.
  }, [currentUser?.id?.uuid]);

  const listings = useSelector(state => getListingsById(state, loadedIds || []));
  // Keep the user's order (newest favourite first) and hide removed favourites
  const visible = favoriteUuids
    .map(uuid => listings.find(l => l.id.uuid === uuid))
    .filter(Boolean);

  return (
    <Page title="Ulubione" scrollingDisabled={false}>
      <LayoutSingleColumn topbar={<TopbarContainer />} footer={<FooterContainer />}>
        <div className={css.root}>
          <H3 as="h1" className={css.title}>
            Ulubione
          </H3>
          {error ? (
            <p className={css.muted}>Nie udało się wczytać ulubionych. Odśwież stronę.</p>
          ) : loadedIds === null ? (
            <p className={css.muted}>Ładowanie…</p>
          ) : visible.length === 0 ? (
            <div className={css.empty}>
              <p className={css.muted}>
                Nie masz jeszcze ulubionych. Kliknij serduszko przy ofercie, żeby ją tu zapisać.
              </p>
              <NamedLink name="SearchPage" className={css.browse}>
                Przeglądaj oferty
              </NamedLink>
            </div>
          ) : (
            <div className={css.grid}>
              {visible.map(l => (
                <ListingCard key={l.id.uuid} listing={l} showAuthorInfo={false} />
              ))}
            </div>
          )}
        </div>
      </LayoutSingleColumn>
    </Page>
  );
};

export default FavoritesPage;
