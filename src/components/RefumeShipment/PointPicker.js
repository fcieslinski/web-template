import React, { useState } from 'react';
import { useSelector } from 'react-redux';

import { openPointMap } from '../../util/furgonetkaMap';

import css from './PointPicker.module.css';

/**
 * Refume: choosing a pickup point on Furgonetka's map. Typing the code is a fallback when
 * the map can't load.
 *
 * @param {string} props.service Furgonetka map service ('inpost' | 'orlen' | 'dpd')
 * @param {string} props.carrierLabel e.g. "InPost Paczkomat"
 * @param {{ code, name }|null} props.value
 * @param {Function} props.onChange ({ code, name }) => void
 */
const PointPicker = ({ service, carrierLabel, value, onChange, city, placeholder, disabled }) => {
  const [failed, setFailed] = useState(false);
  const [manual, setManual] = useState(false);
  const [opening, setOpening] = useState(false);
  // Open the map on the buyer's city (from their profile), so points show right away
  const profileCity = useSelector(
    state => state.user?.currentUser?.attributes?.profile?.publicData?.refumeMiasto
  );
  const startCity = city || (typeof profileCity === 'string' ? profileCity.trim() : '') || undefined;

  const open = () => {
    setOpening(true);
    openPointMap({
      service,
      city: startCity,
      onSelect: point => {
        setOpening(false);
        onChange(point);
      },
      onClose: () => setOpening(false),
    })
      .then(() => setOpening(false))
      .catch(() => {
        setOpening(false);
        setFailed(true);
        setManual(true);
      });
  };

  return (
    <div className={css.root}>
      {value?.code ? (
        <div className={css.chosen}>
          <span className={css.pin} aria-hidden="true">
            📍
          </span>
          <span className={css.chosenText}>
            <strong>{value.name || carrierLabel}</strong>
            <span className={css.code}>Kod punktu: {value.code}</span>
          </span>
          <button type="button" className={css.change} onClick={open} disabled={disabled || opening}>
            Zmień
          </button>
        </div>
      ) : (
        <button type="button" className={css.openBtn} onClick={open} disabled={disabled || opening}>
          {opening ? 'Otwieranie mapy…' : `Wybierz punkt na mapie – ${carrierLabel}`}
        </button>
      )}

      {!value?.code ? (
        <p className={css.tip}>
          Na mapie wpisz miasto i ulicę (np. „Warszawa, Bruzdowa”) albo przybliż mapę – punkty pokazują się po
          przybliżeniu.
        </p>
      ) : null}

      {failed ? <p className={css.error}>Nie udało się wczytać mapy. Wpisz kod punktu ręcznie.</p> : null}

      {manual ? (
        <input
          className={css.input}
          value={value?.code || ''}
          placeholder={placeholder || 'Kod punktu'}
          autoComplete="off"
          disabled={disabled}
          onChange={e => onChange({ code: e.target.value.trim().toUpperCase(), name: '' })}
        />
      ) : (
        <button type="button" className={css.manualLink} onClick={() => setManual(true)}>
          Znam kod punktu – wpiszę ręcznie
        </button>
      )}
    </div>
  );
};

export default PointPicker;
