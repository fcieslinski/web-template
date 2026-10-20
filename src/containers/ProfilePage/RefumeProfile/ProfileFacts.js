import React from 'react';

import { REVIEW_TYPE_OF_PROVIDER } from '../../../util/types';
import { shippingSpeedLabel, cleanCity } from './refumeProfileFields';
import { cleanBundleSettings, describeBundleDiscounts } from '../../../util/refumeBundleSettings';

import css from './RefumeProfile.module.css';

const MONTHS = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];
const memberSince = date => {
  const d = date ? new Date(date) : null;
  return d && !Number.isNaN(d.getTime()) ? `${MONTHS[d.getMonth()]} ${d.getFullYear()}` : null;
};

const Star = () => (
  <svg width="15" height="15" viewBox="0 0 20 20" aria-hidden="true" className={css.star}>
    <path d="M10 1.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L10 14.9l-5.2 2.7 1-5.8L1.5 7.7l5.9-.8z" fill="currentColor" />
  </svg>
);

/**
 * Refume: short facts under the profile name — rating, member since, city, shipping speed.
 */
const ProfileFacts = props => {
  const { user, reviews = [], listingsCount } = props;
  const profile = user?.attributes?.profile || {};
  const publicData = profile.publicData || {};
  const sellerReviews = reviews.filter(r => r.attributes?.type === REVIEW_TYPE_OF_PROVIDER);
  const rated = sellerReviews.filter(r => Number.isFinite(r.attributes?.rating));
  const average = rated.length
    ? rated.reduce((sum, r) => sum + r.attributes.rating, 0) / rated.length
    : null;
  const since = memberSince(user?.attributes?.createdAt);
  const city = cleanCity(publicData.refumeMiasto);
  const speed = shippingSpeedLabel(publicData.refumeWysylka);
  const bundles = cleanBundleSettings(publicData.refumeZestawy);
  const bundleText = !bundles.wylaczone && bundles.rabaty.length ? describeBundleDiscounts(bundles) : null;

  const facts = [
    average != null ? (
      <a key="rating" href="#opinie" className={css.factRating}>
        <Star />
        <strong>{average.toFixed(1).replace('.', ',')}</strong>
        <span>
          ({rated.length} {rated.length === 1 ? 'opinia' : rated.length % 10 >= 2 && rated.length % 10 <= 4 && (rated.length % 100 < 10 || rated.length % 100 >= 20) ? 'opinie' : 'opinii'})
        </span>
      </a>
    ) : (
      <span key="rating">Brak opinii</span>
    ),
    listingsCount != null ? <span key="listings">{listingsCount} aktywnych ofert</span> : null,
    city ? <span key="city">📍 {city}</span> : null,
    speed ? <span key="speed">📦 {speed}</span> : null,
    since ? <span key="since">Na Refume od {since}</span> : null,
    bundleText ? (
      <span key="bundles" className={css.factBundle}>
        🎁 Zestawy: {bundleText}
      </span>
    ) : null,
  ].filter(Boolean);

  return (
    <div className={css.facts}>
      {facts.map((f, i) => (
        <React.Fragment key={f.key}>
          {i > 0 ? <span className={css.factDot} aria-hidden="true">·</span> : null}
          {f}
        </React.Fragment>
      ))}
    </div>
  );
};

export default ProfileFacts;
