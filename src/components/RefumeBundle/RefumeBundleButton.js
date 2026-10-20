import React, { useEffect, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import classNames from 'classnames';

import { denormalisedResponseEntities } from '../../util/data';
import {
  getBundleShippingPublicData,
  getAvailableCarriers,
  getCheapestShipping,
} from '../../util/refumeShipping';
import { buyerFeeAmount } from '../../util/refumeFee';
import {
  cleanBundleSettings,
  bundleDiscountPercent,
  describeBundleDiscounts,
} from '../../util/refumeBundleSettings';
import NamedLink from '../NamedLink/NamedLink';

import css from './RefumeBundleButton.module.css';

const MAX_EXTRA_ITEMS = 9; // keep in sync with server/api-util/refumeBundles.js

const formatPln = subunits => `${(subunits / 100).toFixed(2).replace('.', ',')} zł`;

const IMAGE_VARIANTS = ['listing-card', 'listing-card-2x', 'scaled-small'];
const imageOf = listing => {
  const variants = listing?.images?.[0]?.attributes?.variants || {};
  const name = IMAGE_VARIANTS.find(v => variants[v]?.url);
  return name ? variants[name].url : null;
};

// Other listings of the seller that can be bought now (not added to the store on purpose:
// the listing page keeps its full data)
const fetchSellerListings = (authorId, exceptId) => (dispatch, getState, sdk) =>
  sdk.listings
    .query({
      authorId,
      minStock: 1,
      perPage: 50,
      include: ['images', 'currentStock'],
      'fields.listing': ['title', 'price', 'publicData', 'state', 'metadata'],
      'fields.image': ['variants.listing-card', 'variants.listing-card-2x', 'variants.scaled-small'],
      'limit.images': 1,
    })
    .then(response =>
      denormalisedResponseEntities(response).filter(
        l =>
          l.id.uuid !== exceptId &&
          l.attributes.price?.amount &&
          (l.attributes.publicData?.unitType || 'item') === 'item' &&
          !l.attributes.metadata?.moderacja?.ukryta &&
          (l.currentStock?.attributes?.quantity ?? 0) > 0
      )
    );

/**
 * Refume: "Kup zestaw" on the listing page — the buyer picks more items from the same
 * seller and pays one shipping fee. Opens checkout with the bundle in orderData.
 */
const RefumeBundleButton = props => {
  const { listing, isOwnListing, currentUser, onSubmit } = props;
  const dispatch = useDispatch();
  const [others, setOthers] = useState(null);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState([]);
  const dialogRef = useRef(null);

  const listingId = listing?.id?.uuid;
  const authorId = listing?.author?.id?.uuid;
  const price = listing?.attributes?.price;
  const stock = listing?.currentStock?.attributes?.quantity;
  const isPurchase = (listing?.attributes?.publicData?.transactionProcessAlias || '').startsWith(
    'default-purchase/'
  );
  // Seller's bundle settings: can be switched off, and may give a discount by item count
  const bundleSettings = cleanBundleSettings(
    listing?.author?.attributes?.profile?.publicData?.refumeZestawy
  );
  const canBundle =
    !isOwnListing &&
    !!authorId &&
    !!price?.amount &&
    isPurchase &&
    stock !== 0 &&
    !bundleSettings.wylaczone;

  useEffect(() => {
    if (!canBundle) return;
    let cancelled = false;
    setOthers(null);
    setSelected([]);
    dispatch(fetchSellerListings(authorId, listingId))
      .then(list => !cancelled && setOthers(list))
      .catch(() => !cancelled && setOthers([]));
    return () => {
      cancelled = true;
    };
  }, [listingId, authorId, canBundle]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = e => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    dialogRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (!canBundle || !others?.length) return null;

  const chosen = others.filter(l => selected.includes(l.id.uuid));
  const publicDatas = [listing.attributes.publicData, ...chosen.map(l => l.attributes.publicData)];
  const bundleShipping = getBundleShippingPublicData(publicDatas);
  const carriers = getAvailableCarriers(bundleShipping);
  const canShip = carriers.length > 0 || bundleShipping.pickupEnabled;
  const bundleShippingFrom = carriers.length ? Math.min(...carriers.map(c => c.priceInSubunits)) : 0;
  const separateShipping = publicDatas.reduce((sum, pd) => sum + (getCheapestShipping(pd) || 0), 0);
  const itemsTotal = price.amount + chosen.reduce((sum, l) => sum + l.attributes.price.amount, 0);
  const discountPercent = chosen.length ? bundleDiscountPercent(bundleSettings, chosen.length + 1) : 0;
  const discount = Math.round((itemsTotal * discountPercent) / 100);
  const fee = buyerFeeAmount(itemsTotal - discount);
  const nextTier = bundleSettings.rabaty.find(t => t.od > chosen.length + 1);
  const discountsText = describeBundleDiscounts(bundleSettings);
  const saving = Math.max(0, separateShipping - bundleShippingFrom);

  const toggle = id =>
    setSelected(list =>
      list.includes(id)
        ? list.filter(x => x !== id)
        : list.length >= MAX_EXTRA_ITEMS
        ? list
        : [...list, id]
    );

  const submit = () => {
    const refumePakiet = chosen.map(l => ({
      id: l.id.uuid,
      title: l.attributes.title,
      price: { amount: l.attributes.price.amount, currency: l.attributes.price.currency },
      image: imageOf(l),
      shipping: {
        gabaryt: l.attributes.publicData?.gabaryt,
        shippingCarriers: l.attributes.publicData?.shippingCarriers,
        pickupEnabled: !!l.attributes.publicData?.pickupEnabled,
      },
    }));
    setOpen(false);
    onSubmit({ quantity: '1', refumePakiet });
  };

  const loginNeeded = !currentUser?.id;

  return (
    <div className={css.root}>
      {loginNeeded ? (
        <NamedLink name="LoginPage" className={css.toggle}>
          Kup zestaw – jedna wysyłka
        </NamedLink>
      ) : (
        <button type="button" className={css.toggle} onClick={() => setOpen(true)}>
          Kup zestaw – jedna wysyłka
        </button>
      )}
      <p className={css.hint}>
        Ten sprzedawca ma jeszcze {others.length}{' '}
        {others.length === 1 ? 'rzecz' : 'rzeczy'}. Dobierz je i
        zapłać za jedną paczkę.
        {discountsText ? <strong className={css.discountHint}> Rabat za zestaw: {discountsText}.</strong> : null}
      </p>

      {open ? (
        <div className={css.overlay} onMouseDown={e => e.target === e.currentTarget && setOpen(false)}>
          <div
            className={css.dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="refume-bundle-title"
            tabIndex={-1}
            ref={dialogRef}
          >
            <div className={css.head}>
              <h2 id="refume-bundle-title" className={css.title}>
                Stwórz zestaw
              </h2>
              <button type="button" className={css.close} onClick={() => setOpen(false)} aria-label="Zamknij">
                ×
              </button>
            </div>
            <p className={css.sub}>
              Wybierz inne rzeczy od tego sprzedawcy. Dostaniesz wszystko w jednej paczce.
            </p>

            <ul className={css.list}>
              <li className={classNames(css.item, css.itemFixed)}>
                <span className={css.check} aria-hidden="true">✓</span>
                {imageOf(listing) ? (
                  <img src={imageOf(listing)} alt="" className={css.thumb} />
                ) : (
                  <span className={css.thumb} />
                )}
                <span className={css.itemTitle}>
                  {listing.attributes.title}
                  <span className={css.itemNote}>ta oferta</span>
                </span>
                <span className={css.itemPrice}>{formatPln(price.amount)}</span>
              </li>
              {others.map(l => {
                const id = l.id.uuid;
                const checked = selected.includes(id);
                const image = imageOf(l);
                return (
                  <li key={id}>
                    <label className={classNames(css.item, { [css.itemChecked]: checked })}>
                      <input
                        type="checkbox"
                        className={css.checkbox}
                        checked={checked}
                        disabled={!checked && selected.length >= MAX_EXTRA_ITEMS}
                        onChange={() => toggle(id)}
                      />
                      {image ? <img src={image} alt="" className={css.thumb} loading="lazy" /> : <span className={css.thumb} />}
                      <span className={css.itemTitle}>{l.attributes.title}</span>
                      <span className={css.itemPrice}>{formatPln(l.attributes.price.amount)}</span>
                    </label>
                  </li>
                );
              })}
            </ul>

            <div className={css.summary}>
              <div className={css.row}>
                <span>Rzeczy ({chosen.length + 1})</span>
                <span>{formatPln(itemsTotal)}</span>
              </div>
              {discount ? (
                <div className={classNames(css.row, css.discountRow)}>
                  <span>Rabat za zestaw (−{discountPercent}%)</span>
                  <span>−{formatPln(discount)}</span>
                </div>
              ) : null}
              <div className={css.row}>
                <span>Ochrona Kupującego</span>
                <span>{formatPln(fee)}</span>
              </div>
              <div className={css.row}>
                <span>Wysyłka (jedna paczka)</span>
                <span>{carriers.length ? `od ${formatPln(bundleShippingFrom)}` : '—'}</span>
              </div>
              {nextTier ? (
                <p className={css.nextTier}>
                  Dobierz {nextTier.od - chosen.length - 1}{' '}
                  {nextTier.od - chosen.length - 1 === 1 ? 'rzecz' : 'rzeczy'}, a dostaniesz −
                  {nextTier.procent}% na cały zestaw.
                </p>
              ) : null}
              {chosen.length && saving > 0 ? (
                <p className={css.saving}>Oszczędzasz ok. {formatPln(saving)} na wysyłce.</p>
              ) : null}
              {!canShip ? (
                <p className={css.warning}>
                  Tych rzeczy nie da się wysłać razem (różne gabaryty lub przewoźnicy). Odznacz
                  ostatnio dodaną.
                </p>
              ) : null}
            </div>

            <button
              type="button"
              className={css.primary}
              disabled={!chosen.length || !canShip}
              onClick={submit}
            >
              {chosen.length ? `Kup zestaw (${chosen.length + 1})` : 'Zaznacz co najmniej jedną rzecz'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default RefumeBundleButton;
