import React, { useCallback, useEffect, useState } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import classNames from 'classnames';

import {
  fetchModerationPanel,
  decideProof,
  moderateListing,
  moderateUser,
  undoProofDecision,
  resolveReport,
  moderateChatFlag,
  setUserBadgesAsModerator,
  markPhotosOk,
  decideAppeal,
  fetchDisputes,
} from '../../util/api';
import { Page, LayoutSingleColumn, NamedLink } from '../../components';
import ModerationSearch from './ModerationSearch';
import { DisputesTab, ChatView } from './ModerationDisputes';
import TopbarContainer from '../TopbarContainer/TopbarContainer';
import FooterContainer from '../FooterContainer/FooterContainer';

import css from './ModerationPage.module.css';

// ---------- Helpers ----------

export const formatDate = iso => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('pl-PL', { dateStyle: 'medium', timeStyle: 'short' });
  } catch (e) {
    return iso;
  }
};

export const formatPrice = price =>
  price?.amount != null
    ? `${(price.amount / 100).toFixed(2).replace('.', ',')} ${price.currency === 'PLN' ? 'zł' : price.currency}`
    : '';

export const errorMessage = e =>
  e?.status === 401
    ? 'Zaloguj się na konto moderatora.'
    : e?.status === 403
    ? 'To konto nie ma uprawnień moderatora.'
    : e?.status === 500 && /Integration API/.test(e?.statusText || '')
    ? 'Brakuje kluczy Integration API na serwerze (plik .env).'
    : 'Coś poszło nie tak. Odśwież stronę i spróbuj ponownie.';

const PROOF_REASONS = [
  'Zdjęcie jest nieczytelne',
  'Nie widać nazwy perfum',
  'Nie widać sklepu ani daty zakupu',
  'Dowód nie pasuje do perfum z oferty',
  'To nie jest dowód zakupu',
];
const HIDE_REASONS = [
  'Podejrzenie podróbki',
  'Zdjęcia nie pokazują sprzedawanego produktu',
  'Niedozwolony produkt',
  'Powielona oferta',
  'Kontakt lub płatność poza Refume',
];
export const BLOCK_REASONS = [
  'Sprzedaż podróbek',
  'Próba oszustwa',
  'Obraźliwe zachowanie',
  'Wielokrotne łamanie zasad',
];

const TABS = [
  { key: 'dowody', label: 'Dowody zakupu' },
  { key: 'oferty', label: 'Nowe oferty' },
  { key: 'zgloszenia', label: 'Zgłoszenia' },
  { key: 'spory', label: 'Spory' },
  { key: 'odwolania', label: 'Odwołania' },
  { key: 'historia', label: 'Historia' },
];

// ---------- Small building blocks ----------

export const Lightbox = ({ src, alt, onClose }) => {
  const [zoomed, setZoomed] = useState(false);
  const [rotation, setRotation] = useState(0);
  useEffect(() => {
    const onKey = e => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className={css.lightbox} role="dialog" aria-modal="true" aria-label={alt}>
      <div className={css.lightboxBar}>
        <button type="button" className={css.lightboxButton} onClick={() => setZoomed(z => !z)}>
          {zoomed ? 'Pomniejsz' : 'Powiększ'}
        </button>
        <button
          type="button"
          className={css.lightboxButton}
          onClick={() => setRotation(r => (r + 90) % 360)}
        >
          Obróć
        </button>
        <a className={css.lightboxButton} href={src} target="_blank" rel="noopener noreferrer">
          Otwórz w nowej karcie
        </a>
        <button type="button" className={css.lightboxButton} onClick={onClose} autoFocus>
          Zamknij
        </button>
      </div>
      <div className={css.lightboxStage} onClick={onClose}>
        <img
          src={src}
          alt={alt}
          className={classNames(css.lightboxImage, { [css.lightboxZoomed]: zoomed })}
          style={{ transform: `rotate(${rotation}deg)${zoomed ? ' scale(2)' : ''}` }}
          onClick={e => {
            e.stopPropagation();
            setZoomed(z => !z);
          }}
        />
      </div>
    </div>
  );
};

/** Preset reasons as chips + free text. Calls onConfirm(reason). */
export const ReasonForm = ({ id, label, presets, confirmLabel, danger, busy, onConfirm, onCancel }) => {
  const [reason, setReason] = useState('');
  return (
    <div className={css.reasonBox}>
      <span className={css.label}>{label}</span>
      <div className={css.chips}>
        {presets.map(p => (
          <button
            key={p}
            type="button"
            className={classNames(css.chip, { [css.chipActive]: reason === p })}
            onClick={() => setReason(p)}
          >
            {p}
          </button>
        ))}
      </div>
      <label htmlFor={id} className={css.srOnly}>
        {label}
      </label>
      <textarea
        id={id}
        className={css.textarea}
        value={reason}
        maxLength={500}
        rows={2}
        onChange={e => setReason(e.target.value)}
        placeholder="Wybierz powód powyżej albo wpisz własny (zobaczy go użytkownik)."
      />
      <div className={css.actions}>
        <button
          type="button"
          className={danger ? css.dangerButton : css.primaryButton}
          disabled={busy || !reason.trim()}
          onClick={() => onConfirm(reason.trim())}
        >
          {confirmLabel}
        </button>
        <button type="button" className={css.secondaryButton} disabled={busy} onClick={onCancel}>
          Anuluj
        </button>
      </div>
    </div>
  );
};

export const useAction = onDone => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const run = (promiseFn, after) => {
    setBusy(true);
    setError(null);
    return promiseFn()
      .then(() => {
        setBusy(false);
        if (after) after();
        onDone();
      })
      .catch(e => {
        setBusy(false);
        setError(errorMessage(e));
      });
  };
  return { busy, error, run };
};

export const ErrorLine = ({ error }) =>
  error ? (
    <p className={css.error} role="alert">
      {error}
    </p>
  ) : null;

const ListingFacts = ({ listing }) => (
  <>
    <span className={css.titleRow}>
      <NamedLink name="ListingPageCanonical" params={{ id: listing.id }} className={css.listingTitle}>
        {listing.title}
      </NamedLink>
      <NamedLink name="ModeratorListingEditPage" params={{ id: listing.id }} className={css.editLink}>
        Edytuj
      </NamedLink>
    </span>
    <p className={css.meta}>
      {[listing.brand, formatPrice(listing.price)].filter(Boolean).join(' · ')}
    </p>
    <p className={css.meta}>
      Sprzedawca:{' '}
      {listing.author?.id ? (
        <NamedLink name="ModeratorUserPage" params={{ id: listing.author.id }}>
          {listing.author.name || '—'}
        </NamedLink>
      ) : (
        '—'
      )}
      {listing.author?.blocked ? <span className={css.pillDanger}>zablokowany</span> : null} ·
      dodano {formatDate(listing.createdAt)}
    </p>
  </>
);

// ---------- Proofs ----------

const ProofCard = ({ item, onChanged, openImage }) => {
  const [rejecting, setRejecting] = useState(false);
  const { busy, error, run } = useAction(onChanged);
  const send = (decision, reason) => run(() => decideProof({ listingId: item.id, decision, reason }));

  return (
    <li className={css.card}>
      <div className={css.proofGrid}>
        <div className={css.proofColumn}>
          <span className={css.columnLabel}>Dowód zakupu</span>
          <button
            type="button"
            className={css.imageButton}
            onClick={() => openImage(item.proof.url, `Dowód zakupu: ${item.title}`)}
          >
            <img src={item.proof.url} alt={`Dowód zakupu: ${item.title}`} className={css.proofImage} />
            <span className={css.zoomHint}>Kliknij, aby powiększyć</span>
          </button>
          <span className={css.metaSmall}>Wysłano {formatDate(item.proof.uploadedAt)}</span>
        </div>
        <div className={css.proofColumn}>
          <span className={css.columnLabel}>Oferta</span>
          {item.images?.length ? (
            <div className={css.thumbs}>
              {item.images.map((src, i) => (
                <button
                  key={src}
                  type="button"
                  className={css.thumbButton}
                  onClick={() => openImage(src, `Zdjęcie ${i + 1}: ${item.title}`)}
                >
                  <img src={src} alt={`Zdjęcie ${i + 1}`} className={css.thumb} />
                </button>
              ))}
            </div>
          ) : (
            <p className={css.muted}>Brak zdjęć.</p>
          )}
          <ListingFacts listing={item} />
          {item.description ? <p className={css.description}>{item.description}</p> : null}
          {item.weryfikacja?.status === 'odrzucono' ? (
            <p className={css.previous}>
              Wysłane ponownie. Poprzedni powód odrzucenia: {item.proofReason || '—'}
            </p>
          ) : null}
        </div>
      </div>

      {rejecting ? (
        <ReasonForm
          id={`reject-${item.id}`}
          label="Powód odrzucenia (zobaczy go sprzedawca)"
          presets={PROOF_REASONS}
          confirmLabel="Odrzuć dowód"
          danger
          busy={busy}
          onConfirm={reason => send('reject', reason)}
          onCancel={() => setRejecting(false)}
        />
      ) : (
        <div className={css.actions}>
          <button type="button" className={css.approveButton} disabled={busy} onClick={() => send('approve')}>
            Zatwierdź
          </button>
          <button type="button" className={css.secondaryButton} disabled={busy} onClick={() => setRejecting(true)}>
            Odrzuć…
          </button>
        </div>
      )}
      <ErrorLine error={error} />
    </li>
  );
};

// ---------- New listings ----------

const NewListingCard = ({ item, onChanged, openImage }) => {
  const [mode, setMode] = useState(null); // 'hide' | 'block'
  const { busy, error, run } = useAction(onChanged);
  return (
    <li className={css.card}>
      <div className={css.row}>
        {item.images?.[0] ? (
          <button
            type="button"
            className={css.rowImageButton}
            onClick={() => openImage(item.images[0], item.title)}
          >
            <img src={item.images[0]} alt="" className={css.rowImage} />
          </button>
        ) : (
          <div className={css.rowImagePlaceholder} />
        )}
        <div className={css.rowBody}>
          <ListingFacts listing={item} />
          {item.description ? <p className={css.descriptionShort}>{item.description}</p> : null}
        </div>
      </div>
      {mode === 'hide' ? (
        <ReasonForm
          id={`hide-${item.id}`}
          label="Dlaczego ukrywasz ofertę? (zobaczy to sprzedawca)"
          presets={HIDE_REASONS}
          confirmLabel="Ukryj ofertę"
          danger
          busy={busy}
          onConfirm={reason => run(() => moderateListing({ listingId: item.id, action: 'ukryj', reason }))}
          onCancel={() => setMode(null)}
        />
      ) : mode === 'block' ? (
        <ReasonForm
          id={`block-${item.id}`}
          label={`Zablokować konto ${item.author?.name || ''}? Wszystkie jego oferty zostaną ukryte.`}
          presets={BLOCK_REASONS}
          confirmLabel="Zablokuj konto"
          danger
          busy={busy}
          onConfirm={reason => run(() => moderateUser({ userId: item.author.id, action: 'zablokuj', reason }))}
          onCancel={() => setMode(null)}
        />
      ) : (
        <div className={css.actions}>
          <button
            type="button"
            className={css.approveButton}
            disabled={busy}
            onClick={() => run(() => moderateListing({ listingId: item.id, action: 'ok' }))}
          >
            W porządku
          </button>
          <button type="button" className={css.secondaryButton} disabled={busy} onClick={() => setMode('hide')}>
            Ukryj ofertę…
          </button>
          {item.author?.id && !item.author.blocked ? (
            <button type="button" className={css.dangerLink} disabled={busy} onClick={() => setMode('block')}>
              Zablokuj sprzedawcę…
            </button>
          ) : null}
        </div>
      )}
      <ErrorLine error={error} />
    </li>
  );
};

// ---------- Suspicious photos ----------

const PHOTO_REASONS = {
  'inni-sprzedawcy': ['Te same zdjęcia u innego sprzedawcy', css.pillDanger],
  internet: ['Zdjęcie znalezione w internecie', css.pillWarning],
  'ten-sam-sprzedawca': ['Powtórzone zdjęcia w ofertach tego sprzedawcy', css.pill],
};

const PhotoFlagCard = ({ item, onChanged, openImage }) => {
  const [mode, setMode] = useState(null);
  const { busy, error, run } = useAction(onChanged);
  const [label, pill] = PHOTO_REASONS[item.reason] || ['Podejrzane zdjęcia', css.pill];
  const listing = item.listing;
  return (
    <li className={css.card}>
      <div className={css.reportHead}>
        <span className={pill} style={{ marginLeft: 0 }}>
          {label}
        </span>
      </div>
      <div className={css.row}>
        {listing.images?.[0] ? (
          <button type="button" className={css.rowImageButton} onClick={() => openImage(listing.images[0], listing.title)}>
            <img src={listing.images[0]} alt="" className={css.rowImage} />
          </button>
        ) : null}
        <div className={css.rowBody}>
          <ListingFacts listing={listing} />
        </div>
      </div>

      {item.matches.length ? (
        <div className={css.matches}>
          <span className={css.columnLabel}>To samo zdjęcie w innych ofertach</span>
          <ul className={css.matchList}>
            {item.matches.map(m => (
              <li key={m.listing.id} className={css.match}>
                <div className={css.matchImages}>
                  {m.mine ? (
                    <button type="button" className={css.thumbButton} onClick={() => openImage(m.mine, 'Ta oferta')}>
                      <img src={m.mine} alt="Zdjęcie z tej oferty" className={css.matchThumb} />
                    </button>
                  ) : null}
                  <span aria-hidden="true" className={css.matchEq}>=</span>
                  {m.theirs ? (
                    <button type="button" className={css.thumbButton} onClick={() => openImage(m.theirs, m.listing.title)}>
                      <img src={m.theirs} alt="Zdjęcie z innej oferty" className={css.matchThumb} />
                    </button>
                  ) : null}
                </div>
                <div className={css.matchInfo}>
                  <NamedLink name="ListingPageCanonical" params={{ id: m.listing.id }}>
                    {m.listing.title}
                  </NamedLink>
                  <span className={css.metaSmall}>
                    {m.sameAuthor ? 'ten sam sprzedawca' : `sprzedawca: ${m.listing.author?.name || '—'}`} · dodano{' '}
                    {formatDate(m.listing.createdAt)}
                    {m.listing.state !== 'published' ? ' · nieaktywna' : ''}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {item.web ? (
        <div className={css.matches}>
          <span className={css.columnLabel}>
            Znalezione w internecie{item.web.pelne ? ` (${item.web.pelne} identycznych kopii)` : ''}
          </span>
          <ul className={css.webList}>
            {(item.web.strony || []).map(p => (
              <li key={p.url}>
                <a href={p.url} target="_blank" rel="noopener noreferrer nofollow">
                  {p.title || p.url}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {mode === 'hide' ? (
        <ReasonForm
          id={`phide-${listing.id}`}
          label="Dlaczego ukrywasz ofertę? (zobaczy to sprzedawca)"
          presets={['Zdjęcia skopiowane z innej oferty lub z internetu', ...HIDE_REASONS]}
          confirmLabel="Ukryj ofertę"
          danger
          busy={busy}
          onConfirm={reason => run(() => moderateListing({ listingId: listing.id, action: 'ukryj', reason }))}
          onCancel={() => setMode(null)}
        />
      ) : mode === 'block' ? (
        <ReasonForm
          id={`pblock-${listing.id}`}
          label={`Zablokować konto ${listing.author?.name || ''}? Wszystkie jego oferty zostaną ukryte.`}
          presets={['Oferty ze skradzionymi zdjęciami', ...BLOCK_REASONS]}
          confirmLabel="Zablokuj konto"
          danger
          busy={busy}
          onConfirm={reason => run(() => moderateUser({ userId: listing.author.id, action: 'zablokuj', reason }))}
          onCancel={() => setMode(null)}
        />
      ) : (
        <div className={css.actions}>
          <button
            type="button"
            className={css.approveButton}
            disabled={busy}
            onClick={() => run(() => markPhotosOk({ listingId: listing.id }))}
          >
            Zdjęcia w porządku
          </button>
          <button type="button" className={css.secondaryButton} disabled={busy} onClick={() => setMode('hide')}>
            Ukryj ofertę…
          </button>
          {listing.author?.id && !listing.author.blocked ? (
            <button type="button" className={css.dangerLink} disabled={busy} onClick={() => setMode('block')}>
              Zablokuj sprzedawcę…
            </button>
          ) : null}
        </div>
      )}
      <ErrorLine error={error} />
    </li>
  );
};

// ---------- Reports ----------

const Conversation = ({ txId }) => <ChatView txId={txId} compact />;

const ReportCard = ({ item, onChanged, openImage }) => {
  const [mode, setMode] = useState(null);
  const { busy, error, run } = useAction(onChanged);
  const isOpen = item.status === 'nowe';
  const [showChat, setShowChat] = useState(false);
  const targetUserId =
    item.typ === 'uzytkownik'
      ? item.celId
      : item.typ === 'rozmowa'
      ? item.celUzytkownikId
      : item.listing?.author?.id;
  const targetUserName =
    item.typ === 'uzytkownik'
      ? item.celNazwa
      : item.typ === 'rozmowa'
      ? 'tę osobę'
      : item.listing?.author?.name;
  const resolve = action => run(() => resolveReport({ reporterId: item.reporterId, reportId: item.id, action }));

  return (
    <li className={classNames(css.card, { [css.cardMuted]: !isOpen })}>
      <div className={css.reportHead}>
        <span className={isOpen ? css.pillWarning : css.pill}>
          {isOpen ? 'Nowe' : item.status === 'rozpatrzone' ? 'Rozpatrzone' : 'Odrzucone'}
        </span>
        <span className={css.reportReason}>{item.powodEtykieta || item.powod}</span>
        <span className={css.metaSmall}>
          {item.typ === 'oferta' ? 'Oferta' : item.typ === 'rozmowa' ? 'Rozmowa' : 'Użytkownik'} ·
          zgłosił(a){' '}
          <NamedLink name="ModeratorUserPage" params={{ id: item.reporterId }}>
            {item.reporterName || '—'}
          </NamedLink>{' '}
          · {formatDate(item.utworzono)}
        </span>
      </div>

      <div className={css.row}>
        {item.listing?.images?.[0] ? (
          <button
            type="button"
            className={css.rowImageButton}
            onClick={() => openImage(item.listing.images[0], item.listing.title)}
          >
            <img src={item.listing.images[0]} alt="" className={css.rowImage} />
          </button>
        ) : null}
        <div className={css.rowBody}>
          {item.typ === 'oferta' ? (
            item.listing ? (
              <ListingFacts listing={item.listing} />
            ) : (
              <p className={css.meta}>{item.celNazwa || 'Oferta'} (już nie istnieje)</p>
            )
          ) : item.typ === 'rozmowa' ? (
            <>
              <span className={css.listingTitle}>{item.celNazwa || 'Rozmowa'}</span>
              {item.celUzytkownikId ? (
                <p className={css.meta}>
                  Zgłoszona osoba:{' '}
                  <NamedLink name="ModeratorUserPage" params={{ id: item.celUzytkownikId }}>
                    zobacz profil
                  </NamedLink>
                </p>
              ) : null}
              <button type="button" className={css.linkButton} onClick={() => setShowChat(v => !v)}>
                {showChat ? 'Ukryj rozmowę' : 'Pokaż rozmowę'}
              </button>
            </>
          ) : (
            <NamedLink name="ModeratorUserPage" params={{ id: item.celId }} className={css.listingTitle}>
              {item.celNazwa || 'Profil użytkownika'}
            </NamedLink>
          )}
          {item.opis ? <blockquote className={css.quote}>{item.opis}</blockquote> : null}
          {!isOpen && item.decyzja ? <p className={css.metaSmall}>Notatka: {item.decyzja}</p> : null}
        </div>
      </div>
      {item.typ === 'rozmowa' && showChat ? <Conversation txId={item.celId} /> : null}

      {isOpen ? (
        mode === 'hide' ? (
          <ReasonForm
            id={`rhide-${item.id}`}
            label="Dlaczego ukrywasz ofertę? (zobaczy to sprzedawca)"
            presets={HIDE_REASONS}
            confirmLabel="Ukryj ofertę i zamknij zgłoszenie"
            danger
            busy={busy}
            onConfirm={reason =>
              run(
                () =>
                  moderateListing({ listingId: item.celId, action: 'ukryj', reason }).then(() =>
                    resolveReport({ reporterId: item.reporterId, reportId: item.id, action: 'rozpatrzone' })
                  ),
                () => setMode(null)
              )
            }
            onCancel={() => setMode(null)}
          />
        ) : mode === 'block' ? (
          <ReasonForm
            id={`rblock-${item.id}`}
            label={`Zablokować konto ${targetUserName || ''}? Wszystkie jego oferty zostaną ukryte.`}
            presets={BLOCK_REASONS}
            confirmLabel="Zablokuj i zamknij zgłoszenie"
            danger
            busy={busy}
            onConfirm={reason =>
              run(
                () =>
                  moderateUser({ userId: targetUserId, action: 'zablokuj', reason }).then(() =>
                    resolveReport({ reporterId: item.reporterId, reportId: item.id, action: 'rozpatrzone' })
                  ),
                () => setMode(null)
              )
            }
            onCancel={() => setMode(null)}
          />
        ) : (
          <div className={css.actions}>
            {item.typ === 'oferta' && item.listing && !item.listing.moderacja?.ukryta ? (
              <button type="button" className={css.secondaryButton} disabled={busy} onClick={() => setMode('hide')}>
                Ukryj ofertę…
              </button>
            ) : null}
            {targetUserId ? (
              <button type="button" className={css.dangerLink} disabled={busy} onClick={() => setMode('block')}>
                Zablokuj {item.typ === 'oferta' ? 'sprzedawcę' : 'tę osobę'}…
              </button>
            ) : null}
            <button type="button" className={css.approveButton} disabled={busy} onClick={() => resolve('rozpatrzone')}>
              Rozpatrzone
            </button>
            <button type="button" className={css.secondaryButton} disabled={busy} onClick={() => resolve('odrzucone')}>
              Bez naruszenia
            </button>
          </div>
        )
      ) : null}
      <ErrorLine error={error} />
    </li>
  );
};

// ---------- Automatically flagged chat messages ----------

const FLAG_TYPES = {
  kontakt: 'Dane kontaktowe',
  platnosc: 'Płatność poza Refume',
  link: 'Podejrzany link',
};

const ChatFlagCard = ({ item, onChanged }) => {
  const [showChat, setShowChat] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const { busy, error, run } = useAction(onChanged);
  const act = action => run(() => moderateChatFlag({ flagId: item.id, action }));
  return (
    <li className={css.card}>
      <div className={css.reportHead}>
        <span className={css.pillWarning}>Wykryte automatycznie</span>
        {item.typy.map(t => (
          <span key={t} className={css.reportReason}>
            {FLAG_TYPES[t] || t}
          </span>
        ))}
        <span className={css.metaSmall}>
          Wysłał(a){' '}
          <NamedLink name="ModeratorUserPage" params={{ id: item.senderId }}>
            {item.senderName || '—'}
          </NamedLink>{' '}
          · {formatDate(item.wyslano || item.utworzono)}
          {item.listingTitle ? ` · „${item.listingTitle}”` : ''}
        </span>
      </div>
      <button type="button" className={css.linkButton} onClick={() => setShowChat(v => !v)}>
        {showChat ? 'Ukryj rozmowę' : 'Pokaż rozmowę'}
      </button>
      {showChat ? <Conversation txId={item.txId} /> : null}
      {blocking ? (
        <ReasonForm
          id={`fblock-${item.id}`}
          label={`Zablokować konto ${item.senderName || ''}? Wszystkie jego oferty zostaną ukryte.`}
          presets={['Wielokrotne wyprowadzanie kontaktu poza Refume', ...BLOCK_REASONS]}
          confirmLabel="Zablokuj konto"
          danger
          busy={busy}
          onConfirm={reason =>
            run(() =>
              moderateUser({ userId: item.senderId, action: 'zablokuj', reason }).then(() =>
                moderateChatFlag({ flagId: item.id, action: 'zablokuj' })
              )
            )
          }
          onCancel={() => setBlocking(false)}
        />
      ) : (
        <div className={css.actions}>
          <button type="button" className={css.approveButton} disabled={busy} onClick={() => act('ok')}>
            W porządku
          </button>
          <button type="button" className={css.secondaryButton} disabled={busy} onClick={() => act('ostrzez')}>
            Ostrzeż nadawcę
          </button>
          <button type="button" className={css.dangerLink} disabled={busy} onClick={() => setBlocking(true)}>
            Zablokuj nadawcę…
          </button>
        </div>
      )}
      <ErrorLine error={error} />
    </li>
  );
};

// ---------- History ----------

const HISTORY_LABELS = {
  zweryfikowano: ['Dowód zatwierdzony', css.pillSuccess],
  odrzucono: ['Dowód odrzucony', css.pillDanger],
  ukryta: ['Oferta ukryta', css.pillWarning],
  blokada: ['Konto zablokowane', css.pillDanger],
  cofnieto: ['Znacznik odebrany', css.pillWarning],
  odznaki: ['Odznaki poprawione', css.pill],
};

const HistoryRow = ({ item, onChanged }) => {
  const { busy, error, run } = useAction(onChanged);
  const key = item.kind === 'dowod' ? item.status : item.kind;
  const [label, pillClass] = HISTORY_LABELS[key] || ['Zmiana', css.pill];
  return (
    <li className={css.historyRow}>
      <span className={pillClass}>{label}</span>
      <div className={css.historyBody}>
        {item.listing ? (
          <NamedLink name="ListingPageCanonical" params={{ id: item.listing.id }} className={css.historyTitle}>
            {item.listing.title}
          </NamedLink>
        ) : (
          <NamedLink name="ModeratorUserPage" params={{ id: item.user.id }} className={css.historyTitle}>
            {item.user.name || 'Użytkownik'}
          </NamedLink>
        )}
        <span className={css.metaSmall}>
          {formatDate(item.at)}
          {item.listing?.author?.name ? ` · ${item.listing.author.name}` : ''}
          {item.reason ? ` · ${item.reason}` : ''}
        </span>
        <ErrorLine error={error} />
      </div>
      <button
        type="button"
        className={css.secondaryButtonSmall}
        disabled={busy}
        onClick={() =>
          run(() =>
            item.kind === 'dowod'
              ? undoProofDecision({ listingId: item.listing.id })
              : item.kind === 'ukryta'
              ? moderateListing({ listingId: item.listing.id, action: 'przywroc' })
              : item.kind === 'odznaki'
              ? setUserBadgesAsModerator({
                  userId: item.user.id,
                  values: { szybkaWysylka: 'auto', topSprzedawca: 'auto' },
                  reason: 'Przywrócono automatyczne liczenie odznak.',
                })
              : moderateUser({ userId: item.user.id, action: 'odblokuj' })
          )
        }
      >
        {item.kind === 'dowod'
          ? 'Cofnij decyzję'
          : item.kind === 'ukryta'
          ? 'Przywróć ofertę'
          : item.kind === 'odznaki'
          ? 'Przywróć automatyczne'
          : 'Odblokuj'}
      </button>
    </li>
  );
};

// ---------- Appeals ----------

const APPEAL_TYPES = {
  'dowod-odrzucony': 'Odrzucony dowód zakupu',
  'oferta-ukryta': 'Ukryta oferta',
  'konto-zablokowane': 'Blokada konta',
  'znacznik-odebrany': 'Odebrany znacznik weryfikacji',
  'ostrzezenie-czat': 'Ostrzeżenie za czat',
  'oferta-edytowana': 'Edycja oferty przez moderatora',
  'odznaki-zmienione': 'Zmiana odznak',
};

export const AppealCard = ({ item, userId, onChanged, hideUser }) => {
  const [mode, setMode] = useState(null);
  const [answer, setAnswer] = useState('');
  const { busy, error, run } = useAction(onChanged);
  const isOpen = item.status === 'nowe';
  const ownerId = item.userId || userId;
  return (
    <li className={classNames(css.card, { [css.cardMuted]: !isOpen })}>
      <div className={css.reportHead}>
        <span
          className={
            isOpen ? css.pillWarning : item.status === 'uwzglednione' ? css.pillSuccess : css.pill
          }
        >
          {isOpen ? 'Nowe' : item.status === 'uwzglednione' ? 'Uwzględnione' : 'Odrzucone'}
        </span>
        <span className={css.reportReason}>{APPEAL_TYPES[item.typ] || item.tytul}</span>
        <span className={css.metaSmall}>
          {hideUser ? null : (
            <>
              <NamedLink name="ModeratorUserPage" params={{ id: ownerId }}>
                {item.userName || 'Użytkownik'}
              </NamedLink>{' '}
              ·{' '}
            </>
          )}
          {formatDate(item.utworzono)}
        </span>
      </div>
      <div className={css.appealDecision}>
        <span className={css.label}>Decyzja ({formatDate(item.decyzjaData)})</span>
        <p className={css.meta}>{item.decyzja}</p>
        {item.listingId ? (
          <p className={css.metaSmall}>
            <NamedLink name="ListingPageCanonical" params={{ id: item.listingId }}>
              Zobacz ofertę
            </NamedLink>{' '}
            ·{' '}
            <NamedLink name="ModeratorListingEditPage" params={{ id: item.listingId }}>
              Edytuj
            </NamedLink>
          </p>
        ) : null}
      </div>
      <div className={css.appealText}>
        <span className={css.label}>Odwołanie</span>
        <p className={css.quote}>{item.tresc}</p>
      </div>
      {!isOpen ? (
        <p className={css.metaSmall}>
          Odpowiedź ({formatDate(item.rozpatrzono)}): {item.odpowiedz}
        </p>
      ) : mode ? (
        <div className={css.reasonBox}>
          <label className={css.label} htmlFor={`appeal-${item.id}`}>
            {mode === 'uwzglednione'
              ? 'Uzasadnienie uwzględnienia (zobaczy je użytkownik)'
              : 'Dlaczego decyzja zostaje utrzymana (zobaczy to użytkownik)'}
          </label>
          <textarea
            id={`appeal-${item.id}`}
            className={css.textarea}
            rows={3}
            maxLength={1000}
            value={answer}
            onChange={e => setAnswer(e.target.value)}
          />
          <div className={css.actions}>
            <button
              type="button"
              className={mode === 'uwzglednione' ? css.primaryButton : css.dangerButton}
              disabled={busy || !answer.trim()}
              onClick={() =>
                run(() =>
                  decideAppeal({ userId: ownerId, appealId: item.id, decision: mode, odpowiedz: answer.trim() })
                )
              }
            >
              {mode === 'uwzglednione' ? 'Uwzględnij' : 'Odrzuć odwołanie'}
            </button>
            <button type="button" className={css.secondaryButton} disabled={busy} onClick={() => setMode(null)}>
              Anuluj
            </button>
          </div>
        </div>
      ) : (
        <div className={css.actions}>
          <button type="button" className={css.primaryButton} onClick={() => setMode('uwzglednione')}>
            Uwzględnij
          </button>
          <button type="button" className={css.secondaryButton} onClick={() => setMode('odrzucone')}>
            Odrzuć
          </button>
        </div>
      )}
      <ErrorLine error={error} />
    </li>
  );
};

// ---------- Page ----------

/**
 * Refume: moderator panel (route /moderacja). Access is checked on the server
 * (REFUME_MODERATOR_USER_IDS).
 */
const ModerationPage = () => {
  const location = useLocation();
  const history = useHistory();
  const tab = new URLSearchParams(location.search).get('tab') || 'dowody';
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [image, setImage] = useState(null);
  const [showClosed, setShowClosed] = useState(false);
  const [disputeCount, setDisputeCount] = useState(null);

  const load = useCallback(() => {
    setError(null);
    return fetchModerationPanel()
      .then(r => setData(r?.data || null))
      .catch(e => setError(errorMessage(e)));
  }, []);

  useEffect(() => {
    load();
    fetchDisputes()
      .then(r => setDisputeCount(r?.data?.open?.length || 0))
      .catch(() => null);
  }, [load]);

  const openImage = (src, alt) => setImage({ src, alt });
  const setTab = key => history.replace({ search: key === 'dowody' ? '' : `?tab=${key}` });

  const openReports = (data?.reports || []).filter(r => r.status === 'nowe');
  const openFlags = (data?.chatFlags || []).filter(f => f.status === 'nowe');
  const closedReports = (data?.reports || []).filter(r => r.status !== 'nowe');
  const counts = {
    dowody: data?.proofs?.length || 0,
    oferty: (data?.newListings?.length || 0) + (data?.photoFlags?.length || 0),
    zgloszenia: openReports.length + openFlags.length,
    odwolania: (data?.appeals || []).filter(a => a.status === 'nowe').length,
    spory: disputeCount,
    historia: null,
  };

  const empty = text => <p className={css.empty}>{text}</p>;

  return (
    <Page title="Panel moderatora" scrollingDisabled={!!image}>
      <LayoutSingleColumn topbar={<TopbarContainer />} footer={<FooterContainer />}>
        <div className={classNames(css.root, { [css.rootWide]: tab === 'spory' })}>
          <div className={css.header}>
            <h1 className={css.title}>Panel moderatora</h1>
            <button type="button" className={css.secondaryButton} onClick={load}>
              Odśwież
            </button>
          </div>
          <ModerationSearch />

          <div className={css.tabs} role="tablist" aria-label="Sekcje moderacji">
            {TABS.map(t => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                className={classNames(css.tab, { [css.tabActive]: tab === t.key })}
                onClick={() => setTab(t.key)}
              >
                {t.label}
                {counts[t.key] ? <span className={css.tabCount}>{counts[t.key]}</span> : null}
              </button>
            ))}
          </div>

          {error ? (
            <p className={css.error} role="alert">
              {error}
            </p>
          ) : !data ? (
            <p className={css.muted}>Ładowanie…</p>
          ) : tab === 'dowody' ? (
            data.proofs.length ? (
              <ul className={css.list}>
                {data.proofs.map(item => (
                  <ProofCard key={item.id} item={item} onChanged={load} openImage={openImage} />
                ))}
              </ul>
            ) : (
              empty('Nie ma dowodów do sprawdzenia.')
            )
          ) : tab === 'oferty' ? (
            <>
              {data.photoFlags?.length ? (
                <div className={css.flagBlock}>
                  <h2 className={css.sectionTitle}>Podejrzane zdjęcia</h2>
                  <p className={css.intro}>
                    Oferty, których zdjęcia są w innych ofertach na Refume
                    {' '}albo w internecie. Zwykle to kradzione zdjęcia albo powielona oferta.
                  </p>
                  <ul className={css.list}>
                    {data.photoFlags.map(item => (
                      <PhotoFlagCard key={item.listing.id} item={item} onChanged={load} openImage={openImage} />
                    ))}
                  </ul>
                </div>
              ) : null}
              {data.photoFlags?.length ? <h2 className={css.sectionTitle}>Nowe oferty</h2> : null}
              <p className={css.intro}>
                Opublikowane w ostatnich 30 dniach i jeszcze nieprzejrzane. „W porządku” usuwa ofertę z
                tej listy, „Ukryj” zamyka ją i wysyła sprzedawcy powód.
              </p>
              {data.newListings.length ? (
                <ul className={css.list}>
                  {data.newListings.map(item => (
                    <NewListingCard key={item.id} item={item} onChanged={load} openImage={openImage} />
                  ))}
                </ul>
              ) : (
                empty('Wszystkie nowe oferty są przejrzane.')
              )}
            </>
          ) : tab === 'zgloszenia' ? (
            <>
              {openFlags.length ? (
                <div className={css.flagBlock}>
                  <h2 className={css.sectionTitle}>Wykryte automatycznie w czacie</h2>
                  <p className={css.intro}>
                    Wiadomości z numerem telefonu, e-mailem, numerem konta, propozycją płatności poza
                    Refume albo podejrzanym linkiem. Odbiorca widzi je już z zakrytymi danymi.
                  </p>
                  <ul className={css.list}>
                    {openFlags.map(item => (
                      <ChatFlagCard key={item.id} item={item} onChanged={load} />
                    ))}
                  </ul>
                </div>
              ) : null}
              {openFlags.length ? <h2 className={css.sectionTitle}>Zgłoszenia od użytkowników</h2> : null}
              {openReports.length ? (
                <ul className={css.list}>
                  {openReports.map(item => (
                    <ReportCard key={`${item.reporterId}-${item.id}`} item={item} onChanged={load} openImage={openImage} />
                  ))}
                </ul>
              ) : (
                empty('Nie ma nowych zgłoszeń.')
              )}
              {closedReports.length ? (
                <div className={css.closedBlock}>
                  <button type="button" className={css.linkButton} onClick={() => setShowClosed(v => !v)}>
                    {showClosed ? 'Ukryj zamknięte' : `Pokaż zamknięte (${closedReports.length})`}
                  </button>
                  {showClosed ? (
                    <ul className={css.list}>
                      {closedReports.map(item => (
                        <ReportCard key={`${item.reporterId}-${item.id}`} item={item} onChanged={load} openImage={openImage} />
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : tab === 'spory' ? (
            <DisputesTab onCount={setDisputeCount} />
          ) : tab === 'odwolania' ? (
            <>
              <p className={css.intro}>
                Użytkownik może odwołać się od decyzji moderatora w ciągu 30 dni. Rozpatruje je ktoś
                inny niż autor decyzji, jeśli to możliwe. Uwzględnienie odwołania od ukrycia oferty lub
                blokady konta cofa je automatycznie; w pozostałych przypadkach popraw decyzję ręcznie.
              </p>
              {(data.appeals || []).filter(a => a.status === 'nowe').length ? (
                <ul className={css.list}>
                  {data.appeals
                    .filter(a => a.status === 'nowe')
                    .map(item => (
                      <AppealCard key={`${item.userId}-${item.id}`} item={item} onChanged={load} />
                    ))}
                </ul>
              ) : (
                empty('Nie ma odwołań do rozpatrzenia.')
              )}
              {(data.appeals || []).some(a => a.status !== 'nowe') ? (
                <div className={css.closedBlock}>
                  <button type="button" className={css.linkButton} onClick={() => setShowClosed(v => !v)}>
                    {showClosed
                      ? 'Ukryj rozpatrzone'
                      : `Pokaż rozpatrzone (${data.appeals.filter(a => a.status !== 'nowe').length})`}
                  </button>
                  {showClosed ? (
                    <ul className={css.list}>
                      {data.appeals
                        .filter(a => a.status !== 'nowe')
                        .map(item => (
                          <AppealCard key={`${item.userId}-${item.id}`} item={item} onChanged={load} />
                        ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : data.history.length ? (
            <ul className={css.historyList}>
              {data.history.map(item => (
                <HistoryRow
                  key={`${item.kind}-${item.listing?.id || item.user?.id}-${item.at}`}
                  item={item}
                  onChanged={load}
                />
              ))}
            </ul>
          ) : (
            empty('Historia jest pusta.')
          )}
        </div>
      </LayoutSingleColumn>
      {image ? <Lightbox src={image.src} alt={image.alt} onClose={() => setImage(null)} /> : null}
    </Page>
  );
};

export default ModerationPage;
