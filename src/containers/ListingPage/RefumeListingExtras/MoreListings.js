import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { ListingCard, NamedLink } from '../../../components';
import { getListingsById } from '../../../ducks/marketplaceData.duck';
import { fetchListingIds } from './refumeListingExtras.thunks';

import css from './RefumeListingExtras.module.css';

const LIMIT = 6;

const ListingRow = props => {
  const { title, ids, linkName, linkParams, linkLabel } = props;
  const listings = useSelector(state => getListingsById(state, ids || []));
  if (!listings.length) {
    return null;
  }
  return (
    <section className={css.moreSection}>
      <div className={css.moreHeader}>
        <h2 className={css.moreTitle}>{title}</h2>
        {linkName ? (
          <NamedLink name={linkName} params={linkParams} className={css.moreLink}>
            {linkLabel}
          </NamedLink>
        ) : null}
      </div>
      <div className={css.moreGrid}>
        {listings.map(l => (
          <ListingCard key={l.id.uuid} listing={l} showAuthorInfo={false} />
        ))}
      </div>
    </section>
  );
};

/**
 * Refume: "More from this seller" and "Similar listings" at the bottom of the listing page.
 */
const MoreListings = props => {
  const { listing, listingImageConfig } = props;
  const dispatch = useDispatch();
  const [sellerIds, setSellerIds] = useState([]);
  const [similarIds, setSimilarIds] = useState([]);

  const listingId = listing?.id;
  const authorId = listing?.author?.id;
  const category = listing?.attributes?.publicData?.categoryLevel1;
  const brand = listing?.attributes?.publicData?.marka;

  useEffect(() => {
    if (!listingId || !authorId) {
      return;
    }
    let cancelled = false;
    dispatch(
      fetchListingIds({
        query: { authorId },
        excludeId: listingId,
        limit: LIMIT,
        listingImageConfig,
      })
    )
      .then(ids => !cancelled && setSellerIds(ids))
      .catch(() => null);

    // Similar: same category (or brand), other sellers first
    const similarQuery = category
      ? { pub_categoryLevel1: category }
      : brand
      ? { pub_marka: brand }
      : {};
    dispatch(
      fetchListingIds({
        query: similarQuery,
        excludeId: listingId,
        limit: LIMIT * 2,
        listingImageConfig,
      })
    )
      .then(ids => !cancelled && setSimilarIds(ids))
      .catch(() => null);

    return () => {
      cancelled = true;
    };
  }, [listingId?.uuid, authorId?.uuid]);

  const sellerIdSet = new Set(sellerIds.map(id => id.uuid));
  const similarOthers = similarIds.filter(id => !sellerIdSet.has(id.uuid)).slice(0, LIMIT);
  const sellerName = listing?.author?.attributes?.profile?.displayName;

  return (
    <div className={css.moreRoot}>
      <ListingRow
        title={sellerName ? `Więcej od ${sellerName}` : 'Więcej od tego sprzedającego'}
        ids={sellerIds}
        linkName={authorId ? 'ProfilePage' : null}
        linkParams={{ id: authorId?.uuid }}
        linkLabel="Wszystkie"
      />
      <ListingRow title="Podobne oferty" ids={similarOthers} />
    </div>
  );
};

export default MoreListings;
