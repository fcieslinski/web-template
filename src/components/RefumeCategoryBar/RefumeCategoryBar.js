import React from 'react';
import classNames from 'classnames';

import NamedLink from '../NamedLink/NamedLink';

import css from './RefumeCategoryBar.module.css';

/**
 * Refume: horizontal bar of category shortcuts shown under the top bar,
 * in the style of classifieds sites.
 *
 * Search params match the listing data set up in Sharetribe Console:
 * - categories: pub_categoryLevel1 = damskie | meskie | unisex
 * - listing type "Odlewka": sell-used-products
 * - "stan" field value for sealed bottles: nowe-folia
 */
export const REFUME_CATEGORY_LINKS = [
  { key: 'all', label: 'Wszystko', name: 'SearchPage' },
  { key: 'damskie', label: 'Damskie', name: 'SearchPage', search: '?pub_categoryLevel1=damskie' },
  { key: 'meskie', label: 'Męskie', name: 'SearchPage', search: '?pub_categoryLevel1=meskie' },
  { key: 'unisex', label: 'Unisex', name: 'SearchPage', search: '?pub_categoryLevel1=unisex' },
  {
    key: 'odlewki',
    label: 'Odlewki',
    name: 'SearchPageWithListingType',
    params: { listingType: 'sell-used-products' },
  },
  {
    key: 'flakony',
    label: 'Flakony',
    name: 'SearchPageWithListingType',
    params: { listingType: 'sell-new-products' },
  },
  { key: 'nowe', label: 'Nowe w folii', name: 'SearchPage', search: '?pub_stan=nowe-folia' },
];

const RefumeCategoryBar = props => {
  const { className, rootClassName } = props;
  const classes = classNames(rootClassName || css.root, className);

  return (
    <nav className={classes} aria-label="Kategorie">
      <ul className={css.list}>
        {REFUME_CATEGORY_LINKS.map(link => (
          <li key={link.key} className={css.item}>
            <NamedLink
              className={css.link}
              name={link.name}
              params={link.params}
              to={link.search ? { search: link.search } : {}}
            >
              {link.label}
            </NamedLink>
          </li>
        ))}
      </ul>
    </nav>
  );
};

export default RefumeCategoryBar;
