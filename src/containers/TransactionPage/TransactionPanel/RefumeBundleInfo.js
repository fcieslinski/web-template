import React from 'react';
import classNames from 'classnames';

import { NamedLink } from '../../../components';

import css from './RefumeBundleInfo.module.css';

const formatPrice = price =>
  price?.amount != null
    ? `${(price.amount / 100).toFixed(2).replace('.', ',')} ${price.currency === 'PLN' ? 'zł' : price.currency}`
    : '';

/**
 * Refume: items of a bundle order (transaction metadata.refumePakiet, set by the server).
 */
const RefumeBundleInfo = props => {
  const { className, bundle, listing, isProvider } = props;
  const items = Array.isArray(bundle?.items) ? bundle.items : [];
  if (!items.length) return null;
  const all = [
    { id: listing?.id?.uuid, title: listing?.attributes?.title, price: listing?.attributes?.price },
    ...items,
  ];
  return (
    <div className={classNames(css.root, className)}>
      <h3 className={css.title}>Zestaw · {all.length} rzeczy</h3>
      <p className={css.sub}>
        {isProvider
          ? 'Wyślij wszystkie rzeczy razem, w jednej paczce.'
          : 'Sprzedawca wyśle wszystko w jednej paczce.'}
      </p>
      <ul className={css.list}>
        {all.map(item => (
          <li key={item.id} className={css.item}>
            {item.id ? (
              <NamedLink name="ListingPageCanonical" params={{ id: item.id }} className={css.link}>
                {item.title}
              </NamedLink>
            ) : (
              <span>{item.title}</span>
            )}
            <span className={css.price}>{formatPrice(item.price)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default RefumeBundleInfo;
