import React, { useEffect, useState } from 'react';
import classNames from 'classnames';

import { fetchSellerBadges } from '../../util/api';
import { earnedBadges } from '../../util/refumeBadges';

import css from './SellerBadges.module.css';

const BadgeIcon = ({ icon }) =>
  icon === 'bolt' ? (
    <svg viewBox="0 0 24 24" className={css.icon} aria-hidden="true" focusable="false">
      <path d="M13 2 4 14h7l-1 8 9-12h-7z" fill="currentColor" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" className={css.icon} aria-hidden="true" focusable="false">
      <path
        d="m12 2.8 2.8 5.7 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 2.9 1.1-6.3-4.6-4.4 6.3-.9z"
        fill="currentColor"
      />
    </svg>
  );

const cache = new Map(); // userId -> Promise<badges>

const loadBadges = userId => {
  if (!cache.has(userId)) {
    cache.set(
      userId,
      fetchSellerBadges(userId)
        .then(r => r?.data || null)
        .catch(() => {
          cache.delete(userId);
          return null;
        })
    );
  }
  return cache.get(userId);
};

/**
 * Refume: the seller's earned badges as chips. Tapping a chip shows what it means.
 * Renders nothing when the seller has no badges.
 *
 * @param {Object} props
 * @param {string} props.userId seller uuid
 */
const SellerBadges = props => {
  const { userId, className } = props;
  const [badges, setBadges] = useState(null);
  const [open, setOpen] = useState(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    loadBadges(userId).then(b => !cancelled && setBadges(b));
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const earned = earnedBadges(badges);
  if (!earned.length) {
    return null;
  }
  const openBadge = earned.find(b => b.key === open);

  return (
    <div className={classNames(css.root, className)}>
      <ul className={css.list} aria-label="Odznaki sprzedającego">
        {earned.map(b => (
          <li key={b.key}>
            <button
              type="button"
              className={classNames(css.chip, css[b.icon], { [css.chipOpen]: open === b.key })}
              aria-expanded={open === b.key}
              onClick={() => setOpen(open === b.key ? null : b.key)}
            >
              <BadgeIcon icon={b.icon} />
              {b.label}
            </button>
          </li>
        ))}
      </ul>
      {openBadge ? <p className={css.description}>{openBadge.description}</p> : null}
    </div>
  );
};

export default SellerBadges;
