import React, { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';

import { AvatarLarge, NamedLink } from '../../../components';
import { fetchSellerRating } from './refumeListingExtras.thunks';
import StarRating from './StarRating';
import SellerBadges from '../../../components/SellerBadges/SellerBadges';
import ReportButton from '../../../components/ReportButton/ReportButton';

import css from './RefumeListingExtras.module.css';

const BIO_MAX = 160;

const shorten = text => {
  const clean = (text || '').trim().replace(/\s+/g, ' ');
  return clean.length > BIO_MAX ? `${clean.slice(0, BIO_MAX).replace(/\s+\S*$/, '')}…` : clean;
};

/**
 * Refume: seller card in the right column of the listing page — avatar, name, rating,
 * short bio, seller badges and a contact button.
 */
const SellerCard = props => {
  const { listing, isOwnListing, onContactUser } = props;
  const dispatch = useDispatch();
  const [rating, setRating] = useState(null);

  const author = listing?.author;
  const authorId = author?.id;

  useEffect(() => {
    if (!authorId) {
      return;
    }
    let cancelled = false;
    dispatch(fetchSellerRating(authorId))
      .then(r => !cancelled && setRating(r))
      .catch(() => !cancelled && setRating({ average: null, count: 0 }));
    return () => {
      cancelled = true;
    };
  }, [authorId?.uuid]);

  if (!author || author.attributes?.banned || author.attributes?.deleted) {
    return null;
  }

  const { displayName, bio } = author.attributes?.profile || {};
  const shortBio = shorten(bio);

  return (
    <section className={css.sellerCard} aria-labelledby="seller-card-title">
      <h2 id="seller-card-title" className={css.sellerHeading}>
        Sprzedający
      </h2>
      <div className={css.sellerTop}>
        <AvatarLarge user={author} className={css.sellerAvatar} disableProfileLink />
        <div className={css.sellerInfo}>
          <NamedLink name="ProfilePage" params={{ id: authorId.uuid }} className={css.sellerName}>
            {displayName}
          </NamedLink>
          {rating ? <StarRating average={rating.average} count={rating.count} /> : null}
        </div>
      </div>

      <SellerBadges userId={authorId.uuid} />

      {shortBio ? <p className={css.sellerBio}>{shortBio}</p> : null}

      <div className={css.sellerActions}>
        {!isOwnListing ? (
          <button type="button" className={css.contactButton} onClick={onContactUser}>
            Napisz do sprzedającego
          </button>
        ) : null}
        <NamedLink name="ProfilePage" params={{ id: authorId.uuid }} className={css.profileLink}>
          Zobacz profil i opinie
        </NamedLink>
        {!isOwnListing ? (
          <ReportButton type="oferta" targetId={listing?.id?.uuid} className={css.reportLink} />
        ) : null}
      </div>
    </section>
  );
};

export default SellerCard;
