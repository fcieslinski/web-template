import React from 'react';
import { useSelector } from 'react-redux';
import classNames from 'classnames';

import { ACCOUNT_SETTINGS_PAGES } from '../../routing/routeConfiguration';
import NamedLink from '../NamedLink/NamedLink';

import css from './UserNav.module.css';

/**
 * Refume: light navigation bar on account pages — back to your profile, orders and settings.
 *
 * @param {Object} props
 * @param {string} [props.className]
 * @param {string} [props.rootClassName]
 * @param {string} props.currentPage e.g. 'ManageListingsPage'
 */
const UserNav = props => {
  const { className, rootClassName, currentPage } = props;
  const userId = useSelector(state => state.user?.currentUser?.id?.uuid);
  const classes = classNames(rootClassName || css.root, className);

  const tabs = [
    userId
      ? {
          key: 'profile',
          text: 'Twój profil',
          selected: currentPage === 'ProfilePage' || currentPage === 'ManageListingsPage',
          name: 'ProfilePage',
          params: { id: userId },
        }
      : null,
    {
      key: 'orders',
      text: 'Zamówienia',
      selected: currentPage === 'OrdersPage',
      name: 'OrdersPage',
      params: { tab: 'kupione' },
    },
    {
      key: 'account',
      text: 'Ustawienia konta',
      selected: ACCOUNT_SETTINGS_PAGES.includes(currentPage),
      name: 'ContactDetailsPage',
    },
  ].filter(Boolean);

  return (
    <nav className={classes} aria-label="Twoje konto">
      <div className={css.inner}>
        {tabs.map(t => (
          <NamedLink
            key={t.key}
            name={t.name}
            params={t.params}
            className={classNames(css.tab, { [css.tabSelected]: t.selected })}
            aria-current={t.selected ? 'page' : undefined}
          >
            {t.text}
          </NamedLink>
        ))}
      </div>
    </nav>
  );
};

export default UserNav;
