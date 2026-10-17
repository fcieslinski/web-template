import React from 'react';

import css from './RefumeListingExtras.module.css';

const Star = ({ fill }) => (
  <svg viewBox="0 0 20 20" className={css.star} aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={`star-${fill}`}>
        <stop offset={`${fill}%`} stopColor="currentColor" />
        <stop offset={`${fill}%`} stopColor="var(--colorGrey200)" />
      </linearGradient>
    </defs>
    <path
      d="M10 1.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L10 14.9l-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z"
      fill={`url(#star-${fill})`}
    />
  </svg>
);

/** Five stars with partial fill, e.g. 4.3 → ★★★★☆ with the 5th 30% filled. */
const StarRating = ({ average, count }) => {
  if (!count || average == null) {
    return <span className={css.noReviews}>Brak opinii</span>;
  }
  const rounded = Math.round(average * 10) / 10;
  const label = `Ocena ${String(rounded).replace('.', ',')} na 5, ${count} ${
    count === 1 ? 'opinia' : count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 12 || count % 100 > 14) ? 'opinie' : 'opinii'
  }`;
  return (
    <span className={css.rating} role="img" aria-label={label}>
      <span className={css.stars}>
        {[0, 1, 2, 3, 4].map(i => (
          <Star key={i} fill={Math.round(Math.max(0, Math.min(1, average - i)) * 100)} />
        ))}
      </span>
      <span className={css.ratingText} aria-hidden="true">
        {String(rounded).replace('.', ',')} ({count})
      </span>
    </span>
  );
};

export default StarRating;
