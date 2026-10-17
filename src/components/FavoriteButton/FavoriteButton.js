import React, { useState } from 'react';
import classNames from 'classnames';
import { useHistory } from 'react-router-dom';

import { useFavorites } from '../../ducks/refumeFavorites';
import { useRouteConfiguration } from '../../context/routeConfigurationContext';
import { createResourceLocatorString } from '../../util/routes';

import css from './FavoriteButton.module.css';

export const HeartIcon = ({ filled, className }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
    <path
      d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0112 7.6a4.3 4.3 0 017.5 2.7c0 5.6-7.5 10.2-7.5 10.2z"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * Refume: heart toggle for a listing. Logged-out users are sent to the login page.
 *
 * @param {Object} props
 * @param {string} props.listingUuid
 * @param {string} props.title listing title, for the accessible label
 * @param {'overlay'|'button'} props.variant round icon on a card image, or a labelled button
 */
const FavoriteButton = props => {
  const { listingUuid, title, variant = 'overlay', className } = props;
  const { isLoggedIn, isFavorite, toggle } = useFavorites();
  const history = useHistory();
  const routes = useRouteConfiguration();
  const [busy, setBusy] = useState(false);

  if (!listingUuid) {
    return null;
  }
  const active = isLoggedIn && isFavorite(listingUuid);

  const handleClick = e => {
    e.preventDefault();
    e.stopPropagation();
    if (!isLoggedIn) {
      const from = typeof window !== 'undefined' ? window.location.pathname : '/';
      history.push(createResourceLocatorString('LoginPage', routes, {}, {}), { from });
      return;
    }
    if (busy) {
      return;
    }
    setBusy(true);
    toggle(listingUuid)
      .catch(() => null)
      .finally(() => setBusy(false));
  };

  const label = active
    ? `Usuń z ulubionych${title ? `: ${title}` : ''}`
    : `Dodaj do ulubionych${title ? `: ${title}` : ''}`;

  return variant === 'button' ? (
    <button
      type="button"
      className={classNames(css.labelled, { [css.active]: active }, className)}
      aria-pressed={active}
      onClick={handleClick}
    >
      <HeartIcon filled={active} className={css.icon} />
      {active ? 'W ulubionych' : 'Dodaj do ulubionych'}
    </button>
  ) : (
    <button
      type="button"
      className={classNames(css.overlay, { [css.active]: active }, className)}
      aria-pressed={active}
      aria-label={label}
      title={active ? 'Usuń z ulubionych' : 'Dodaj do ulubionych'}
      onClick={handleClick}
    >
      <HeartIcon filled={active} className={css.icon} />
    </button>
  );
};

export default FavoriteButton;
