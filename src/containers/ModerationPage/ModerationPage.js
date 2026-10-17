import React, { useEffect, useState } from 'react';

import { fetchPendingProofs, decideProof } from '../../util/api';
import { Page, LayoutSingleColumn, NamedLink, H3 } from '../../components';
import TopbarContainer from '../TopbarContainer/TopbarContainer';
import FooterContainer from '../FooterContainer/FooterContainer';

import css from './ModerationPage.module.css';

const formatDate = iso => {
  try {
    return new Date(iso).toLocaleString('pl-PL', { dateStyle: 'medium', timeStyle: 'short' });
  } catch (e) {
    return iso || '';
  }
};

const errorMessage = e =>
  e?.status === 401
    ? 'Zaloguj się na konto moderatora.'
    : e?.status === 403
    ? 'To konto nie ma uprawnień moderatora.'
    : e?.status === 500 && /Integration API/.test(e?.statusText || '')
    ? 'Brakuje kluczy Integration API na serwerze (plik .env).'
    : 'Coś poszło nie tak. Odśwież stronę i spróbuj ponownie.';

const ProofCard = props => {
  const { item, onDecided } = props;
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [inProgress, setInProgress] = useState(false);
  const [error, setError] = useState(null);

  const send = (decision, reasonText) => {
    setInProgress(true);
    setError(null);
    decideProof({ listingId: item.id, decision, reason: reasonText })
      .then(() => onDecided(item.id))
      .catch(e => {
        setError(errorMessage(e));
        setInProgress(false);
      });
  };

  const reasonId = `reason-${item.id}`;

  return (
    <li className={css.card}>
      <a href={item.proofUrl} target="_blank" rel="noopener noreferrer" className={css.proofLink}>
        <img src={item.proofUrl} alt={`Dowód zakupu: ${item.title}`} className={css.proofImage} />
      </a>
      <div className={css.cardBody}>
        <NamedLink
          name="ListingPageCanonical"
          params={{ id: item.id }}
          className={css.listingTitle}
        >
          {item.title}
        </NamedLink>
        <p className={css.meta}>
          Sprzedawca: {item.author || '—'} · wysłano {formatDate(item.uploadedAt)}
        </p>
        {item.previousStatus === 'odrzucono' ? (
          <p className={css.previous}>
            Wysłane ponownie. Poprzedni powód odrzucenia: {item.previousReason || '—'}
          </p>
        ) : null}

        {rejecting ? (
          <div className={css.rejectBox}>
            <label htmlFor={reasonId} className={css.label}>
              Powód odrzucenia (zobaczy go sprzedawca)
            </label>
            <textarea
              id={reasonId}
              className={css.textarea}
              value={reason}
              maxLength={500}
              rows={3}
              onChange={e => setReason(e.target.value)}
              placeholder="np. Zdjęcie jest nieczytelne, nie widać nazwy produktu ani daty."
            />
            <div className={css.actions}>
              <button
                type="button"
                className={css.rejectButton}
                disabled={inProgress || !reason.trim()}
                onClick={() => send('reject', reason)}
              >
                Odrzuć z tym powodem
              </button>
              <button
                type="button"
                className={css.secondaryButton}
                disabled={inProgress}
                onClick={() => setRejecting(false)}
              >
                Anuluj
              </button>
            </div>
          </div>
        ) : (
          <div className={css.actions}>
            <button
              type="button"
              className={css.approveButton}
              disabled={inProgress}
              onClick={() => send('approve')}
            >
              Zatwierdź
            </button>
            <button
              type="button"
              className={css.secondaryButton}
              disabled={inProgress}
              onClick={() => setRejecting(true)}
            >
              Odrzuć…
            </button>
          </div>
        )}
        {error ? (
          <p className={css.error} role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </li>
  );
};

/**
 * Refume: moderators review proof-of-purchase photos here (route /moderacja).
 * Access is checked on the server (REFUME_MODERATOR_USER_IDS).
 */
const ModerationPage = () => {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);

  const load = () => {
    setError(null);
    setItems(null);
    fetchPendingProofs()
      .then(response => setItems(response?.data || []))
      .catch(e => setError(errorMessage(e)));
  };

  useEffect(() => {
    load();
  }, []);

  const handleDecided = listingId => {
    setItems(current => (current || []).filter(i => i.id !== listingId));
  };

  return (
    <Page title="Moderacja – dowody zakupu" scrollingDisabled={false}>
      <LayoutSingleColumn topbar={<TopbarContainer />} footer={<FooterContainer />}>
        <div className={css.root}>
          <div className={css.header}>
            <H3 as="h1" className={css.title}>
              Dowody zakupu do sprawdzenia
            </H3>
            <button type="button" className={css.secondaryButton} onClick={load}>
              Odśwież
            </button>
          </div>

          {error ? (
            <p className={css.error} role="alert">
              {error}
            </p>
          ) : items === null ? (
            <p className={css.muted}>Ładowanie…</p>
          ) : items.length === 0 ? (
            <p className={css.muted}>Nie ma nic do sprawdzenia.</p>
          ) : (
            <ul className={css.list}>
              {items.map(item => (
                <ProofCard key={item.id} item={item} onDecided={handleDecided} />
              ))}
            </ul>
          )}
        </div>
      </LayoutSingleColumn>
    </Page>
  );
};

export default ModerationPage;
