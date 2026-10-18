import React from 'react';
import classNames from 'classnames';

import { getAvailableCarriers, getShippingCarrier } from '../../util/refumeShipping';

import css from './RefumeDeliveryPicker.module.css';

const formatPrice = subunits => `${(subunits / 100).toFixed(2).replace('.', ',')} zł`;

/**
 * Refume: delivery options for a listing — the carriers the seller enabled for the
 * parcel size, plus personal pickup when the seller allows it.
 * @returns {Array<{ key, label, price?, deliveryMethod, carrier? }>}
 */
export const getDeliveryOptions = publicData => {
  // Refume ships everything: shipping options are always offered (old listings get defaults)
  const { pickupEnabled } = publicData || {};
  const carriers = getAvailableCarriers(publicData);
  const shipping = carriers.map(c => ({
    key: c.key,
    label: c.label,
    price: c.priceInSubunits,
    deliveryMethod: 'shipping',
    carrier: c,
  }));
  const pickup = pickupEnabled
    ? [{ key: 'pickup', label: 'Odbiór osobisty', price: 0, deliveryMethod: 'pickup' }]
    : [];
  return [...shipping, ...pickup];
};

/** Whether orderData has a complete delivery choice. */
export const isDeliveryChosen = (orderData, options) => {
  if (!options.length) {
    return true;
  }
  const { deliveryMethod, shippingCarrier, shippingPointCode } = orderData || {};
  if (deliveryMethod === 'pickup') {
    return options.some(o => o.deliveryMethod === 'pickup');
  }
  if (deliveryMethod !== 'shipping') {
    return false;
  }
  const option = options.find(o => o.key === shippingCarrier);
  if (!option) {
    return false;
  }
  return !option.carrier.needsPickupPoint || !!shippingPointCode?.trim();
};

/**
 * @param {Object} props
 * @param {Array} props.options from getDeliveryOptions
 * @param {Object} props.orderData current order data
 * @param {Function} props.onChange (orderDataChanges, { reprice: boolean })
 */
const RefumeDeliveryPicker = props => {
  const { options, orderData, onChange } = props;
  if (!options.length) {
    return null;
  }
  const { deliveryMethod, shippingCarrier, shippingPointCode } = orderData || {};
  const selectedKey =
    deliveryMethod === 'pickup' ? 'pickup' : deliveryMethod === 'shipping' ? shippingCarrier : null;
  const selectedCarrier =
    deliveryMethod === 'shipping' ? getShippingCarrier(shippingCarrier) : null;

  const select = option => {
    if (option.key === selectedKey) {
      return;
    }
    onChange(
      option.deliveryMethod === 'pickup'
        ? { deliveryMethod: 'pickup', shippingCarrier: null, shippingPointCode: null }
        : { deliveryMethod: 'shipping', shippingCarrier: option.key, shippingPointCode: null },
      { reprice: true }
    );
  };

  const pointId = 'refume-delivery-point';

  return (
    <fieldset className={css.root}>
      <legend className={css.legend}>Dostawa</legend>
      <div className={css.options} role="radiogroup">
        {options.map(option => {
          const id = `refume-delivery-${option.key}`;
          const checked = option.key === selectedKey;
          return (
            <label
              key={option.key}
              htmlFor={id}
              className={classNames(css.option, { [css.optionSelected]: checked })}
            >
              <input
                id={id}
                type="radio"
                name="refumeDelivery"
                className={css.radio}
                checked={checked}
                onChange={() => select(option)}
              />
              <span className={css.optionLabel}>{option.label}</span>
              <span className={css.optionPrice}>
                {option.deliveryMethod === 'pickup' ? 'za darmo' : formatPrice(option.price)}
              </span>
            </label>
          );
        })}
      </div>

      {selectedCarrier?.needsPickupPoint ? (
        <div className={css.point}>
          <label htmlFor={pointId} className={css.pointLabel}>
            {selectedCarrier.pickupPointLabel}
          </label>
          <input
            id={pointId}
            className={css.pointInput}
            value={shippingPointCode || ''}
            placeholder={selectedCarrier.pickupPointPlaceholder}
            autoComplete="off"
            onChange={e => onChange({ shippingPointCode: e.target.value }, { reprice: false })}
          />
        </div>
      ) : null}
    </fieldset>
  );
};

export default RefumeDeliveryPicker;
