import React from 'react';
import Decimal from 'decimal.js';

import { useIntl } from '../../../util/reactIntl';
import { formatMoney } from '../../../util/currency';
import { types as sdkTypes } from '../../../util/sdkLoader';

import css from './RefumeOrderSummary.module.css';

const { Money } = sdkTypes;

const COMMISSION = 'line-item/customer-commission';
const SHIPPING = 'line-item/shipping-fee';

const forCustomer = item => item.includeFor?.includes('customer') && !item.reversal;
const amountOf = item => new Decimal(item?.lineTotal?.amount || 0);

/**
 * Refume: compact order summary on the listing page — the item and the buyer protection
 * in small text, and the total to pay big and bold.
 *
 * @param {Object} props
 * @param {Array<Object>} props.lineItems estimated line items from the server
 * @param {string} props.currency
 */
const RefumeOrderSummary = props => {
  const { lineItems = [], currency } = props;
  const intl = useIntl();

  const customerItems = lineItems.filter(forCustomer);
  if (!customerItems.length) {
    return null;
  }
  const fee = customerItems.find(i => i.code === COMMISSION);
  const shipping = customerItems.find(i => i.code === SHIPPING);
  const itemTotal = customerItems
    .filter(i => i.code !== COMMISSION && i.code !== SHIPPING)
    .reduce((sum, i) => sum.add(amountOf(i)), new Decimal(0));
  const total = customerItems.reduce((sum, i) => sum.add(amountOf(i)), new Decimal(0));

  const format = decimal => formatMoney(intl, new Money(decimal.toNumber(), currency));

  return (
    <section className={css.root} aria-label="Podsumowanie zamówienia">
      <dl className={css.rows}>
        <div className={css.row}>
          <dt>Cena przedmiotu</dt>
          <dd>{format(itemTotal)}</dd>
        </div>
        {fee ? (
          <div className={css.row}>
            <dt>Ochrona Kupującego</dt>
            <dd>{format(amountOf(fee))}</dd>
          </div>
        ) : null}
        <div className={css.row}>
          <dt>Wysyłka</dt>
          <dd className={shipping ? null : css.muted}>
            {shipping ? format(amountOf(shipping)) : 'wybierzesz w następnym kroku'}
          </dd>
        </div>
      </dl>
      <div className={css.total}>
        <span className={css.totalLabel}>Do zapłaty{shipping ? '' : ' bez wysyłki'}</span>
        <strong className={css.totalAmount}>{format(total)}</strong>
      </div>
    </section>
  );
};

export default RefumeOrderSummary;
