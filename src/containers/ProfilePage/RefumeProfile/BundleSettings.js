import React, { useState } from 'react';
import { useDispatch } from 'react-redux';

import { fetchCurrentUser } from '../../../ducks/user.duck';
import {
  cleanBundleSettings,
  describeBundleDiscounts,
  MAX_TIERS,
  MIN_ITEMS,
  MAX_ITEMS,
  MAX_PERCENT,
} from '../../../util/refumeBundleSettings';

import css from './OwnProfile.module.css';

const saveSettings = value => (dispatch, getState, sdk) =>
  sdk.currentUser
    .updateProfile({ publicData: { refumeZestawy: value } })
    .then(() => dispatch(fetchCurrentUser({ enforce: true })));

const SUGGESTED = [
  { od: 2, procent: 5 },
  { od: 3, procent: 10 },
  { od: 5, procent: 15 },
];

/**
 * Refume: seller's bundle ("zestaw") settings on your own profile — allow buying several
 * items in one order, and discounts by the number of items.
 */
const BundleSettings = ({ currentUser }) => {
  const dispatch = useDispatch();
  const settings = cleanBundleSettings(currentUser.attributes.profile.publicData?.refumeZestawy);
  const [editing, setEditing] = useState(false);
  const [enabled, setEnabled] = useState(!settings.wylaczone);
  const [tiers, setTiers] = useState(settings.rabaty);
  const [state, setState] = useState({ saving: false, error: null, saved: false });

  const start = () => {
    setEnabled(!settings.wylaczone);
    setTiers(settings.rabaty.length ? settings.rabaty : []);
    setState({ saving: false, error: null, saved: false });
    setEditing(true);
  };

  const setTier = (i, key) => e =>
    setTiers(list => list.map((t, j) => (j === i ? { ...t, [key]: e.target.value } : t)));
  const addTier = () =>
    setTiers(list => {
      const last = list[list.length - 1];
      const od = last ? Math.min(Number(last.od) + 1, MAX_ITEMS) : 2;
      const procent = last ? Math.min(Number(last.procent) + 5, MAX_PERCENT) : 5;
      return [...list, { od, procent }];
    });
  const removeTier = i => setTiers(list => list.filter((_, j) => j !== i));

  const submit = e => {
    e.preventDefault();
    const raw = tiers.map(t => ({ od: Number(t.od), procent: Number(t.procent) }));
    const cleaned = cleanBundleSettings({ rabaty: raw }).rabaty;
    if (cleaned.length !== raw.length) {
      setState({
        saving: false,
        error: `Sprawdź progi: od ${MIN_ITEMS} do ${MAX_ITEMS} rzeczy, rabat od 1 do ${MAX_PERCENT}%, bez powtórzeń.`,
        saved: false,
      });
      return;
    }
    const increasing = cleaned.every((t, i) => i === 0 || t.procent > cleaned[i - 1].procent);
    if (!increasing) {
      setState({ saving: false, error: 'Przy większej liczbie rzeczy rabat powinien być większy.', saved: false });
      return;
    }
    setState({ saving: true, error: null, saved: false });
    dispatch(saveSettings({ wylaczone: !enabled, rabaty: cleaned }))
      .then(() => {
        setEditing(false);
        setState({ saving: false, error: null, saved: true });
      })
      .catch(() => setState({ saving: false, error: 'Nie udało się zapisać. Spróbuj ponownie.', saved: false }));
  };

  const summary = settings.wylaczone
    ? 'Wyłączone – kupujący nie mogą kupić kilku Twoich rzeczy w jednym zamówieniu.'
    : settings.rabaty.length
    ? `Rabat za zestaw: ${describeBundleDiscounts(settings)}.`
    : 'Kupujący mogą kupić kilka Twoich rzeczy z jedną wysyłką. Nie dajesz rabatu.';

  return (
    <section className={css.settingsCard} aria-labelledby="bundle-settings-title">
      <div className={css.settingsHead}>
        <div>
          <h2 id="bundle-settings-title" className={css.settingsTitle}>
            🎁 Zestawy i rabaty
          </h2>
          {!editing ? <p className={css.settingsSummary}>{summary}</p> : null}
        </div>
        {!editing ? (
          <button type="button" className={css.secondaryBtn} onClick={start}>
            Ustaw
          </button>
        ) : null}
      </div>
      {state.saved && !editing ? <p className={css.saved}>Zapisano ✓</p> : null}

      {editing ? (
        <form className={css.form} onSubmit={submit}>
          <label className={css.switchRow}>
            <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
            <span>
              <strong>Pozwalaj kupować zestawy</strong>
              <span className={css.help}>
                Kupujący wybiera kilka Twoich rzeczy i płaci za jedną paczkę. Wysyłasz wszystko razem.
              </span>
            </span>
          </label>

          {enabled ? (
            <div className={css.tiers}>
              <span className={css.label}>Rabat zależny od liczby rzeczy (opcjonalnie)</span>
              {tiers.length ? (
                <ul className={css.tierList}>
                  {tiers.map((t, i) => (
                    <li key={i} className={css.tierRow}>
                      <span>Od</span>
                      <select className={css.tierInput} value={t.od} onChange={setTier(i, 'od')} aria-label="Liczba rzeczy">
                        {Array.from({ length: MAX_ITEMS - MIN_ITEMS + 1 }, (_, k) => k + MIN_ITEMS).map(n => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                      <span>rzeczy:</span>
                      <span className={css.percentWrap}>
                        −
                        <input
                          className={css.tierInput}
                          type="number"
                          min={1}
                          max={MAX_PERCENT}
                          value={t.procent}
                          onChange={setTier(i, 'procent')}
                          aria-label="Rabat w procentach"
                        />
                        %
                      </span>
                      <button type="button" className={css.dangerLink} onClick={() => removeTier(i)}>
                        Usuń
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={css.help}>Bez rabatu – kupujący oszczędza tylko na wysyłce.</p>
              )}
              <div className={css.actions}>
                {tiers.length < MAX_TIERS ? (
                  <button type="button" className={css.cardLink} onClick={addTier}>
                    + Dodaj próg
                  </button>
                ) : null}
                {!tiers.length ? (
                  <button type="button" className={css.cardLink} onClick={() => setTiers(SUGGESTED)}>
                    Użyj podpowiedzi (2 → −5%, 3 → −10%, 5 → −15%)
                  </button>
                ) : null}
              </div>
              <p className={css.help}>
                Rabat liczy się od ceny wszystkich rzeczy w zamówieniu (bez wysyłki) i obniża Twoją
                wypłatę o tę kwotę.
              </p>
            </div>
          ) : null}

          {state.error ? (
            <p className={css.error} role="alert">
              {state.error}
            </p>
          ) : null}
          <div className={css.actions}>
            <button type="submit" className={css.primaryBtn} disabled={state.saving}>
              {state.saving ? 'Zapisuję…' : 'Zapisz'}
            </button>
            <button type="button" className={css.secondaryBtn} disabled={state.saving} onClick={() => setEditing(false)}>
              Anuluj
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
};

export default BundleSettings;
