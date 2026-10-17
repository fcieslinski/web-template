/**
 * Refume: buyer protection fee shown next to prices. Keep in sync with
 * server/api-util/refumeFee.js (the server is what actually charges it).
 */
import { types as sdkTypes } from './sdkLoader';

export const BUYER_FEE_PERCENT = 10;

/** Fee in subunits for an item price in subunits (rounded half up, like the server). */
export const buyerFeeAmount = amount => Math.round((amount * BUYER_FEE_PERCENT) / 100);

/** Item price + buyer fee, as Money. */
export const priceWithBuyerFee = price =>
  price?.amount != null
    ? new sdkTypes.Money(price.amount + buyerFeeAmount(price.amount), price.currency)
    : null;
