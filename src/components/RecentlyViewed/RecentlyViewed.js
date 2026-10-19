import React, { useEffect, useState } from 'react';
import classNames from 'classnames';
import { useDispatch, useSelector } from 'react-redux';

import { useConfiguration } from '../../context/configurationContext';
import { getListingsById } from '../../ducks/marketplaceData.duck';
import { fetchListingIds } from '../../containers/ListingPage/RefumeListingExtras/refumeListingExtras.thunks';
import {
  getRecentlyViewed,
  clearRecentlyViewed,
  RECENTLY_VIEWED_EVENT,
} from '../../util/refumeRecentlyViewed';
import ListingCard from '../ListingCard/ListingCard';

import css from './RecentlyViewed.module.css';

const LIMIT = 12;

/**
 * Refume: row of listings this browser has opened recently. Rendered only in the browser
 * (the list lives in localStorage), and hidden when empty.
 *
 * @param {Object} props
 * @param {string} [props.excludeUuid] listing to leave out (the one being viewed)
 * @param {number} [props.limit]
 */
const RecentlyViewed = props => {
  const { excludeUuid, limit = 6, className, titleClassName } = props;
  const dispatch = useDispatch();
  const config = useConfiguration();
  const [storedIds, setStoredIds] = useState([]);
  const [loadedUuids, setLoadedUuids] = useState([]);

  useEffect(() => {
    const read = () => setStoredIds(getRecentlyViewed());
    read();
    window.addEventListener(RECENTLY_VIEWED_EVENT, read);
    return () => window.removeEventListener(RECENTLY_VIEWED_EVENT, read);
  }, []);

  const wanted = storedIds.filter(id => id !== excludeUuid).slice(0, LIMIT);
  const wantedKey = wanted.join(',');

  useEffect(() => {
    if (!wanted.length) {
      setLoadedUuids([]);
      return;
    }
    let cancelled = false;
    dispatch(
      fetchListingIds({
        query: { ids: wantedKey },
        limit: LIMIT,
        listingImageConfig: config?.layout?.listingImage,
      })
    )
      .then(ids => !cancelled && setLoadedUuids(ids.map(id => id.uuid)))
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, [wantedKey]);

  // Keep the "most recent first" order; drop closed or sold listings
  const orderedIds = wanted.filter(id => loadedUuids.includes(id)).slice(0, limit);
  const listings = useSelector(state =>
    getListingsById(
      state,
      orderedIds.map(uuid => ({ uuid }))
    )
  );

  if (!listings.length) {
    return null;
  }

  return (
    <section className={classNames(css.root, className)} aria-labelledby="recently-viewed-title">
      <div className={css.header}>
        <h2 id="recently-viewed-title" className={classNames(css.title, titleClassName)}>
          Ostatnio oglądane
        </h2>
        <button type="button" className={css.clear} onClick={clearRecentlyViewed}>
          Wyczyść
        </button>
      </div>
      <div className={css.grid}>
        {listings.map(l => (
          <ListingCard key={l.id.uuid} listing={l} showAuthorInfo={false} />
        ))}
      </div>
    </section>
  );
};

export default RecentlyViewed;
