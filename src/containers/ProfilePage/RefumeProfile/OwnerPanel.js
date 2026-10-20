import React, { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import classNames from 'classnames';

import { NamedLink } from '../../../components';
import { fetchCurrentUser } from '../../../ducks/user.duck';
import { showUser } from '../ProfilePage.duck';
import { detectChatRisks } from '../../../util/refumeChatSafety';
import { SHIPPING_SPEED_OPTIONS, BIO_MAX, CITY_MAX, cleanCity } from './refumeProfileFields';

import css from './RefumeProfile.module.css';

const saveProfile = values => (dispatch, getState, sdk) =>
  sdk.currentUser.updateProfile({
    bio: values.bio,
    publicData: {
      refumeMiasto: values.miasto || null,
      refumeWysylka: values.wysylka || null,
    },
  });

/**
 * Refume: on your own profile — shortcuts, a "complete your profile" checklist and
 * editing of what others see (about me, city, shipping speed).
 */
const OwnerPanel = props => {
  const { user, listingsCount, config } = props;
  const dispatch = useDispatch();
  const profile = user?.attributes?.profile || {};
  const publicData = profile.publicData || {};
  const hasAvatar = !!user?.profileImage?.id;

  const initial = {
    bio: profile.bio || '',
    miasto: cleanCity(publicData.refumeMiasto),
    wysylka: publicData.refumeWysylka || '',
  };
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState(initial);
  const [state, setState] = useState({ saving: false, error: null, saved: false });

  useEffect(() => {
    if (!editing) setValues(initial);
  }, [profile.bio, publicData.refumeMiasto, publicData.refumeWysylka, editing]);

  const checklist = [
    { key: 'avatar', label: 'Dodaj zdjęcie profilowe', done: hasAvatar, link: 'ProfileSettingsPage' },
    { key: 'bio', label: 'Napisz kilka słów o sobie', done: !!(profile.bio || '').trim(), edit: true },
    { key: 'miasto', label: 'Podaj miasto', done: !!initial.miasto, edit: true },
    { key: 'wysylka', label: 'Napisz, jak szybko wysyłasz', done: !!initial.wysylka, edit: true },
    { key: 'oferta', label: 'Wystaw pierwsze perfumy', done: listingsCount > 0, link: 'NewListingPage' },
  ];
  const doneCount = checklist.filter(c => c.done).length;
  const percent = Math.round((doneCount / checklist.length) * 100);

  const set = key => e => setValues(v => ({ ...v, [key]: e.target.value }));

  const submit = e => {
    e.preventDefault();
    const risks = detectChatRisks(`${values.bio} ${values.miasto}`);
    if (risks.contact || risks.payment || risks.links.length) {
      setState({
        saving: false,
        error: 'Usuń z opisu telefon, e-mail, numer konta lub linki – kontakt i płatności tylko przez Refume.',
        saved: false,
      });
      return;
    }
    setState({ saving: true, error: null, saved: false });
    const payload = {
      bio: values.bio.trim().slice(0, BIO_MAX),
      miasto: cleanCity(values.miasto),
      wysylka: SHIPPING_SPEED_OPTIONS.some(o => o.key === values.wysylka) ? values.wysylka : '',
    };
    dispatch(saveProfile(payload))
      .then(() => Promise.all([dispatch(showUser(user.id, config)), dispatch(fetchCurrentUser({ enforce: true }))]))
      .then(() => {
        setState({ saving: false, error: null, saved: true });
        setEditing(false);
      })
      .catch(() => setState({ saving: false, error: 'Nie udało się zapisać. Spróbuj ponownie.', saved: false }));
  };

  return (
    <section className={css.owner} aria-label="Twój profil">
      <div className={css.ownerHead}>
        <div>
          <p className={css.ownerTitle}>To Twój profil</p>
          <p className={css.ownerSub}>Tak widzą Cię kupujący. Uzupełnij go, żeby budzić zaufanie.</p>
        </div>
        {!editing ? (
          <button type="button" className={css.primaryBtn} onClick={() => { setEditing(true); setState(s => ({ ...s, saved: false })); }}>
            Ustaw profil
          </button>
        ) : null}
      </div>

      <div className={css.shortcuts}>
        <NamedLink name="NewListingPage" className={css.shortcut}>+ Dodaj ofertę</NamedLink>
        <NamedLink name="ManageListingsPage" className={css.shortcut}>Zarządzaj ofertami</NamedLink>
        <NamedLink name="OrdersPage" params={{ tab: 'sprzedane' }} className={css.shortcut}>Sprzedane</NamedLink>
        <NamedLink name="OrdersPage" params={{ tab: 'kupione' }} className={css.shortcut}>Zamówienia</NamedLink>
        <NamedLink name="ProfileSettingsPage" className={css.shortcut}>Zdjęcie i imię</NamedLink>
        <NamedLink name="AccountSettingsPage" className={css.shortcut}>Ustawienia konta</NamedLink>
      </div>

      {percent < 100 ? (
        <div className={css.progress}>
          <div className={css.progressHead}>
            <span>Profil uzupełniony w {percent}%</span>
            <span>{doneCount}/{checklist.length}</span>
          </div>
          <div className={css.bar} aria-hidden="true">
            <span style={{ width: `${percent}%` }} />
          </div>
          <ul className={css.checklist}>
            {checklist.map(c => (
              <li key={c.key} className={classNames({ [css.checkDone]: c.done })}>
                <span className={css.checkMark} aria-hidden="true">{c.done ? '✓' : ''}</span>
                {c.done ? (
                  <span>{c.label}</span>
                ) : c.link ? (
                  <NamedLink name={c.link}>{c.label}</NamedLink>
                ) : (
                  <button type="button" className={css.linkBtn} onClick={() => setEditing(true)}>
                    {c.label}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {editing ? (
        <form className={css.form} onSubmit={submit}>
          <label className={css.field}>
            <span className={css.label}>O mnie</span>
            <textarea
              className={css.textarea}
              rows={5}
              maxLength={BIO_MAX}
              value={values.bio}
              onChange={set('bio')}
              placeholder="Np. kolekcjonuję niszowe zapachy, sprzedaję flakony, które mi się znudziły. Wszystko z oryginalnych perfumerii, mam paragony."
            />
            <span className={css.counter}>{values.bio.length}/{BIO_MAX}</span>
          </label>
          <div className={css.row2}>
            <label className={css.field}>
              <span className={css.label}>Miasto</span>
              <input className={css.input} value={values.miasto} maxLength={CITY_MAX} onChange={set('miasto')} placeholder="np. Kraków" />
            </label>
            <label className={css.field}>
              <span className={css.label}>Jak szybko wysyłasz?</span>
              <select className={css.input} value={values.wysylka} onChange={set('wysylka')}>
                <option value="">— nie pokazuj —</option>
                {SHIPPING_SPEED_OPTIONS.map(o => (
                  <option key={o.key} value={o.key}>{o.label}</option>
                ))}
              </select>
            </label>
          </div>
          <p className={css.hint}>
            Nie podawaj tu telefonu, e-maila ani linków do innych serwisów – kontakt i płatności tylko przez Refume.
          </p>
          {state.error ? <p className={css.error} role="alert">{state.error}</p> : null}
          <div className={css.actions}>
            <button type="submit" className={css.primaryBtn} disabled={state.saving}>
              {state.saving ? 'Zapisuję…' : 'Zapisz'}
            </button>
            <button type="button" className={css.secondaryBtn} disabled={state.saving} onClick={() => { setEditing(false); setValues(initial); }}>
              Anuluj
            </button>
          </div>
        </form>
      ) : state.saved ? (
        <p className={css.saved}>Zapisano ✓</p>
      ) : null}
    </section>
  );
};

export default OwnerPanel;
