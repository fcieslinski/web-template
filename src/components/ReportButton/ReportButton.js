import React, { useEffect, useRef, useState } from 'react';
import classNames from 'classnames';
import { useHistory } from 'react-router-dom';
import { useSelector } from 'react-redux';

import { createReport } from '../../util/api';
import { useRouteConfiguration } from '../../context/routeConfigurationContext';
import { createResourceLocatorString } from '../../util/routes';

import css from './ReportButton.module.css';

// Keep the keys in sync with server/api/refume-moderation-panel.js (REPORT_REASONS)
const REASONS = {
  oferta: [
    ['podrobka', 'Podejrzenie podróbki'],
    ['niezgodne-z-opisem', 'Niezgodne z opisem lub zdjęciami'],
    ['oszustwo', 'Oszustwo lub płatność poza Refume'],
    ['niedozwolone', 'Niedozwolony produkt'],
    ['spam', 'Spam lub powielona oferta'],
    ['inne', 'Inne'],
  ],
  rozmowa: [
    ['kontakt', 'Namawia do kontaktu lub płatności poza Refume'],
    ['phishing', 'Podejrzany link lub prośba o dane (karta, BLIK, login)'],
    ['oszustwo', 'Próba oszustwa'],
    ['zachowanie', 'Obraźliwe zachowanie'],
    ['spam', 'Spam'],
    ['inne', 'Inne'],
  ],
  uzytkownik: [
    ['oszustwo', 'Oszustwo lub płatność poza Refume'],
    ['podrobka', 'Sprzedaje podróbki'],
    ['zachowanie', 'Obraźliwe zachowanie'],
    ['spam', 'Spam'],
    ['inne', 'Inne'],
  ],
};

const FlagIcon = () => (
  <svg viewBox="0 0 20 20" className={css.icon} aria-hidden="true" focusable="false">
    <path
      d="M4 18V3m0 1h10l-2 3.5L14 11H4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * Refume: "Zgłoś ofertę" / "Zgłoś użytkownika" link with a small dialog. The report goes to
 * the moderators; the reported person never learns who reported them.
 *
 * @param {Object} props
 * @param {'oferta'|'uzytkownik'|'rozmowa'} props.type
 * @param {string} props.targetId listing, user or transaction uuid
 */
const ReportButton = props => {
  const { type, targetId, className } = props;
  const isLoggedIn = useSelector(state => !!state.user?.currentUser?.id);
  const history = useHistory();
  const routes = useRouteConfiguration();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(null);
  const [details, setDetails] = useState('');
  const [state, setState] = useState('idle'); // idle | sending | sent | error
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onKey = e => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    dialogRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!targetId) return null;
  const label =
    type === 'oferta' ? 'Zgłoś ofertę' : type === 'rozmowa' ? 'Zgłoś rozmowę' : 'Zgłoś użytkownika';

  const onOpen = () => {
    if (!isLoggedIn) {
      const from = typeof window !== 'undefined' ? window.location.pathname : '/';
      history.push(createResourceLocatorString('LoginPage', routes, {}, {}), { from });
      return;
    }
    setReason(null);
    setDetails('');
    setState('idle');
    setOpen(true);
  };

  const onSubmit = e => {
    e.preventDefault();
    if (!reason) return;
    setState('sending');
    createReport({ typ: type, celId: targetId, powod: reason, opis: details })
      .then(() => setState('sent'))
      .catch(() => setState('error'));
  };

  return (
    <>
      <button type="button" className={classNames(css.trigger, className)} onClick={onOpen}>
        <FlagIcon />
        {label}
      </button>
      {open ? (
        <div className={css.backdrop} onClick={() => setOpen(false)}>
          <div
            className={css.dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="report-title"
            tabIndex={-1}
            ref={dialogRef}
            onClick={e => e.stopPropagation()}
          >
            {state === 'sent' ? (
              <>
                <h2 id="report-title" className={css.title}>
                  Dziękujemy za zgłoszenie
                </h2>
                <p className={css.text}>
                  Moderator Refume je sprawdzi{type === 'rozmowa' ? ' (zobaczy tylko tę rozmowę)' : ''}.
                  Dostaniesz wiadomość w skrzynce, gdy podejmiemy decyzję. Zgłaszana osoba nie
                  dowie się, kto zgłosił.
                </p>
                <button type="button" className={css.primary} onClick={() => setOpen(false)}>
                  Zamknij
                </button>
              </>
            ) : (
              <form onSubmit={onSubmit}>
                <h2 id="report-title" className={css.title}>
                  {label}
                </h2>
                <p className={css.text}>Co jest nie tak? Wybierz jeden powód.</p>
                <fieldset className={css.reasons}>
                  <legend className={css.srOnly}>Powód zgłoszenia</legend>
                  {REASONS[type].map(([key, text]) => (
                    <label
                      key={key}
                      className={classNames(css.reason, { [css.reasonActive]: reason === key })}
                    >
                      <input
                        type="radio"
                        name="report-reason"
                        value={key}
                        checked={reason === key}
                        onChange={() => setReason(key)}
                        className={css.srOnly}
                      />
                      {text}
                    </label>
                  ))}
                </fieldset>
                <label htmlFor="report-details" className={css.detailsLabel}>
                  Szczegóły (opcjonalnie)
                </label>
                <textarea
                  id="report-details"
                  className={css.textarea}
                  rows={3}
                  maxLength={1000}
                  value={details}
                  onChange={e => setDetails(e.target.value)}
                  placeholder="Np. co Cię zaniepokoiło, link do innej oferty z tymi samymi zdjęciami…"
                />
                {state === 'error' ? (
                  <p className={css.error} role="alert">
                    Nie udało się wysłać zgłoszenia. Spróbuj ponownie.
                  </p>
                ) : null}
                <div className={css.buttons}>
                  <button
                    type="submit"
                    className={css.primary}
                    disabled={!reason || state === 'sending'}
                  >
                    {state === 'sending' ? 'Wysyłanie…' : 'Wyślij zgłoszenie'}
                  </button>
                  <button type="button" className={css.secondary} onClick={() => setOpen(false)}>
                    Anuluj
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
};

export default ReportButton;
