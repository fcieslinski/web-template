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
  fetchReportedConversation,
  moderateChatFlag,
  setUserBadgesAsModerator,
} from '../../util/api';
import { detectChatRisks } from '../../util/refumeChatSafety';
import { Page, LayoutSingleColumn, NamedLink } from '../../components';
import TopbarContainer from '../TopbarContainer/TopbarContainer';
import FooterContainer from '../FooterContainer/FooterContainer';

import css from './ModerationPage.module.css';

// ---------- Helpers ----------

const formatDate = iso => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('pl-PL', { dateStyle: 'medium', timeStyle: 'short' });
  } catch (e) {
    return iso;
  }
};

const formatPrice = price =>
  price?.amount != null
    ? `${(price.amount / 100).toFixed(2).replace('.', ',')} ${price.currency === 'PLN' ? 'zł' : price.currency}`
    : '';

const errorMessage = e =>
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
const BLOCK_REASONS = [
  'Sprzedaż podróbek',
  'Próba oszustwa',
  'Obraźliwe zachowanie',
  'Wielokrotne łamanie zasad',
];

const TABS = [
  { key: 'dowody', label: 'Dowody zakupu' },
  { key: 'oferty', label: 'Nowe oferty' },
  { key: 'zgloszenia', label: 'Zgłoszenia' },
  { key: 'historia', label: 'Historia' },
];

// ---------- Small building blocks ----------

const Lightbox = ({ src, alt, onClose }) => {
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
const ReasonForm = ({ id, label, presets, confirmLabel, danger, busy, onConfirm, onCancel }) => {
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

const useAction = onDone => {
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

const ErrorLine = ({ error }) =>
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
        <NamedLink name="ProfilePage" params={{ id: listing.author.id }}>
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

// ---------- Reports ----------

const Conversation = ({ txId }) => {
  const [state, setState] = useState({ loading: true });
  useEffect(() => {
    let cancelled = false;
    fetchReportedConversation(txId)
      .then(r => !cancelled && setState({ data: r?.data }))
      .catch(e => !cancelled && setState({ error: errorMessage(e) }));
    return () => {
      cancelled = true;
    };
  }, [txId]);
  if (state.loading) return <p className={css.muted}>Ładowanie rozmowy…</p>;
  if (state.error) return <ErrorLine error={state.error} />;
  const messages = state.data?.messages || [];
  return (
    <div className={css.conversation}>
      <p className={css.metaSmall}>
        {state.data?.listingTitle ? `Oferta: ${state.data.listingTitle} · ` : ''}
        {messages.length} wiadomości. Wiadomości z ostrzeżeniem są podświetlone.
      </p>
      <ol className={css.messages}>
        {messages.map(m => {
          const flagged = detectChatRisks(m.content).any;
          return (
            <li key={m.id} className={classNames(css.chatMessage, { [css.chatFlagged]: flagged })}>
              <span className={css.chatMeta}>
                <strong>{m.senderName || '—'}</strong> ({m.role}) · {formatDate(m.createdAt)}
              </span>
              <span className={css.chatText}>{m.content}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
};

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
          <NamedLink name="ProfilePage" params={{ id: item.reporterId }}>
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
                  <NamedLink name="ProfilePage" params={{ id: item.celUzytkownikId }}>
                    zobacz profil
                  </NamedLink>
                </p>
              ) : null}
              <button type="button" className={css.linkButton} onClick={() => setShowChat(v => !v)}>
                {showChat ? 'Ukryj rozmowę' : 'Pokaż rozmowę'}
              </button>
            </>
          ) : (
            <NamedLink name="ProfilePage" params={{ id: item.celId }} className={css.listingTitle}>
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
          <NamedLink name="ProfilePage" params={{ id: item.senderId }}>
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
          <NamedLink name="ProfilePage" params={{ id: item.user.id }} className={css.historyTitle}>
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

  const load = useCallback(() => {
    setError(null);
    return fetchModerationPanel()
      .then(r => setData(r?.data || null))
      .catch(e => setError(errorMessage(e)));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openImage = (src, alt) => setImage({ src, alt });
  const setTab = key => history.replace({ search: key === 'dowody' ? '' : `?tab=${key}` });

  const openReports = (data?.reports || []).filter(r => r.status === 'nowe');
  const openFlags = (data?.chatFlags || []).filter(f => f.status === 'nowe');
  const closedReports = (data?.reports || []).filter(r => r.status !== 'nowe');
  const counts = {
    dowody: data?.proofs?.length || 0,
    oferty: data?.newListings?.length || 0,
    zgloszenia: openReports.length + openFlags.length,
    historia: null,
  };

  const empty = text => <p className={css.empty}>{text}</p>;

  return (
    <Page title="Panel moderatora" scrollingDisabled={!!image}>
      <LayoutSingleColumn topbar={<TopbarContainer />} footer={<FooterContainer />}>
        <div className={css.root}>
          <div className={css.header}>
            <h1 className={css.title}>Panel moderatora</h1>
            <button type="button" className={css.secondaryButton} onClick={load}>
              Odśwież
            </button>
          </div>

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
