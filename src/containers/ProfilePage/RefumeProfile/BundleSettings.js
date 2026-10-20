import React, { useState } from 'react';
import { useDispatch } from 'react-redux';
import classNames from 'classnames';

import { fetchCurrentUser } from '../../../ducks/user.duck';
import {
  cleanBundleSettings,
  bundleDiscountPercent,
  describeBundleDiscounts,
  MAX_TIERS,
  MIN_ITEMS,
  MAX_ITEMS,
  MAX_PERCENT,
} from '../../../util/refumeBundleSettings';
import RefumeModal from './RefumeModal';

import css from './BundleSettings.module.css';

const saveSettings = value => (dispatch, getState, sdk) =>
  sdk.currentUser
    .updateProfile({ publicData: { refumeZestawy: value } })
    .then(() => dispatch(fetchCurrentUser({ enforce: true })));

const PRESETS = [
  { key: 'none', label: 'Bez rabatu', desc: 'Kupujący oszczędza tylko na wysyłce', rabaty: [] },
  {
    key: 'small',
    label: 'Mały rabat',
    desc: '2 rzeczy −5%, 3+ −10%',
    rabaty: [{ od: 2, procent: 5 }, { od: 3, procent: 10 }],
  },
  {
    key: 'big',
    label: 'Duży rabat',
    desc: '2 rzeczy −10%, 3 −15%, 5+ −20%',
    rabaty: [{ od: 2, procent: 10 }, { od: 3, procent: 15 }, { od: 5, procent: 20 }],
  },
  { key: 'custom', label: 'Własny', desc: 'Ustaw progi sam', rabaty: null },
];

const sameTiers = (a, b) =>
  a.length === b.length && a.every((t, i) => t.od === b[i].od && t.procent === b[i].procent);
const presetOf = rabaty => PRESETS.find(p => p.rabaty && sameTiers(p.rabaty, rabaty))?.key || 'custom';

const formatPln = subunits => `${(subunits / 100).toFixed(2).replace('.', ',')} zł`;
const itemsWord = n => (n === 1 ? 'rzecz' : 'rzeczy');

const Stepper = ({ value, min, max, onChange, suffix, label }) => (
  <span className={css.stepper} role="group" aria-label={label}>
    <button
      type="button"
      className={css.stepBtn}
      onClick={() => onChange(Math.max(min, value - 1))}
      disabled={value <= min}
      aria-label={`${label}: mniej`}
    >
      −
    </button>
    <span className={css.stepValue}>
      {value}
      {suffix}
    </span>
    <button
      type="button"
      className={css.stepBtn}
      onClick={() => onChange(Math.min(max, value + 1))}
      disabled={value >= max}
      aria-label={`${label}: więcej`}
    >
      +
    </button>
  </span>
);

const validate = tiers => {
  const ods = tiers.map(t => t.od);
  if (new Set(ods).size !== ods.length) return 'Każdy próg musi mieć inną liczbę rzeczy.';
  const sorted = [...tiers].sort((a, b) => a.od - b.od);
  if (!sorted.every((t, i) => i === 0 || t.procent > sorted[i - 1].procent)) {
    return 'Przy większej liczbie rzeczy rabat powinien być większy.';
  }
  return null;
};

const BundleSettingsModal = ({ settings, onClose, onSaved }) => {
  const dispatch = useDispatch();
  const [enabled, setEnabled] = useState(!settings.wylaczone);
  const [tiers, setTiers] = useState(settings.rabaty);
  const [preset, setPreset] = useState(presetOf(settings.rabaty));
  const [state, setState] = useState({ saving: false, error: null });

  const sorted = [...tiers].sort((a, b) => a.od - b.od);
  const error = validate(tiers);

  const choosePreset = p => {
    setPreset(p.key);
    if (p.rabaty) setTiers(p.rabaty.map(t => ({ ...t })));
    else if (!tiers.length) setTiers([{ od: 2, procent: 5 }]);
  };
  const updateTier = (i, key, value) => {
    setPreset('custom');
    setTiers(list => list.map((t, j) => (j === i ? { ...t, [key]: value } : t)));
  };
  const addTier = () => {
    setPreset('custom');
    setTiers(list => {
      const top = [...list].sort((a, b) => a.od - b.od).pop();
      return [
        ...list,
        top
          ? { od: Math.min(top.od + 1, MAX_ITEMS), procent: Math.min(top.procent + 5, MAX_PERCENT) }
          : { od: 2, procent: 5 },
      ];
    });
  };
  const removeTier = i => {
    setPreset('custom');
    setTiers(list => list.filter((_, j) => j !== i));
  };

  // Example: 3 items at 100 zł each
  const exampleCount = Math.max(3, sorted[sorted.length - 1]?.od || 3);
  const examplePercent = bundleDiscountPercent({ rabaty: sorted }, exampleCount);
  const exampleTotal = exampleCount * 10000;

  const save = () => {
    if (enabled && error) return;
    setState({ saving: true, error: null });
    const value = { wylaczone: !enabled, rabaty: enabled ? cleanBundleSettings({ rabaty: sorted }).rabaty : settings.rabaty };
    dispatch(saveSettings(value))
      .then(() => onSaved())
      .catch(() => setState({ saving: false, error: 'Nie udało się zapisać. Spróbuj ponownie.' }));
  };

  return (
    <RefumeModal
      id="bundle-settings"
      title="Zestawy i rabaty"
      subtitle="Kupujący wybiera kilka Twoich rzeczy, płaci za jedną paczkę, a Ty wysyłasz wszystko razem."
      onClose={onClose}
      footer={
        <>
          {state.error ? <span className={css.footerError}>{state.error}</span> : null}
          <button type="button" className={css.secondaryBtn} onClick={onClose} disabled={state.saving}>
            Anuluj
          </button>
          <button
            type="button"
            className={css.primaryBtn}
            onClick={save}
            disabled={state.saving || (enabled && !!error)}
          >
            {state.saving ? 'Zapisuję…' : 'Zapisz'}
          </button>
        </>
      }
    >
      <label className={css.switchCard}>
        <span className={css.switchText}>
          <strong>Sprzedawaj w zestawach</strong>
          <span>Pokaż kupującym przycisk „Kup zestaw” przy Twoich ofertach.</span>
        </span>
        <input
          type="checkbox"
          className={css.switchInput}
          checked={enabled}
          onChange={e => setEnabled(e.target.checked)}
        />
        <span className={css.switch} aria-hidden="true" />
      </label>

      {enabled ? (
        <>
          <h3 className={css.step}>
            <span className={css.stepNo}>1</span> Wybierz rabat
          </h3>
          <div className={css.presets} role="radiogroup" aria-label="Rodzaj rabatu">
            {PRESETS.map(p => (
              <button
                key={p.key}
                type="button"
                role="radio"
                aria-checked={preset === p.key}
                className={classNames(css.preset, { [css.presetActive]: preset === p.key })}
                onClick={() => choosePreset(p)}
              >
                <strong>{p.label}</strong>
                <span>{p.desc}</span>
              </button>
            ))}
          </div>

          {preset !== 'none' ? (
            <>
              <h3 className={css.step}>
                <span className={css.stepNo}>2</span> Progi rabatu
              </h3>
              <ul className={css.tiers}>
                {tiers.map((t, i) => (
                  <li key={i} className={css.tier}>
                    <span className={css.tierText}>Kupujący bierze co najmniej</span>
                    <Stepper
                      value={t.od}
                      min={MIN_ITEMS}
                      max={MAX_ITEMS}
                      onChange={v => updateTier(i, 'od', v)}
                      label="Liczba rzeczy"
                    />
                    <span className={css.tierText}>{itemsWord(t.od)} → rabat</span>
                    <Stepper
                      value={t.procent}
                      min={1}
                      max={MAX_PERCENT}
                      suffix="%"
                      onChange={v => updateTier(i, 'procent', v)}
                      label="Rabat"
                    />
                    <button
                      type="button"
                      className={css.remove}
                      onClick={() => removeTier(i)}
                      aria-label="Usuń próg"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
              {tiers.length < MAX_TIERS ? (
                <button type="button" className={css.addTier} onClick={addTier}>
                  + Dodaj próg
                </button>
              ) : null}
              {error ? <p className={css.error}>{error}</p> : null}
            </>
          ) : null}

          <div className={css.preview}>
            <span className={css.previewLabel}>Tak to zobaczy kupujący</span>
            {sorted.length && !error ? (
              <>
                <p className={css.previewTiers}>🎁 Rabat za zestaw: {describeBundleDiscounts({ rabaty: sorted })}</p>
                <p className={css.previewExample}>
                  Przykład: {exampleCount} {itemsWord(exampleCount)} po 100 zł →{' '}
                  {examplePercent ? (
                    <>
                      <s>{formatPln(exampleTotal)}</s>{' '}
                      <strong>{formatPln(Math.round(exampleTotal * (1 - examplePercent / 100)))}</strong> (−
                      {examplePercent}%)
                    </>
                  ) : (
                    <strong>{formatPln(exampleTotal)}</strong>
                  )}{' '}
                  + jedna wysyłka
                </p>
              </>
            ) : (
              <p className={css.previewExample}>Zestaw bez rabatu – kupujący płaci za jedną wysyłkę zamiast kilku.</p>
            )}
            <p className={css.previewNote}>Rabat liczy się od cen rzeczy (bez wysyłki) i obniża Twoją wypłatę.</p>
          </div>
        </>
      ) : (
        <p className={css.offNote}>
          Zestawy są wyłączone – każdą Twoją rzecz trzeba kupić osobno, z osobną wysyłką.
        </p>
      )}
    </RefumeModal>
  );
};

/**
 * Refume: "Zestawy i rabaty" card on your own profile; editing opens a window.
 */
const BundleSettings = ({ currentUser }) => {
  const settings = cleanBundleSettings(currentUser.attributes.profile.publicData?.refumeZestawy);
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);

  const summary = settings.wylaczone
    ? 'Wyłączone – kupujący nie mogą kupić kilku Twoich rzeczy w jednym zamówieniu.'
    : settings.rabaty.length
    ? `Rabat za zestaw: ${describeBundleDiscounts(settings)}`
    : 'Włączone, bez rabatu – kupujący oszczędza na wysyłce.';

  return (
    <section className={css.card} aria-labelledby="bundle-card-title">
      <span className={css.cardIcon} aria-hidden="true">
        🎁
      </span>
      <div className={css.cardText}>
        <h2 id="bundle-card-title" className={css.cardTitle}>
          Zestawy i rabaty
        </h2>
        <p className={css.cardSummary}>{summary}</p>
        {saved ? <p className={css.saved}>Zapisano ✓</p> : null}
      </div>
      <button
        type="button"
        className={css.secondaryBtn}
        onClick={() => {
          setSaved(false);
          setOpen(true);
        }}
      >
        Ustaw
      </button>
      {open ? (
        <BundleSettingsModal
          settings={settings}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            setSaved(true);
          }}
        />
      ) : null}
    </section>
  );
};

export default BundleSettings;
