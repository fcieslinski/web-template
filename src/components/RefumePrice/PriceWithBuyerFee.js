import React from 'react';

import { formatMoney } from '../../util/currency';
import { priceWithBuyerFee } from '../../util/refumeFee';
import BuyerProtectionInfo, { ShieldIcon } from './BuyerProtectionInfo';

import css from './RefumePrice.module.css';

/**
 * Refume: Vinted-style price — item price, then the bold fee-inclusive price with a
 * "z Ochroną Kupującego" explanation.
 */
export const PriceWithBuyerFee = ({ price, intl }) => {
  const total = priceWithBuyerFee(price);
  if (!total) {
    return null;
  }
  return (
    <div className={css.root}>
      <span className={css.itemPrice}>{formatMoney(intl, price)}</span>
      <span className={css.totalPrice}>{formatMoney(intl, total)}</span>
      <BuyerProtectionInfo />
    </div>
  );
};

/** Small fee-inclusive price for listing cards. */
export const CardPriceWithBuyerFee = ({ price, intl }) => {
  const total = priceWithBuyerFee(price);
  if (!total) {
    return null;
  }
  return (
    <span className={css.cardTotal} title="Cena z Ochroną Kupującego">
      {formatMoney(intl, total)}
      <ShieldIcon className={css.cardShield} />
    </span>
  );
};

export default PriceWithBuyerFee;
