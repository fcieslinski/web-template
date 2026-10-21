import React, { useState } from 'react';
import { useDispatch } from 'react-redux';

import { fetchCurrentUser } from '../../ducks/user.duck';

import css from './RefumeShipment.module.css';

export const SENDER_KEY = 'refumeNadawca';

const digits = s => String(s || '').replace(/\D/g, '');
const phone9 = s => {
  const d = digits(s);
  return d.length > 9 && d.startsWith('48') ? d.slice(-9) : d;
};

/** True when the seller's sender details are complete enough for a label. */
export const hasSenderDetails = data =>
  !!(
    data &&
    String(data.imie || '').trim() &&
    phone9(data.telefon).length === 9 &&
    String(data.ulica || '').trim() &&
    digits(data.kod).length === 5 &&
    String(data.miasto || '').trim()
  );

const saveSender = value => (dispatch, getState, sdk) =>
  sdk.currentUser
    .updateProfile({ privateData: { [SENDER_KEY]: value } })
    .then(() => dispatch(fetchCurrentUser({ enforce: true })));

/**
 * Refume: the seller's sender details for shipping labels (privateData.refumeNadawca, seen only
 * by the seller and the Refume server). Printed on the label as the sender; returns go there.
 */
const SenderDetailsForm = ({ currentUser, onSaved, submitLabel = 'Zapisz dane nadawcy', compact }) => {
  const dispatch = useDispatch();
  const profile = currentUser?.attributes?.profile || {};
  const saved = profile.privateData?.[SENDER_KEY] || {};
  const [values, setValues] = useState({
    imie: saved.imie || `${profile.firstName || ''} ${profile.lastName || ''}`.trim(),
    telefon: saved.telefon || '',
    ulica: saved.ulica || '',
    kod: saved.kod || '',
    miasto: saved.miasto || '',
  });
  const [state, setState] = useState({ saving: false, error: null });
  const set = key => e => setValues(v => ({ ...v, [key]: e.target.value }));

  const submit = e => {
    e.preventDefault();
    const value = {
      imie: values.imie.trim().slice(0, 80),
      telefon: phone9(values.telefon),
      ulica: values.ulica.trim().slice(0, 100),
      kod: (d => (d.length === 5 ? `${d.slice(0, 2)}-${d.slice(2)}` : d))(digits(values.kod)),
      miasto: values.miasto.trim().slice(0, 60),
    };
    if (!hasSenderDetails(value)) {
      setState({ saving: false, error: 'Uzupełnij wszystkie pola: telefon ma 9 cyfr, kod pocztowy 5 cyfr.' });
      return;
    }
    setState({ saving: true, error: null });
    dispatch(saveSender(value))
      .then(() => {
        setState({ saving: false, error: null });
        if (onSaved) onSaved(value);
      })
      .catch(() => setState({ saving: false, error: 'Nie udało się zapisać. Spróbuj ponownie.' }));
  };

  return (
    <form className={compact ? css.formCompact : css.form} onSubmit={submit}>
      <label className={css.field}>
        <span className={css.label}>Imię i nazwisko (lub nazwa)</span>
        <input className={css.input} value={values.imie} onChange={set('imie')} autoComplete="name" maxLength={80} />
      </label>
      <label className={css.field}>
        <span className={css.label}>Telefon</span>
        <input className={css.input} value={values.telefon} onChange={set('telefon')} inputMode="tel" autoComplete="tel" placeholder="np. 500 600 700" />
      </label>
      <label className={css.field}>
        <span className={css.label}>Ulica i numer</span>
        <input className={css.input} value={values.ulica} onChange={set('ulica')} autoComplete="street-address" maxLength={100} />
      </label>
      <div className={css.row}>
        <label className={css.fieldShort}>
          <span className={css.label}>Kod pocztowy</span>
          <input className={css.input} value={values.kod} onChange={set('kod')} inputMode="numeric" autoComplete="postal-code" placeholder="00-000" />
        </label>
        <label className={css.field}>
          <span className={css.label}>Miejscowość</span>
          <input className={css.input} value={values.miasto} onChange={set('miasto')} autoComplete="address-level2" maxLength={60} />
        </label>
      </div>
      <p className={css.note}>Te dane trafią tylko na etykietę jako nadawca (tam wracają ewentualne zwroty). Kupujący ich nie widzi w serwisie.</p>
      {state.error ? (
        <p className={css.error} role="alert">
          {state.error}
        </p>
      ) : null}
      <button type="submit" className={css.primary} disabled={state.saving}>
        {state.saving ? 'Zapisywanie…' : submitLabel}
      </button>
    </form>
  );
};

export default SenderDetailsForm;
