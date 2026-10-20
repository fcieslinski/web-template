import React from 'react';

import { bundleDiscountPercent } from '../../util/refumeBundleSettings';

import css from './RefumeBundleItems.module.css';

const formatPrice = price =>
  price?.amount != null
    ? `${(price.amount / 100).toFixed(2).replace('.', ',')} ${price.currency === 'PLN' ? 'zł' : price.currency}`
    : '';

/** Refume: the other listings of a bundle saved in checkout orderData (display data only). */
export const getBundleItems = orderData =>
  (Array.isArray(orderData?.refumePakiet) ? orderData.refumePakiet : []).filter(
    i => i && typeof i.id === 'string'
  );

/**
 * Refume: "Pakiet" box on the checkout page — every item of the order, one parcel.
 */
const RefumeBundleItems = props => {
  const { listing, items, hasDeliveryOptions } = props;
  if (!items?.length) return null;
  const percent = bundleDiscountPercent(
    listing?.author?.attributes?.profile?.publicData?.refumeZestawy,
    items.length + 1
  );
  const discountText = percent ? `Sprzedawca daje −${percent}% rabatu za ten zestaw.` : '';
  const firstImage = listing?.images?.[0]?.attributes?.variants;
  const mainImage =
    firstImage?.['listing-card']?.url || firstImage?.['scaled-small']?.url || null;
  const all = [
    {
      id: listing?.id?.uuid,
      title: listing?.attributes?.title,
      price: listing?.attributes?.price,
      image: mainImage,
    },
    ...items,
  ];
  return (
    <section className={css.root} aria-label="Zestaw">
      <h2 className={css.title}>
        Zestaw · {all.length} rzeczy
      </h2>
      <p className={css.sub}>
        Wszystko od jednego sprzedawcy, w jednej paczce – płacisz za jedną wysyłkę.
        {discountText ? ` ${discountText}` : ''}
      </p>
      <ul className={css.list}>
        {all.map(item => (
          <li key={item.id} className={css.item}>
            {item.image ? (
              <img src={item.image} alt="" className={css.thumb} loading="lazy" />
            ) : (
              <span className={css.thumb} aria-hidden="true" />
            )}
            <span className={css.itemTitle}>{item.title}</span>
            <span className={css.itemPrice}>{formatPrice(item.price)}</span>
          </li>
        ))}
      </ul>
      {!hasDeliveryOptions ? (
        <p className={css.warning}>
          Te rzeczy nie mają wspólnego sposobu wysyłki. Wróć do oferty i zmień skład zestawu.
        </p>
      ) : null}
    </section>
  );
};

export default RefumeBundleItems;
