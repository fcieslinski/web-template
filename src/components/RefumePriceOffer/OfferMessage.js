import React, { useState } from 'react';
import classNames from 'classnames';

import { respondToPriceOffer } from '../../util/api';
import {
  isAcceptedOfferValid,
  formatPln,
  parsePlnToSubunits,
  validateOfferInput,
  ACCEPTED_OFFER_VALID_HOURS,
} from '../../util/refumeOffers';

import css from './OfferMessage.module.css';

const errorText = e =>
  e?.status === 403
    ? 'Nie możesz odpowiedzieć na tę propozycję.'
    : e?.status === 409
    ? 'Ta propozycja jest już nieaktualna. Odśwież stronę.'
    : e?.status === 400
    ? 'Ta kwota nie jest możliwa.'
    : 'Coś poszło nie tak. Spróbuj ponownie.';

const TagIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
    <path d="M20 12l-8 8-9-9V3h8z" />
    <circle cx="7.5" cy="7.5" r="1.5" />
  </svg>
);
const CounterIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
    <path d="M9 14l-5-5 5-5" />
    <path d="M4 9h11a5 5 0 0 1 0 10h-3" />
  </svg>
);
const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden="true">
    <path d="M5 12l5 5 9-10" />
  </svg>
);

const percentOff = (amount, price) =>
  price?.amount ? Math.round((1 - amount / price.amount) * 100) : null;

/**
 * Refume: one price offer shown in the chat timeline, like a message. The newest pending
 * offer has Akceptuj / Kontroferta / Odrzuć for the person who has to answer it.
 *
 * @param {Object} props.offer { by, amount, currency, status, createdAt, decidedAt? }
 * @param {boolean} props.isCounter this offer answers the previous one
 * @param {boolean} props.isLast newest offer in the conversation
 * @param {'customer'|'provider'} props.role viewer's role
 * @param {Object} props.listingPrice Money
 * @param {Object} props.transactionId UUID
 * @param {string} props.otherName the other person's name
 * @param {string} props.formattedDate
 * @param {Function} props.onChanged refetch after an action
 */
const OfferMessage = props => {
  const {
    offer,
    isCounter,
    isLast,
    active = true,
    role,
    listingPrice,
    transactionId,
    otherName,
    formattedDate,
    onChanged,
  } = props;
  const [countering, setCountering] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState(null);
  const [inProgress, setInProgress] = useState(false);

  const isMine = offer.by === role;
  const canAnswer = active && isLast && offer.status === 'pending' && !isMine;
  const acceptedValid = active && isLast && isAcceptedOfferValid(offer);
  const off = percentOff(offer.amount, listingPrice);
  const label = isMine
    ? isCounter
      ? 'Twoja kontroferta'
      : 'Twoja propozycja'
    : isCounter
    ? 'Kontroferta'
    : 'Propozycja ceny';

  const send = (action, amount) => {
    setInProgress(true);
    setError(null);
    respondToPriceOffer({ transactionId, action, amount })
      .then(() => {
        setInProgress(false);
        setCountering(false);
        setValue('');
        if (onChanged) onChanged();
      })
      .catch(e => {
        setInProgress(false);
        setError(errorText(e));
      });
  };

  const submitCounter = e => {
    e.preventDefault();
    const amount = parsePlnToSubunits(value);
    const validation = validateOfferInput(amount, listingPrice?.amount);
    if (validation) {
      setError(validation);
      return;
    }
    send('counter', amount);
  };

  // Answered offers that are no longer current: one compact line
  if (!isLast && (offer.status === 'countered' || offer.status === 'rejected')) {
    return (
      <div className={classNames(css.line, isMine ? css.lineRight : css.lineLeft)}>
        <span className={css.compact}>
          {label} <s>{formatPln(offer.amount)}</s> ·{' '}
          {offer.status === 'countered' ? 'odpowiedź: kontroferta' : 'odrzucona'}
        </span>
      </div>
    );
  }

  const tone =
    offer.status === 'accepted'
      ? css.accepted
      : offer.status === 'pending'
      ? css.pending
      : css.closed;

  const status = !active
    ? offer.status === 'accepted'
      ? 'Cena ustalona.'
      : offer.status === 'pending'
      ? 'Propozycja nieaktualna.'
      : offer.status === 'rejected'
      ? 'Odrzucona.'
      : 'Odpowiedziano kontrofertą.'
    : offer.status === 'pending'
      ? isMine
        ? `Czeka na odpowiedź${otherName ? ` – ${otherName}` : ''}.`
        : role === 'customer'
        ? 'Po akceptacji kupisz za tę cenę + wysyłka.'
        : 'Kupujący proponuje tę cenę.'
      : offer.status === 'accepted'
      ? acceptedValid
        ? role === 'customer'
          ? `Cena czeka na Ciebie ${ACCEPTED_OFFER_VALID_HOURS} h.`
          : 'Kupujący może teraz kupić za tę cenę.'
        : 'Zaakceptowana propozycja wygasła.'
      : offer.status === 'rejected'
      ? 'Odrzucona.'
      : 'Odpowiedziano kontrofertą.';

  return (
    <div className={classNames(css.line, isMine ? css.lineRight : css.lineLeft)}>
      <div className={css.wrap}>
        <div className={classNames(css.card, tone, isMine ? css.cardMine : css.cardTheirs)}>
          <div className={css.body}>
            <span className={css.label}>
              {offer.status === 'accepted' ? <CheckIcon /> : isCounter ? <CounterIcon /> : <TagIcon />}
              {offer.status === 'accepted' ? `${label} zaakceptowana` : label}
            </span>
            <div className={css.amountRow}>
              <span className={classNames(css.amount, { [css.amountStruck]: offer.status === 'rejected' })}>
                {formatPln(offer.amount)}
              </span>
              {listingPrice?.amount ? <s className={css.oldPrice}>{formatPln(listingPrice.amount)}</s> : null}
              {off > 0 && offer.status !== 'rejected' ? <span className={css.off}>−{off}%</span> : null}
            </div>
            <span className={css.status}>{status}</span>
          </div>

          {canAnswer && !countering ? (
            <div className={css.actions}>
              <button type="button" className={css.accept} disabled={inProgress} onClick={() => send('accept')}>
                Akceptuj
              </button>
              <button type="button" className={css.counter} disabled={inProgress} onClick={() => setCountering(true)}>
                Kontroferta
              </button>
              <button type="button" className={css.reject} disabled={inProgress} onClick={() => send('reject')}>
                Odrzuć
              </button>
            </div>
          ) : null}

          {canAnswer && countering ? (
            <form className={css.counterForm} onSubmit={submitCounter}>
              <label className={css.counterLabel} htmlFor={`counter-${offer.createdAt}`}>
                Twoja cena
              </label>
              <div className={css.counterRow}>
                <span className={css.inputWrap}>
                  <input
                    id={`counter-${offer.createdAt}`}
                    className={css.input}
                    inputMode="decimal"
                    autoComplete="off"
                    autoFocus
                    value={value}
                    onChange={e => setValue(e.target.value)}
                  />
                  <span className={css.suffix}>zł</span>
                </span>
                <button type="submit" className={css.accept} disabled={inProgress}>
                  Wyślij
                </button>
                <button type="button" className={css.reject} disabled={inProgress} onClick={() => setCountering(false)}>
                  Anuluj
                </button>
              </div>
            </form>
          ) : null}

          {acceptedValid && role === 'customer' ? (
            <div className={css.actions}>
              <a href="#refume-buy" className={css.buy}>
                Kup za {formatPln(offer.amount)}
              </a>
            </div>
          ) : null}

          {error ? (
            <p className={css.error} role="alert">
              {error}
            </p>
          ) : null}
        </div>
        {formattedDate ? <span className={css.date}>{formattedDate}</span> : null}
      </div>
    </div>
  );
};

/** Short status line in the chat when an offer is accepted or rejected. */
export const OfferDecision = ({ offer }) => (
  <div className={css.decisionLine}>
    <span className={classNames(css.decision, { [css.decisionAccepted]: offer.status === 'accepted' })}>
      {offer.status === 'accepted'
        ? `Cena ustalona na ${formatPln(offer.amount)}`
        : `Propozycja ${formatPln(offer.amount)} odrzucona`}
    </span>
  </div>
);

export default OfferMessage;
