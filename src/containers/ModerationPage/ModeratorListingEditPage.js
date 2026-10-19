import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Form as FinalForm, Field } from 'react-final-form';
import arrayMutators from 'final-form-arrays';
import classNames from 'classnames';

import {
  fetchListingForModeration,
  editListingAsModerator,
  setListingVerifiedAsModerator,
} from '../../util/api';
import { Page, LayoutSingleColumn, NamedLink } from '../../components';
import TopbarContainer from '../TopbarContainer/TopbarContainer';
import FooterContainer from '../FooterContainer/FooterContainer';
import NotesFields from '../EditListingPage/EditListingWizard/EditListingDetailsPanel/NotesFields';

import css from './ModeratorListingEditPage.module.css';

const toList = value => (Array.isArray(value) ? value.map(String).filter(Boolean) : []);

const formatDate = iso => {
  try {
    return new Date(iso).toLocaleString('pl-PL', { dateStyle: 'medium', timeStyle: 'short' });
  } catch (e) {
    return iso || '';
  }
};

const errorText = e =>
  e?.status === 401
    ? 'Zaloguj się na konto moderatora.'
    : e?.status === 403
    ? 'To konto nie ma uprawnień moderatora.'
    : e?.status === 400
    ? 'Sprawdź pola: tytuł, cenę (min. 1 zł) i zostaw przynajmniej jedno zdjęcie.'
    : 'Coś poszło nie tak. Spróbuj ponownie.';

const VerificationControl = ({ listing, onChanged }) => {
  const verified = listing.weryfikacja?.status === 'zweryfikowano';
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const submit = () => {
    setBusy(true);
    setMessage(null);
    setListingVerifiedAsModerator({ listingId: listing.id, verified: !verified, reason: reason.trim() })
      .then(() => {
        setReason('');
        setMessage({ ok: true, text: 'Zapisano. Sprzedawca dostał wiadomość.' });
        onChanged();
      })
      .catch(e => setMessage({ ok: false, text: errorText(e) }))
      .finally(() => setBusy(false));
  };
  return (
    <section className={css.card} style={{ marginTop: 16 }}>
      <h2 className={css.cardTitle}>Znacznik „Zweryfikowano dowodem zakupu”</h2>
      <p className={css.meta}>
        Teraz: <strong>{verified ? 'oferta ma znacznik' : 'brak znacznika'}</strong>
        {listing.weryfikacja?.reczna ? ' (ustawiony ręcznie)' : ''}
        {listing.hasProof ? ' · sprzedawca dodał dowód zakupu' : ' · brak dowodu zakupu'}
      </p>
      <label className={css.label} htmlFor="mod-verify-reason">
        Powód zmiany (zobaczy go sprzedawca)
      </label>
      <input
        id="mod-verify-reason"
        className={css.input}
        value={reason}
        maxLength={300}
        onChange={e => setReason(e.target.value)}
        placeholder={
          verified
            ? 'Np. Dowód zakupu okazał się nieprawdziwy.'
            : 'Np. Dowód sprawdzony mailowo, poprawka błędu systemu.'
        }
      />
      <button
        type="button"
        className={css.submit}
        disabled={busy || !reason.trim()}
        onClick={submit}
      >
        {verified ? 'Odbierz znacznik' : 'Nadaj znacznik'}
      </button>
      {message ? (
        <p className={message.ok ? css.success : css.error} role="status">
          {message.text}
        </p>
      ) : null}
    </section>
  );
};

/**
 * Refume: moderator edits someone else's listing (route /moderacja/oferta/:id).
 * Saved through the server (Integration API); the seller gets an inbox message with the changes.
 */
const ModeratorListingEditPage = () => {
  const { id } = useParams();
  const [listing, setListing] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [removed, setRemoved] = useState([]);
  const [result, setResult] = useState(null);

  const load = () =>
    fetchListingForModeration(id)
      .then(r => {
        setListing(r?.data || null);
        setRemoved([]);
      })
      .catch(e => setLoadError(errorText(e)));

  useEffect(() => {
    load();
  }, [id]);

  const toggleImage = imageId =>
    setRemoved(list =>
      list.includes(imageId) ? list.filter(x => x !== imageId) : [...list, imageId]
    );

  const onSubmit = values => {
    setResult(null);
    const keepImageIds = listing.images.map(i => i.id).filter(i => !removed.includes(i));
    return editListingAsModerator({
      listingId: listing.id,
      title: values.title,
      description: values.description,
      priceAmount: Math.round(Number(String(values.price).replace(',', '.')) * 100),
      marka: values.marka,
      nuty: {
        glowy: toList(values.refumeNutyGlowy),
        serca: toList(values.refumeNutySerca),
        bazy: toList(values.refumeNutyBazy),
      },
      akordy: toList(values.refumeAkordy),
      keepImageIds,
      note: values.note,
    })
      .then(r => {
        const changed = r?.data?.changed || [];
        setResult({
          ok: true,
          text: changed.length
            ? `Zapisano. Zmieniono: ${changed.join(', ')}. Sprzedawca dostał wiadomość.`
            : 'Nic się nie zmieniło.',
        });
        return load();
      })
      .catch(e => setResult({ ok: false, text: errorText(e) }));
  };

  const initialValues = listing
    ? {
        title: listing.title,
        description: listing.description,
        price: listing.price ? (listing.price.amount / 100).toFixed(2).replace('.', ',') : '',
        marka: listing.marka,
        refumeNutyGlowy: toList(listing.nuty?.glowy),
        refumeNutySerca: toList(listing.nuty?.serca),
        refumeNutyBazy: toList(listing.nuty?.bazy),
        refumeAkordy: toList(listing.akordy),
        note: '',
      }
    : null;

  return (
    <Page title="Edycja oferty – moderator" scrollingDisabled={false}>
      <LayoutSingleColumn topbar={<TopbarContainer />} footer={<FooterContainer />}>
        <div className={css.root}>
          <NamedLink name="ModerationPage" className={css.back}>
            ← Panel moderatora
          </NamedLink>
          {loadError ? (
            <p className={css.error} role="alert">
              {loadError}
            </p>
          ) : !listing ? (
            <p className={css.muted}>Ładowanie…</p>
          ) : (
            <>
              <div className={css.header}>
                <h1 className={css.title}>Edycja oferty</h1>
                <p className={css.meta}>
                  Sprzedawca:{' '}
                  {listing.author?.id ? (
                    <NamedLink name="ProfilePage" params={{ id: listing.author.id }}>
                      {listing.author.name || '—'}
                    </NamedLink>
                  ) : (
                    '—'
                  )}{' '}
                  ·{' '}
                  <NamedLink name="ListingPageCanonical" params={{ id: listing.id }}>
                    Zobacz ofertę
                  </NamedLink>
                </p>
                <p className={css.notice}>
                  Edytujesz cudzą ofertę jako moderator. Sprzedawca dostanie w skrzynce wiadomość z
                  listą zmian.
                </p>
              </div>

              <FinalForm
                onSubmit={onSubmit}
                initialValues={initialValues}
                initialValuesEqual={(a, b) => JSON.stringify(a) === JSON.stringify(b)}
                mutators={{ ...arrayMutators }}
                render={({ handleSubmit, submitting }) => (
                  <form className={css.form} onSubmit={handleSubmit}>
                    <section className={css.card}>
                      <label className={css.label} htmlFor="mod-title">
                        Tytuł
                      </label>
                      <Field name="title" component="input" id="mod-title" className={css.input} maxLength={120} />

                      <label className={css.label} htmlFor="mod-description">
                        Opis
                      </label>
                      <Field
                        name="description"
                        component="textarea"
                        id="mod-description"
                        rows={6}
                        className={css.textarea}
                      />

                      <div className={css.row}>
                        <div className={css.col}>
                          <label className={css.label} htmlFor="mod-price">
                            Cena (zł)
                          </label>
                          <Field
                            name="price"
                            component="input"
                            id="mod-price"
                            inputMode="decimal"
                            className={css.input}
                          />
                        </div>
                        <div className={css.col}>
                          <label className={css.label} htmlFor="mod-brand">
                            Marka
                          </label>
                          <Field name="marka" component="input" id="mod-brand" className={css.input} />
                        </div>
                      </div>
                    </section>

                    <section className={css.card}>
                      <NotesFields formId="ModeratorEdit" />
                    </section>

                    <section className={css.card}>
                      <h2 className={css.cardTitle}>Zdjęcia</h2>
                      <p className={css.muted}>
                        Kliknij „Usuń” przy zdjęciu, które narusza zasady. Musi zostać co najmniej jedno.
                      </p>
                      <ul className={css.photos}>
                        {listing.images.map((image, i) => {
                          const isRemoved = removed.includes(image.id);
                          return (
                            <li key={image.id} className={classNames(css.photo, { [css.photoRemoved]: isRemoved })}>
                              {image.url ? (
                                <img src={image.url} alt={`Zdjęcie ${i + 1}`} className={css.photoImage} />
                              ) : (
                                <div className={css.photoImage} />
                              )}
                              <button
                                type="button"
                                className={isRemoved ? css.photoRestore : css.photoRemove}
                                onClick={() => toggleImage(image.id)}
                                aria-pressed={isRemoved}
                              >
                                {isRemoved ? 'Przywróć' : 'Usuń'}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </section>

                    <section className={css.card}>
                      <label className={css.label} htmlFor="mod-note">
                        Wiadomość do sprzedawcy (opcjonalnie)
                      </label>
                      <Field
                        name="note"
                        component="textarea"
                        id="mod-note"
                        rows={2}
                        maxLength={400}
                        className={css.textarea}
                        placeholder="Np. Usunęliśmy zdjęcie z danymi kontaktowymi. Prosimy nie umieszczać numeru telefonu w ofercie."
                      />
                    </section>

                    {result ? (
                      <p className={result.ok ? css.success : css.error} role="status">
                        {result.text}
                      </p>
                    ) : null}
                    <button
                      type="submit"
                      className={css.submit}
                      disabled={submitting || removed.length >= listing.images.length}
                    >
                      {submitting ? 'Zapisywanie…' : 'Zapisz zmiany'}
                    </button>
                  </form>
                )}
              />

              <VerificationControl listing={listing} onChanged={load} />

              {listing.edycje?.length ? (
                <section className={css.history}>
                  <h2 className={css.cardTitle}>Wcześniejsze zmiany moderatorów</h2>
                  <ul className={css.historyList}>
                    {listing.edycje.map(e => (
                      <li key={e.at}>
                        {formatDate(e.at)}: {e.pola.join(', ')}
                        {e.notatka ? ` · „${e.notatka}”` : ''}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </>
          )}
        </div>
      </LayoutSingleColumn>
    </Page>
  );
};

export default ModeratorListingEditPage;
