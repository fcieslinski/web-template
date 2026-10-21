import React, { useState } from 'react';
import classNames from 'classnames';

import { respondToPriceOffer } from '../../util/api';
import {
  getOffers,
  getLastOffer,
  isAcceptedOfferValid,
  formatPln,
  parsePlnToSubunits,
  validateOfferInput,
  ACCEPTED_OFFER_VALID_HOURS,
} from '../../util/refumeOffers';

import css from './RefumePriceOffer.module.css';

const STATUS_LABEL = {
  pending: 'czeka',
  accepted: 'zaakceptowana',
  rejected: 'odrzucona',
  countered: 'kontroferta',
};

const errorText = e =>
  e?.status === 403
    ? 'Nie możesz odpowiedzieć na tę propozycję.'
    : e?.status === 409
    ? 'Ta propozycja jest już nieaktualna. Odśwież stronę.'
    : e?.status === 400
    ? 'Ta kwota nie jest możliwa.'
    : 'Coś poszło nie tak. Spróbuj ponownie.';

/**
 * Refume: offer status and actions inside the chat (inquiry state).
 *
 * @param {Object} props
 * @param {Object} props.transaction
 * @param {Object} props.listing
 * @param {'customer'|'provider'} props.role
 * @param {Function} props.onChanged called after a successful action (refetch)
 */
const OffersPanel = props => {
  const { transaction, listing, role, onChanged, compact } = props;
  const [countering, setCountering] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState(null);
  const [inProgress, setInProgress] = useState(false);

  const [proposing, setProposing] = useState(false);

  const metadata = transaction?.attributes?.metadata;
  const offers = getOffers(metadata);
  const last = getLastOffer(metadata);
  const price = listing?.attributes?.price;
  if (!price) {
    return null;
  }

  const isMine = last?.by === role;
  const canAnswer = last?.status === 'pending' && !isMine;
  const acceptedValid = isAcceptedOfferValid(last);
  // Anyone can propose a price when nothing is waiting for an answer
  const canPropose = !last || (last.status !== 'pending' && !acceptedValid);

  const send = (action, amount) => {
    setInProgress(true);
    setError(null);
    respondToPriceOffer({ transactionId: transaction.id, action, amount })
      .then(() => {
        setCountering(false);
        setProposing(false);
        setValue('');
        setInProgress(false);
        onChanged && onChanged();
      })
      .catch(e => {
        setError(errorText(e));
        setInProgress(false);
      });
  };

  const handleCounter = e => {
    e.preventDefault();
    const amount = parsePlnToSubunits(value);
    const validation = validateOfferInput(amount, price.amount);
    if (validation) {
      setError(validation);
      return;
    }
    send('counter', amount);
  };

  const handlePropose = e => {
    e.preventDefault();
    const amount = parsePlnToSubunits(value);
    const validation = validateOfferInput(amount, price.amount);
    if (validation) {
      setError(validation);
      return;
    }
    send('propose', amount);
  };

  const proposeLabel = role === 'provider' ? 'Zaproponuj niższą cenę' : 'Zaproponuj cenę';
  const proposeId = `propose-${transaction.id.uuid}`;
  const proposeBlock = proposing ? (
    <form className={css.form} onSubmit={handlePropose}>
      <label htmlFor={proposeId} className={css.label}>
        {role === 'provider' ? 'Cena dla tego kupującego' : 'Twoja propozycja'} (cena w ofercie:{' '}
        {formatPln(price.amount)})
      </label>
      <div className={css.inputRow}>
        <input
          id={proposeId}
          className={css.input}
          inputMode="decimal"
          autoComplete="off"
          autoFocus
          value={value}
          onChange={e => setValue(e.target.value)}
        />
        <span className={css.suffix}>zł</span>
      </div>
      <div className={css.buttons}>
        <button type="submit" className={css.primary} disabled={inProgress}>
          Wyślij propozycję
        </button>
        <button
          type="button"
          className={css.secondary}
          disabled={inProgress}
          onClick={() => {
            setProposing(false);
            setError(null);
          }}
        >
          Anuluj
        </button>
      </div>
    </form>
  ) : (
    <button
      type="button"
      className={css.secondary}
      disabled={inProgress}
      onClick={() => {
        setValue('');
        setError(null);
        setProposing(true);
      }}
    >
      {proposeLabel}
    </button>
  );

  // Refume: offers are shown in the chat as cards; above the message box only the
  // "Zaproponuj cenę" button stays, when a new offer can be sent.
  if (compact) {
    if (!canPropose) return null;
    return (
      <div className={css.compactBox}>
        {proposing ? (
          <form className={css.compactForm} onSubmit={handlePropose}>
            <label htmlFor={proposeId} className={css.compactLabel}>
              {role === 'provider' ? 'Cena dla kupującego' : 'Twoja propozycja'}
              <span className={css.compactHint}> · w ofercie {formatPln(price.amount)}</span>
            </label>
            <div className={css.compactRow}>
              <span className={css.compactInputWrap}>
                <input
                  id={proposeId}
                  className={css.compactInput}
                  inputMode="decimal"
                  autoComplete="off"
                  autoFocus
                  value={value}
                  onChange={e => setValue(e.target.value)}
                />
                <span className={css.compactSuffix}>zł</span>
              </span>
              <button type="submit" className={css.compactSend} disabled={inProgress}>
                Wyślij
              </button>
              <button
                type="button"
                className={css.compactCancel}
                disabled={inProgress}
                onClick={() => {
                  setProposing(false);
                  setError(null);
                }}
              >
                Anuluj
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            className={css.proposeChip}
            onClick={() => {
              setValue('');
              setError(null);
              setProposing(true);
            }}
          >
            {proposeLabel}
          </button>
        )}
        {error ? (
          <p className={css.error} role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  // No offer yet: just the button
  if (!last) {
    return (
      <section className={css.panel} aria-label="Propozycja ceny">
        <p className={css.panelTitle}>Negocjacja ceny</p>
        <p className={css.statusText}>
          {role === 'provider'
            ? 'Możesz zaproponować kupującemu niższą cenę.'
            : `Cena w ofercie: ${formatPln(price.amount)}. Zaproponuj swoją.`}
        </p>
        {proposeBlock}
        {error ? (
          <p className={css.error} role="alert">
            {error}
          </p>
        ) : null}
      </section>
    );
  }

  const who = isMine ? 'Twoja propozycja' : role === 'customer' ? 'Propozycja sprzedawcy' : 'Propozycja kupującego';

  const status =
    last.status === 'pending'
      ? isMine
        ? 'Czekasz na odpowiedź.'
        : 'Czeka na Twoją odpowiedź.'
      : last.status === 'accepted'
      ? acceptedValid
        ? role === 'customer'
          ? `Zaakceptowana! Kup poniżej za tę cenę. Oferta jest ważna ${ACCEPTED_OFFER_VALID_HOURS} h.`
          : 'Zaakceptowana. Kupujący może teraz kupić za tę cenę.'
        : 'Zaakceptowana propozycja wygasła. Można wysłać nową.'
      : last.status === 'rejected'
      ? 'Odrzucona.'
      : '';

  const inputId = `counter-${transaction.id.uuid}`;

  return (
    <section className={css.panel} aria-label="Propozycja ceny">
      <p className={css.panelTitle}>{who}</p>
      <div>
        <span className={css.amount}>{formatPln(last.amount)}</span>
        <span className={css.strike}>{formatPln(price.amount)}</span>
      </div>
      {status ? (
        <p className={classNames(css.statusText, { [css.accepted]: acceptedValid })}>{status}</p>
      ) : null}

      {canAnswer && !countering ? (
        <div className={css.buttons}>
          <button
            type="button"
            className={css.primary}
            disabled={inProgress}
            onClick={() => send('accept')}
          >
            Akceptuj
          </button>
          <button
            type="button"
            className={css.secondary}
            disabled={inProgress}
            onClick={() => setCountering(true)}
          >
            Inna cena
          </button>
          <button
            type="button"
            className={css.secondary}
            disabled={inProgress}
            onClick={() => send('reject')}
          >
            Odrzuć
          </button>
        </div>
      ) : null}

      {canAnswer && countering ? (
        <form className={css.form} onSubmit={handleCounter}>
          <label htmlFor={inputId} className={css.label}>
            Twoja cena
          </label>
          <div className={css.inputRow}>
            <input
              id={inputId}
              className={css.input}
              inputMode="decimal"
              autoComplete="off"
              value={value}
              onChange={e => setValue(e.target.value)}
            />
            <span className={css.suffix}>zł</span>
          </div>
          <div className={css.buttons}>
            <button type="submit" className={css.primary} disabled={inProgress}>
              Wyślij
            </button>
            <button
              type="button"
              className={css.secondary}
              disabled={inProgress}
              onClick={() => setCountering(false)}
            >
              Anuluj
            </button>
          </div>
        </form>
      ) : null}

      {canPropose ? <div className={css.proposeAgain}>{proposeBlock}</div> : null}

      {error ? (
        <p className={css.error} role="alert">
          {error}
        </p>
      ) : null}

      {offers.length > 1 ? (
        <ul className={css.history}>
          {offers.slice(0, -1).map((o, i) => (
            <li key={`${o.createdAt}-${i}`}>
              {o.by === 'customer' ? 'Kupujący' : 'Sprzedawca'}: {formatPln(o.amount)} (
              {STATUS_LABEL[o.status] || o.status})
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
};

export default OffersPanel;
