import React, { useEffect, useRef, useState } from 'react';

import { recordListingView } from '../../../util/api';
import { addRecentlyViewed } from '../../../util/refumeRecentlyViewed';
import { useFavorites } from '../../../ducks/refumeFavorites';
import { HeartIcon } from '../../../components/FavoriteButton/FavoriteButton';

import css from './RefumeListingExtras.module.css';

const DAY = 24 * 60 * 60 * 1000;
const dayKey = date => date.toISOString().slice(0, 10);

export const getViewStats = metadata => {
  const views = metadata?.refumeWyswietlenia || {};
  const days = views.dni || {};
  const now = new Date();
  const lastDays = n =>
    Array.from({ length: n }, (_, i) => {
      const key = dayKey(new Date(now.getTime() - (n - 1 - i) * DAY));
      return { key, count: days[key] || 0 };
    });
  const last14 = lastDays(14);
  return {
    total: views.n || 0,
    last7: last14.slice(-7).reduce((s, d) => s + d.count, 0),
    last14,
  };
};

export const getLikeCount = metadata => metadata?.refumePolubienia?.n || 0;

export const plural = (n, one, few, many) => {
  if (n === 1) return one;
  const lastTwo = n % 100;
  const last = n % 10;
  return last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14) ? few : many;
};

/**
 * Counts a view (once per browser session, never for the owner) and remembers the listing
 * in "Ostatnio oglądane". Waits a moment so the current user is known before deciding.
 */
export const ListingViewTracker = props => {
  const { listing, isOwnListing } = props;
  const uuid = listing?.id?.uuid;
  const published = listing?.attributes?.state === 'published';

  useEffect(() => {
    if (!uuid || !published || isOwnListing) return;
    const timer = setTimeout(() => {
      addRecentlyViewed(uuid);
      const sessionKey = `refume:viewed:${uuid}`;
      try {
        if (window.sessionStorage.getItem(sessionKey)) return;
        window.sessionStorage.setItem(sessionKey, '1');
      } catch (e) {
        // no session storage: the server still de-duplicates
      }
      recordListingView({ listingId: uuid }).catch(() => null);
    }, 2000);
    return () => clearTimeout(timer);
  }, [uuid, published, isOwnListing]);

  return null;
};

/**
 * Public like counter next to the heart. Adjusts instantly when the viewer (un)likes.
 */
export const LikeCount = props => {
  const { listing } = props;
  const uuid = listing?.id?.uuid;
  const { isLoggedIn, isFavorite } = useFavorites();
  const base = getLikeCount(listing?.attributes?.metadata);
  const likedNow = isLoggedIn && isFavorite(uuid);
  const initialLiked = useRef(null);
  if (initialLiked.current === null && isLoggedIn) {
    initialLiked.current = likedNow;
  }
  const delta =
    initialLiked.current === null || initialLiked.current === likedNow ? 0 : likedNow ? 1 : -1;
  const count = Math.max(0, base + delta);
  if (!count) return null;
  return (
    <span className={css.likeCount} title={`Polubień: ${count}`}>
      {count}
      <span className={css.visuallyHidden}> {plural(count, 'polubienie', 'polubienia', 'polubień')}</span>
    </span>
  );
};

const EyeIcon = () => (
  <svg viewBox="0 0 24 24" className={css.statIcon} aria-hidden="true" focusable="false">
    <path
      d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
    <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
  </svg>
);

/**
 * Statistics for the seller on their own listing: views, likes and a 14-day chart.
 */
export const OwnerStatsPanel = props => {
  const { listing } = props;
  const metadata = listing?.attributes?.metadata;
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || listing?.attributes?.state !== 'published') return null;

  const { total, last7, last14 } = getViewStats(metadata);
  const likes = getLikeCount(metadata);
  const max = Math.max(1, ...last14.map(d => d.count));

  return (
    <section className={css.statsPanel} aria-labelledby="listing-stats-title">
      <h2 id="listing-stats-title" className={css.sellerHeading}>
        Statystyki Twojej oferty
      </h2>
      <dl className={css.statsGrid}>
        <div className={css.statItem}>
          <dt className={css.statLabel}>
            <EyeIcon /> Wyświetlenia
          </dt>
          <dd className={css.statValue}>{total}</dd>
        </div>
        <div className={css.statItem}>
          <dt className={css.statLabel}>W tym tygodniu</dt>
          <dd className={css.statValue}>{last7}</dd>
        </div>
        <div className={css.statItem}>
          <dt className={css.statLabel}>
            <HeartIcon filled className={css.statIcon} /> Polubienia
          </dt>
          <dd className={css.statValue}>{likes}</dd>
        </div>
      </dl>
      <div className={css.statsChart} role="img" aria-label={`Wyświetlenia w ostatnich 14 dniach: ${last14.map(d => d.count).join(', ')}`}>
        {last14.map(d => (
          <span
            key={d.key}
            className={css.statsBar}
            style={{ height: `${Math.max(4, (d.count / max) * 100)}%` }}
            title={`${d.key}: ${d.count}`}
          />
        ))}
      </div>
      <p className={css.statsNote}>
        Ostatnie 14 dni. Liczby odświeżają się co kilka minut, a Twoje własne wejścia się nie
        liczą.
      </p>
    </section>
  );
};
