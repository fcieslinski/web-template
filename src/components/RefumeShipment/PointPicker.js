import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSelector } from 'react-redux';

import { searchPickupPoints } from '../../util/api';

import css from './PointPicker.module.css';

const distanceText = d =>
  d == null || Number.isNaN(d) ? '' : d < 1 ? `${Math.round(d * 1000)} m` : `${d.toFixed(1).replace('.', ',')} km`;

/**
 * Refume: choosing a pickup point. Points come from Furgonetka (same environment as the
 * labels, so the carrier accepts them), searched by address or by the user's location.
 *
 * @param {string} props.service Furgonetka service ('inpost' | 'orlen' | 'dpd')
 * @param {string} props.carrierLabel e.g. "InPost Paczkomat"
 * @param {{ code, name }|null} props.value
 * @param {Function} props.onChange ({ code, name }) => void
 */
const PointPicker = ({ service, carrierLabel, value, onChange, city, disabled }) => {
  const profileCity = useSelector(
    state => state.user?.currentUser?.attributes?.profile?.publicData?.refumeMiasto
  );
  const startPhrase = city || (typeof profileCity === 'string' ? profileCity.trim() : '');
  const [open, setOpen] = useState(false);
  const [phrase, setPhrase] = useState(startPhrase);
  const [state, setState] = useState({ loading: false, error: null, points: null });
  const timer = useRef(null);
  const inputRef = useRef(null);

  const run = params => {
    if (!service) {
      setState({ loading: false, points: null, error: 'Nie wiemy, którego przewoźnika dotyczy punkt. Odśwież stronę.' });
      return;
    }
    setState(s => ({ ...s, loading: true, error: null }));
    searchPickupPoints({ service, ...params })
      .then(res => setState({ loading: false, error: null, points: res?.data || [] }))
      .catch(e =>
        setState({
          loading: false,
          points: null,
          error: e?.status === 401 ? 'Zaloguj się, żeby wyszukać punkty.' : 'Nie udało się pobrać punktów. Spróbuj ponownie.',
        })
      );
  };

  // Search as the user types
  useEffect(() => {
    if (!open) return undefined;
    clearTimeout(timer.current);
    const q = phrase.trim();
    if (q.length < 3) {
      setState(s => ({ ...s, points: s.points && q.length ? s.points : null }));
      return undefined;
    }
    timer.current = setTimeout(() => run({ q }), 450);
    return () => clearTimeout(timer.current);
  }, [phrase, open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = e => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const nearMe = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setState(s => ({ ...s, error: 'Twoja przeglądarka nie udostępnia lokalizacji.' }));
      return;
    }
    setState(s => ({ ...s, loading: true, error: null }));
    navigator.geolocation.getCurrentPosition(
      pos => {
        setPhrase('');
        run({ lat: pos.coords.latitude.toFixed(5), lng: pos.coords.longitude.toFixed(5) });
      },
      () => setState(s => ({ ...s, loading: false, error: 'Nie udało się ustalić lokalizacji. Wpisz adres.' })),
      { timeout: 10000, maximumAge: 300000 }
    );
  };

  const choose = p => {
    onChange({ code: p.code, name: [p.name, p.address].filter(Boolean).join(', ') });
    setOpen(false);
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
          <button type="button" className={css.change} onClick={() => setOpen(true)} disabled={disabled}>
            Zmień
          </button>
        </div>
      ) : (
        <button type="button" className={css.openBtn} onClick={() => setOpen(true)} disabled={disabled}>
          Wybierz punkt odbioru – {carrierLabel}
        </button>
      )}

      {/* Rendered at the end of <body>: inside the chat's side column a fixed dialog would be
          clipped by the column's own scrolling and position */}
      {open && typeof document !== 'undefined' ? createPortal(
        <div className={css.overlay} role="dialog" aria-modal="true" aria-label="Wybierz punkt odbioru">
          <div className={css.backdrop} onClick={() => setOpen(false)} />
          <div className={css.panel}>
            <div className={css.panelHead}>
              <div>
                <h3 className={css.panelTitle}>Wybierz punkt odbioru</h3>
                <p className={css.panelSub}>{carrierLabel}</p>
              </div>
              <button type="button" className={css.close} onClick={() => setOpen(false)} aria-label="Zamknij">
                ×
              </button>
            </div>

            <div className={css.searchRow}>
              <input
                ref={inputRef}
                className={css.search}
                value={phrase}
                onChange={e => setPhrase(e.target.value)}
                placeholder="Miasto i ulica, np. Warszawa, Bruzdowa 21"
                autoComplete="off"
              />
              <button type="button" className={css.nearMe} onClick={nearMe}>
                📍 Blisko mnie
              </button>
            </div>

            <div className={css.results}>
              {state.loading ? <p className={css.muted}>Szukam punktów…</p> : null}
              {state.error ? <p className={css.error}>{state.error}</p> : null}
              {!state.loading && !state.error && state.points === null ? (
                <p className={css.muted}>Wpisz miasto i ulicę albo kliknij „Blisko mnie”.</p>
              ) : null}
              {!state.loading && state.points && !state.points.length ? (
                <p className={css.muted}>Nie znaleziono punktów w pobliżu. Spróbuj wpisać inny adres.</p>
              ) : null}
              {state.points?.length ? (
                <ul className={css.list}>
                  {state.points.map(p => (
                    <li key={p.code}>
                      <button
                        type="button"
                        className={value?.code === p.code ? css.pointSelected : css.point}
                        onClick={() => choose(p)}
                      >
                        <span className={css.pointMain}>
                          <strong>{p.name || p.code}</strong>
                          <span className={css.pointAddr}>{p.address}</span>
                          {p.kind || p.description ? (
                            <span className={css.pointMeta}>
                              {[p.kind, p.description].filter(Boolean).join(' · ')}
                            </span>
                          ) : null}
                        </span>
                        <span className={css.pointSide}>
                          {distanceText(p.distance)}
                          <span className={css.pointCode}>{p.code}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        </div>
      , document.body) : null}
    </div>
  );
};

export default PointPicker;
