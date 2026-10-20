import React, { useEffect, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import classNames from 'classnames';

import { denormalisedResponseEntities } from '../../../util/data';
import { createSlug } from '../../../util/urlHelpers';
import { REVIEW_TYPE_OF_PROVIDER, REVIEW_TYPE_OF_CUSTOMER } from '../../../util/types';
import { fetchCurrentUser } from '../../../ducks/user.duck';
import { detectChatRisks } from '../../../util/refumeChatSafety';
import { NamedLink, AvatarLarge, Reviews } from '../../../components';
import SellerBadges from '../../../components/SellerBadges/SellerBadges';
import ProfileFacts from './ProfileFacts';
import BundleSettings from './BundleSettings';
import RefumeModal from './RefumeModal';
import {
  SHIPPING_SPEED_OPTIONS,
  BIO_MAX,
  CITY_MAX,
  cleanCity,
  shippingSpeedLabel,
} from './refumeProfileFields';

import css from './OwnProfile.module.css';

const MAX_AVATAR_BYTES = 10 * 1024 * 1024;
const NAME_MAX = 40;

const formatPrice = price =>
  price?.amount != null
    ? `${(price.amount / 100).toFixed(2).replace('.', ',')} ${price.currency === 'PLN' ? 'zł' : price.currency}`
    : '';

const IMAGE_VARIANTS = ['listing-card', 'listing-card-2x', 'scaled-small'];
const imageOf = listing => {
  const variants = listing?.images?.[0]?.attributes?.variants || {};
  const name = IMAGE_VARIANTS.find(v => variants[v]?.url);
  return name ? variants[name].url : null;
};

// ---------- Data ----------

const queryOwnListings = () => (dispatch, getState, sdk) =>
  sdk.ownListings
    .query({
      perPage: 100,
      include: ['images', 'currentStock'],
      'fields.image': ['variants.listing-card', 'variants.listing-card-2x', 'variants.scaled-small'],
      'limit.images': 1,
    })
    .then(response => denormalisedResponseEntities(response));

const listingAction = (action, id) => (dispatch, getState, sdk) =>
  action === 'close'
    ? sdk.ownListings.close({ id })
    : action === 'open'
    ? sdk.ownListings.open({ id })
    : sdk.ownListings.discardDraft({ id });

const updateOwnProfile = params => (dispatch, getState, sdk) =>
  sdk.currentUser.updateProfile(params).then(() => dispatch(fetchCurrentUser({ enforce: true })));

const uploadAvatar = file => (dispatch, getState, sdk) =>
  sdk.images
    .upload({ image: file }, { expand: true })
    .then(resp => {
      const imageId = resp.data.data.id;
      return sdk.currentUser.updateProfile({ profileImageId: imageId });
    })
    .then(() => dispatch(fetchCurrentUser({ enforce: true })));

/** Splits own listings into what the profile shows, in this order. */
const groupListings = listings => {
  const groups = { active: [], pending: [], closed: [], drafts: [], sold: [] };
  listings.forEach(l => {
    const { state, metadata } = l.attributes;
    const stock = l.currentStock?.attributes?.quantity;
    if (state === 'draft') groups.drafts.push(l);
    else if (stock === 0) groups.sold.push(l);
    else if (state === 'pendingApproval') groups.pending.push(l);
    else if (state === 'closed' || metadata?.moderacja?.ukryta) groups.closed.push(l);
    else groups.active.push(l);
  });
  return groups;
};

// ---------- Header ----------

const AvatarUploader = ({ user }) => {
  const dispatch = useDispatch();
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const onFile = e => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) {
      setError('Wybierz zdjęcie JPG, PNG lub WEBP.');
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setError('Zdjęcie może mieć najwyżej 10 MB.');
      return;
    }
    setBusy(true);
    setError(null);
    dispatch(uploadAvatar(file))
      .then(() => setBusy(false))
      .catch(() => {
        setBusy(false);
        setError('Nie udało się wgrać zdjęcia.');
      });
  };

  return (
    <div className={css.avatarWrap}>
      <AvatarLarge user={user} className={css.avatar} disableProfileLink />
      <button
        type="button"
        className={css.avatarButton}
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        aria-label="Zmień zdjęcie profilowe"
      >
        {busy ? '…' : '📷'}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className={css.hiddenInput}
        onChange={onFile}
      />
      {error ? <p className={css.avatarError}>{error}</p> : null}
    </div>
  );
};

const ProfileEditForm = ({ user, onDone }) => {
  const dispatch = useDispatch();
  const profile = user.attributes.profile;
  const publicData = profile.publicData || {};
  const [values, setValues] = useState({
    firstName: profile.firstName || '',
    lastName: profile.lastName || '',
    bio: profile.bio || '',
    miasto: cleanCity(publicData.refumeMiasto),
    wysylka: publicData.refumeWysylka || '',
  });
  const [state, setState] = useState({ saving: false, error: null });
  const set = key => e => setValues(v => ({ ...v, [key]: e.target.value }));

  const submit = e => {
    e.preventDefault();
    const firstName = values.firstName.trim().slice(0, NAME_MAX);
    const lastName = values.lastName.trim().slice(0, NAME_MAX);
    if (!firstName || !lastName) {
      setState({ saving: false, error: 'Imię i nazwisko są wymagane.' });
      return;
    }
    const risks = detectChatRisks(`${values.bio} ${values.miasto}`);
    if (risks.any) {
      setState({
        saving: false,
        error: 'Usuń z opisu telefon, e-mail, numer konta lub linki – kontakt i płatności tylko przez Refume.',
      });
      return;
    }
    setState({ saving: true, error: null });
    const wysylka = SHIPPING_SPEED_OPTIONS.some(o => o.key === values.wysylka) ? values.wysylka : null;
    dispatch(
      updateOwnProfile({
        firstName,
        lastName,
        bio: values.bio.trim().slice(0, BIO_MAX),
        publicData: { refumeMiasto: cleanCity(values.miasto) || null, refumeWysylka: wysylka },
      })
    )
      .then(() => onDone(true))
      .catch(() => setState({ saving: false, error: 'Nie udało się zapisać. Spróbuj ponownie.' }));
  };

  return (
    <form className={css.modalForm} onSubmit={submit}>
      <div className={css.row2}>
        <label className={css.field}>
          <span className={css.label}>Imię</span>
          <input className={css.input} value={values.firstName} maxLength={NAME_MAX} onChange={set('firstName')} autoComplete="given-name" />
        </label>
        <label className={css.field}>
          <span className={css.label}>Nazwisko</span>
          <input className={css.input} value={values.lastName} maxLength={NAME_MAX} onChange={set('lastName')} autoComplete="family-name" />
          <span className={css.help}>Inni zobaczą tylko pierwszą literę nazwiska.</span>
        </label>
      </div>
      <label className={css.field}>
        <span className={css.label}>O mnie</span>
        <textarea
          className={css.textarea}
          rows={5}
          maxLength={BIO_MAX}
          value={values.bio}
          onChange={set('bio')}
          placeholder="Np. kolekcjonuję niszowe zapachy i sprzedaję flakony, które mi się znudziły. Wszystko z oryginalnych perfumerii, mam paragony."
        />
        <span className={css.counter}>
          {values.bio.length}/{BIO_MAX}
        </span>
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
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className={css.help}>
        Nie podawaj telefonu, e-maila ani linków do innych serwisów – kontakt i płatności tylko przez Refume.
      </p>
      {state.error ? (
        <p className={css.error} role="alert">
          {state.error}
        </p>
      ) : null}
      <div className={css.actions}>
        <button type="submit" className={css.primaryBtn} disabled={state.saving}>
          {state.saving ? 'Zapisuję…' : 'Zapisz zmiany'}
        </button>
        <button type="button" className={css.secondaryBtn} disabled={state.saving} onClick={() => onDone(false)}>
          Anuluj
        </button>
      </div>
    </form>
  );
};

// ---------- Listings ----------

const STATUS_LABELS = {
  drafts: 'Wersja robocza',
  pending: 'Czeka na akceptację',
  closed: 'Ukryta',
  sold: 'Sprzedane',
};

const OwnListingCard = ({ listing, group, onChanged }) => {
  const dispatch = useDispatch();
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState(null);
  const id = listing.id.uuid;
  const { title, price, metadata } = listing.attributes;
  const slug = createSlug(title || 'oferta');
  const image = imageOf(listing);
  const isDraft = group === 'drafts';
  const hiddenByModerator = !!metadata?.moderacja?.ukryta;
  const views = metadata?.refumeWyswietlenia?.n || 0;
  const likes = metadata?.refumePolubienia?.n || 0;

  const run = action => {
    setBusy(true);
    setError(null);
    dispatch(listingAction(action, id))
      .then(() => onChanged())
      .catch(() => {
        setBusy(false);
        setError('Nie udało się. Spróbuj ponownie.');
      });
  };

  const editParams = { id, slug, type: isDraft ? 'draft' : 'edit', tab: 'details' };
  const linkProps = isDraft
    ? { name: 'EditListingPage', params: editParams }
    : { name: 'ListingPage', params: { id, slug } };

  return (
    <li className={classNames(css.card, css[`card_${group}`])}>
      <NamedLink {...linkProps} className={css.cardImageLink}>
        {image ? (
          <img src={image} alt="" className={css.cardImage} loading="lazy" />
        ) : (
          <span className={css.cardImagePlaceholder}>Brak zdjęcia</span>
        )}
        {group === 'sold' ? <span className={css.soldStamp}>SPRZEDANE</span> : null}
        {STATUS_LABELS[group] && group !== 'sold' ? (
          <span className={classNames(css.statusTag, css[`statusTag_${group}`])}>
            {hiddenByModerator ? 'Ukryta przez moderatora' : STATUS_LABELS[group]}
          </span>
        ) : null}
      </NamedLink>
      <div className={css.cardBody}>
        <NamedLink {...linkProps} className={css.cardTitle}>
          {title || 'Bez tytułu'}
        </NamedLink>
        <div className={css.cardMeta}>
          <span className={css.cardPrice}>{formatPrice(price) || '—'}</span>
          {group === 'active' ? (
            <span className={css.cardStats} title="Wyświetlenia i polubienia">
              👁 {views} · ♥ {likes}
            </span>
          ) : null}
        </div>
        {confirmDelete ? (
          <div className={css.cardActions}>
            <span className={css.confirmText}>Usunąć szkic?</span>
            <button type="button" className={css.dangerLink} disabled={busy} onClick={() => run('discard')}>
              Usuń
            </button>
            <button type="button" className={css.cardLink} onClick={() => setConfirmDelete(false)}>
              Nie
            </button>
          </div>
        ) : (
          <div className={css.cardActions}>
            {group !== 'sold' ? (
              <NamedLink name="EditListingPage" params={editParams} className={css.cardLink}>
                {isDraft ? 'Dokończ' : 'Edytuj'}
              </NamedLink>
            ) : null}
            {group === 'active' ? (
              <button type="button" className={css.cardLink} disabled={busy} onClick={() => run('close')}>
                Ukryj
              </button>
            ) : null}
            {group === 'closed' && !hiddenByModerator ? (
              <button type="button" className={css.cardLink} disabled={busy} onClick={() => run('open')}>
                Pokaż ponownie
              </button>
            ) : null}
            {isDraft ? (
              <button type="button" className={css.dangerLink} onClick={() => setConfirmDelete(true)}>
                Usuń
              </button>
            ) : null}
            {group === 'sold' ? (
              <NamedLink name="OrdersPage" params={{ tab: 'sprzedane' }} className={css.cardLink}>
                Zamówienia
              </NamedLink>
            ) : null}
          </div>
        )}
        {error ? <p className={css.cardError}>{error}</p> : null}
      </div>
    </li>
  );
};

const ListingSection = ({ title, count, hint, children }) => (
  <section className={css.section}>
    <div className={css.sectionHead}>
      <h2 className={css.sectionTitle}>
        {title}
        <span className={css.count}>{count}</span>
      </h2>
      {hint ? <p className={css.sectionHint}>{hint}</p> : null}
    </div>
    {children}
  </section>
);

const OwnListings = ({ listings, onChanged }) => {
  if (!listings) return <p className={css.muted}>Ładowanie ofert…</p>;
  const g = groupListings(listings);
  const card = group => l => (
    <OwnListingCard key={l.id.uuid} listing={l} group={group} onChanged={onChanged} />
  );
  return (
    <>
      <ListingSection title="Aktywne oferty" count={g.active.length + g.pending.length}>
        <ul className={css.grid}>
          <li className={css.addTile}>
            <NamedLink name="NewListingPage" className={css.addTileLink}>
              <span className={css.addPlus}>+</span>
              Dodaj ofertę
            </NamedLink>
          </li>
          {g.active.map(card('active'))}
          {g.pending.map(card('pending'))}
        </ul>
      </ListingSection>

      {g.closed.length ? (
        <ListingSection title="Ukryte" count={g.closed.length} hint="Nie widać ich w wyszukiwarce ani na profilu.">
          <ul className={css.grid}>{g.closed.map(card('closed'))}</ul>
        </ListingSection>
      ) : null}

      {g.drafts.length ? (
        <ListingSection title="Wersje robocze" count={g.drafts.length} hint="Niedokończone oferty – widzisz je tylko Ty.">
          <ul className={css.grid}>{g.drafts.map(card('drafts'))}</ul>
        </ListingSection>
      ) : null}

      {g.sold.length ? (
        <ListingSection title="Sprzedane" count={g.sold.length}>
          <ul className={css.grid}>{g.sold.map(card('sold'))}</ul>
        </ListingSection>
      ) : null}
    </>
  );
};

// ---------- Page content ----------

/**
 * Refume: your own profile — everything is edited here: photo, name, about, city,
 * shipping speed, and your listings (active, hidden, drafts, sold).
 */
const OwnProfile = props => {
  const { currentUser, reviews = [], queryReviewsError } = props;
  const dispatch = useDispatch();
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [listings, setListings] = useState(null);
  const [listingsError, setListingsError] = useState(false);
  const [reviewTab, setReviewTab] = useState(REVIEW_TYPE_OF_PROVIDER);

  const loadListings = () =>
    dispatch(queryOwnListings())
      .then(list => {
        setListings(list);
        setListingsError(false);
      })
      .catch(() => setListingsError(true));

  useEffect(() => {
    loadListings();
  }, []);

  const profile = currentUser.attributes.profile || {};
  const publicData = profile.publicData || {};
  const groups = listings ? groupListings(listings) : null;
  const checklist = [
    { key: 'avatar', label: 'Zdjęcie profilowe', done: !!currentUser.profileImage?.id },
    { key: 'bio', label: 'Kilka słów o sobie', done: !!(profile.bio || '').trim() },
    { key: 'miasto', label: 'Miasto', done: !!cleanCity(publicData.refumeMiasto) },
    { key: 'wysylka', label: 'Czas wysyłki', done: !!shippingSpeedLabel(publicData.refumeWysylka) },
    { key: 'oferta', label: 'Pierwsza oferta', done: !!groups && groups.active.length + groups.sold.length > 0 },
  ];
  const doneCount = checklist.filter(c => c.done).length;
  const percent = Math.round((doneCount / checklist.length) * 100);

  const providerReviews = reviews.filter(r => r.attributes.type === REVIEW_TYPE_OF_PROVIDER);
  const customerReviews = reviews.filter(r => r.attributes.type === REVIEW_TYPE_OF_CUSTOMER);
  const shownReviews = reviewTab === REVIEW_TYPE_OF_PROVIDER ? providerReviews : customerReviews;

  return (
    <div className={css.root}>
      <header className={css.header}>
        <AvatarUploader user={currentUser} />
        <div className={css.headerMain}>
          <div className={css.nameRow}>
            <h1 className={css.name}>{profile.displayName}</h1>
            <button
              type="button"
              className={css.secondaryBtn}
              onClick={() => {
                setEditing(true);
                setSaved(false);
              }}
            >
              Edytuj profil
            </button>
          </div>
          <ProfileFacts
            user={currentUser}
            reviews={reviews}
            listingsCount={groups ? groups.active.length : null}
          />
          <SellerBadges userId={currentUser.id.uuid} />
          {editing ? (
            <RefumeModal
              id="profile-edit"
              title="Edytuj profil"
              subtitle="To widzą kupujący na Twoim profilu."
              onClose={() => setEditing(false)}
            >
              <ProfileEditForm
                user={currentUser}
                onDone={didSave => {
                  setEditing(false);
                  setSaved(didSave);
                }}
              />
            </RefumeModal>
          ) : null}
          {profile.bio ? (
            <p className={css.bio}>{profile.bio}</p>
          ) : (
            <button type="button" className={css.emptyBio} onClick={() => setEditing(true)}>
              + Napisz kilka słów o sobie – kupujący chętniej kupują od osób, które znają.
            </button>
          )}
          {saved ? <p className={css.saved}>Zapisano ✓</p> : null}
        </div>
      </header>

      {percent < 100 ? (
        <div className={css.progress}>
          <div className={css.progressHead}>
            <strong>Profil uzupełniony w {percent}%</strong>
            <span className={css.muted}>Pełny profil budzi zaufanie kupujących.</span>
          </div>
          <div className={css.bar} aria-hidden="true">
            <span style={{ width: `${percent}%` }} />
          </div>
          <ul className={css.checklist}>
            {checklist.map(c => (
              <li key={c.key} className={c.done ? css.checkDone : null}>
                <span className={css.checkMark} aria-hidden="true">
                  {c.done ? '✓' : ''}
                </span>
                {c.label}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <BundleSettings currentUser={currentUser} />

      <nav className={css.quickLinks} aria-label="Skróty">
        <NamedLink name="OrdersPage" params={{ tab: 'sprzedane' }}>Sprzedane zamówienia</NamedLink>
        <NamedLink name="OrdersPage" params={{ tab: 'kupione' }}>Moje zakupy</NamedLink>
        <NamedLink name="FavoritesPage">Ulubione</NamedLink>
        <NamedLink name="AccountSettingsPage">E-mail, hasło i wypłaty</NamedLink>
      </nav>

      {listingsError ? (
        <p className={css.error}>Nie udało się wczytać ofert. Odśwież stronę.</p>
      ) : (
        <OwnListings listings={listings} onChanged={loadListings} />
      )}

      <section className={css.section} id="opinie">
        <div className={css.sectionHead}>
          <h2 className={css.sectionTitle}>Opinie</h2>
          <div className={css.reviewTabs} role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={reviewTab === REVIEW_TYPE_OF_PROVIDER}
              className={classNames(css.reviewTab, { [css.reviewTabActive]: reviewTab === REVIEW_TYPE_OF_PROVIDER })}
              onClick={() => setReviewTab(REVIEW_TYPE_OF_PROVIDER)}
            >
              Od kupujących ({providerReviews.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={reviewTab === REVIEW_TYPE_OF_CUSTOMER}
              className={classNames(css.reviewTab, { [css.reviewTabActive]: reviewTab === REVIEW_TYPE_OF_CUSTOMER })}
              onClick={() => setReviewTab(REVIEW_TYPE_OF_CUSTOMER)}
            >
              Od sprzedających ({customerReviews.length})
            </button>
          </div>
        </div>
        {queryReviewsError ? (
          <p className={css.error}>Nie udało się wczytać opinii.</p>
        ) : shownReviews.length ? (
          <Reviews reviews={shownReviews} />
        ) : (
          <p className={css.muted}>Nie masz jeszcze opinii.</p>
        )}
      </section>
    </div>
  );
};

export default OwnProfile;
