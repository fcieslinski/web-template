import React, { useState } from 'react';
import { useHistory } from 'react-router-dom';

import { makePriceOffer } from '../../util/api';
import { useRouteConfiguration } from '../../context/routeConfigurationContext';
import { createResourceLocatorString } from '../../util/routes';
import {
  formatPln,
  parsePlnToSubunits,
  validateOfferInput,
  MIN_OFFER_SHARE,
} from '../../util/refumeOffers';
import NamedLink from '../NamedLink/NamedLink';

import css from './RefumePriceOffer.module.css';

const errorText = e =>
  e?.status === 401
    ? 'Zaloguj się, żeby wysłać propozycję.'
    : e?.status === 409
    ? 'Masz już propozycję, która czeka na odpowiedź sprzedawcy.'
    : e?.status === 400
    ? 'Ta propozycja nie jest możliwa. Sprawdź kwotę.'
    : 'Nie udało się wysłać propozycji. Spróbuj ponownie.';

/**
 * Refume: "Zaproponuj cenę" on the listing page. Sends the offer into a chat with
 * the seller and opens that conversation.
 */
const MakeOfferButton = props => {
  const { listing, isOwnListing, currentUser } = props;
  const history = useHistory();
  const routes = useRouteConfiguration();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState(null);
  const [inProgress, setInProgress] = useState(false);

  const price = listing?.attributes?.price;
  const processAlias = listing?.attributes?.publicData?.transactionProcessAlias || '';
  const stock = listing?.currentStock?.attributes?.quantity;
  if (
    isOwnListing ||
    !price?.amount ||
    !processAlias.startsWith('default-purchase/') ||
    stock === 0
  ) {
    return null;
  }

  if (!currentUser?.id) {
    return (
      <div className={css.root}>
        <NamedLink name="LoginPage" className={css.toggle} style={{ display: 'block', textAlign: 'center', lineHeight: '28px' }}>
          Zaproponuj cenę
        </NamedLink>
      </div>
    );
  }

  const inputId = `offer-${listing.id.uuid}`;

  const handleSubmit = e => {
    e.preventDefault();
    const amount = parsePlnToSubunits(value);
    const validation = validateOfferInput(amount, price.amount);
    if (validation) {
      setError(validation);
      return;
    }
    setError(null);
    setInProgress(true);
    makePriceOffer({ listingId: listing.id, amount })
      .then(response => {
        const id = response?.data?.transactionId;
        history.push(createResourceLocatorString('OrderDetailsPage', routes, { id }, {}));
      })
      .catch(err => {
        setError(errorText(err));
        setInProgress(false);
      });
  };

  return (
    <div className={css.root}>
      {open ? (
        <form className={css.form} onSubmit={handleSubmit}>
          <label htmlFor={inputId} className={css.label}>
            Twoja propozycja (cena: {formatPln(price.amount)})
          </label>
          <div className={css.inputRow}>
            <input
              id={inputId}
              className={css.input}
              inputMode="decimal"
              autoComplete="off"
              value={value}
              onChange={e => setValue(e.target.value)}
              placeholder={formatPln(Math.round(price.amount * 0.85)).replace(' zł', '')}
            />
            <span className={css.suffix}>zł</span>
          </div>
          <p className={css.hint}>
            Minimum {formatPln(Math.ceil(price.amount * MIN_OFFER_SHARE))}. Sprzedawca może
            przyjąć, odrzucić albo zaproponować inną cenę.
          </p>
          {error ? (
            <p className={css.error} role="alert">
              {error}
            </p>
          ) : null}
          <div className={css.buttons}>
            <button type="submit" className={css.primary} disabled={inProgress}>
              {inProgress ? 'Wysyłanie…' : 'Wyślij propozycję'}
            </button>
            <button
              type="button"
              className={css.secondary}
              disabled={inProgress}
              onClick={() => setOpen(false)}
            >
              Anuluj
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className={css.toggle} onClick={() => setOpen(true)}>
          Zaproponuj cenę
        </button>
      )}
    </div>
  );
};

export default MakeOfferButton;
