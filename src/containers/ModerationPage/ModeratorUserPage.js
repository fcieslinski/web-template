import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import classNames from 'classnames';

import { fetchUserCard, sendTeamMessage, saveModeratorNote, moderateUser } from '../../util/api';
import { Page, LayoutSingleColumn, NamedLink } from '../../components';
import ModeratorBadgeControls from '../../components/SellerBadges/ModeratorBadgeControls';
import TopbarContainer from '../TopbarContainer/TopbarContainer';
import FooterContainer from '../FooterContainer/FooterContainer';
import ModerationSearch from './ModerationSearch';
import {
  formatDate,
  formatPrice,
  errorMessage,
  BLOCK_REASONS,
  ReasonForm,
  useAction,
  ErrorLine,
  AppealCard,
} from './ModerationPage';
import { TEAM_MESSAGE_TEMPLATES, fillTemplate } from './teamMessageTemplates';

import mcss from './ModerationPage.module.css';
import css from './ModeratorUserPage.module.css';

const TX_STATES = {
  'transition/inquire': 'Zapytanie',
  'transition/request-payment': 'Czeka na płatność',
  'transition/request-payment-after-inquiry': 'Czeka na płatność',
  'transition/confirm-payment': 'Opłacone – do wysłania',
  'transition/expire-payment': 'Płatność wygasła',
  'transition/mark-delivered': 'Wysłane / dostarczone',
  'transition/operator-mark-delivered': 'Dostarczone',
  'transition/mark-received-from-purchased': 'Odebrane',
  'transition/mark-received': 'Odebrane',
  'transition/auto-mark-received': 'Odebrane',
  'transition/cancel': 'Anulowane',
  'transition/auto-cancel': 'Anulowane',
  'transition/dispute': 'Spór',
  'transition/operator-dispute': 'Spór',
  'transition/cancel-from-disputed': 'Anulowane po sporze',
  'transition/auto-cancel-from-disputed': 'Anulowane po sporze',
  'transition/mark-received-from-disputed': 'Odebrane po sporze',
  'transition/auto-complete': 'Zakończone',
};
const txState = t => TX_STATES[t] || (/review/.test(t || '') ? 'Zakończone (opinie)' : 'W toku');

const Section = ({ title, count, children }) => (
  <section className={css.section}>
    <h2 className={css.sectionTitle}>
      {title}
      {count != null ? <span className={css.count}>{count}</span> : null}
    </h2>
    {children}
  </section>
);

const MessageForm = ({ userId, listings, onSent }) => {
  const [templateKey, setTemplateKey] = useState(null);
  const [listingId, setListingId] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sent, setSent] = useState(false);
  const { busy, error, run } = useAction(onSent);
  const listingTitle = listings.find(l => l.id === listingId)?.title || '';

  const pick = t => {
    setTemplateKey(t.key);
    setSent(false);
    setTitle(t.title);
    setBody(fillTemplate(t.body, listingTitle));
  };
  const pickListing = id => {
    setListingId(id);
    const t = TEAM_MESSAGE_TEMPLATES.find(x => x.key === templateKey);
    if (t?.body) setBody(fillTemplate(t.body, listings.find(l => l.id === id)?.title || ''));
  };

  return (
    <div className={css.messageForm}>
      <div className={mcss.chips}>
        {TEAM_MESSAGE_TEMPLATES.map(t => (
          <button
            key={t.key}
            type="button"
            className={classNames(mcss.chip, { [mcss.chipActive]: templateKey === t.key })}
            onClick={() => pick(t)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {listings.length ? (
        <label className={css.field}>
          <span className={mcss.label}>Dotyczy oferty (opcjonalnie)</span>
          <select value={listingId} onChange={e => pickListing(e.target.value)} className={css.select}>
            <option value="">— żadnej —</option>
            {listings.map(l => (
              <option key={l.id} value={l.id}>
                {l.title}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className={css.field}>
        <span className={mcss.label}>Tytuł</span>
        <input
          className={css.input}
          value={title}
          maxLength={120}
          onChange={e => setTitle(e.target.value)}
        />
      </label>
      <label className={css.field}>
        <span className={mcss.label}>Wiadomość</span>
        <textarea
          className={mcss.textarea}
          rows={5}
          value={body}
          maxLength={2000}
          onChange={e => setBody(e.target.value)}
        />
      </label>
      <p className={mcss.metaSmall}>
        Użytkownik zobaczy ją w skrzynce jako wiadomość od „Zespołu Refume”.
      </p>
      <div className={mcss.actions}>
        <button
          type="button"
          className={mcss.primaryButton}
          disabled={busy || !title.trim() || !body.trim()}
          onClick={() =>
            run(
              () =>
                sendTeamMessage({
                  userId,
                  title: title.trim(),
                  body: body.trim(),
                  ...(listingId ? { listingId } : {}),
                }),
              () => {
                setSent(true);
                setTitle('');
                setBody('');
                setTemplateKey(null);
              }
            )
          }
        >
          Wyślij jako Zespół Refume
        </button>
        {sent ? <span className={css.ok}>Wysłano ✓</span> : null}
      </div>
      <ErrorLine error={error} />
    </div>
  );
};

const NoteForm = ({ userId, onSaved }) => {
  const [text, setText] = useState('');
  const { busy, error, run } = useAction(onSaved);
  return (
    <div className={css.noteForm}>
      <textarea
        className={mcss.textarea}
        rows={2}
        value={text}
        maxLength={1000}
        placeholder="Notatka widoczna tylko dla moderatorów"
        onChange={e => setText(e.target.value)}
      />
      <div className={mcss.actions}>
        <button
          type="button"
          className={mcss.secondaryButton}
          disabled={busy || !text.trim()}
          onClick={() => run(() => saveModeratorNote({ userId, text: text.trim() }), () => setText(''))}
        >
          Dodaj notatkę
        </button>
      </div>
      <ErrorLine error={error} />
    </div>
  );
};

const BlockControl = ({ user, onChanged }) => {
  const [open, setOpen] = useState(false);
  const { busy, error, run } = useAction(onChanged);
  if (user.isModerator) return null;
  return (
    <div>
      {user.blocked ? (
        <button
          type="button"
          className={mcss.secondaryButton}
          disabled={busy}
          onClick={() => run(() => moderateUser({ userId: user.id, action: 'odblokuj' }))}
        >
          Odblokuj konto
        </button>
      ) : open ? (
        <ReasonForm
          id="block-reason"
          label={`Zablokować konto ${user.name}? Wszystkie jego oferty zostaną ukryte.`}
          presets={BLOCK_REASONS}
          confirmLabel="Zablokuj"
          danger
          busy={busy}
          onConfirm={reason => run(() => moderateUser({ userId: user.id, action: 'zablokuj', reason }), () => setOpen(false))}
          onCancel={() => setOpen(false)}
        />
      ) : (
        <button type="button" className={mcss.dangerButton} onClick={() => setOpen(true)}>
          Zablokuj konto
        </button>
      )}
      <ErrorLine error={error} />
    </div>
  );
};

const ReportRow = ({ r, by }) => (
  <li className={css.row}>
    <span className={r.status === 'nowe' ? mcss.pillWarning : mcss.pill}>
      {r.status === 'nowe' ? 'Nowe' : r.status === 'rozpatrzone' ? 'Rozpatrzone' : 'Odrzucone'}
    </span>
    <div className={css.rowBody}>
      <span>
        <strong>{r.powodEtykieta || r.powod}</strong> · {r.celNazwa}
      </span>
      <span className={mcss.metaSmall}>
        {by ? 'Zgłoszone przez tę osobę' : (
          <>
            zgłosił(a){' '}
            <NamedLink name="ModeratorUserPage" params={{ id: r.reporterId }}>
              {r.reporterName || '—'}
            </NamedLink>
          </>
        )}{' '}
        · {formatDate(r.utworzono)}
        {r.opis ? ` · „${r.opis}”` : ''}
      </span>
    </div>
  </li>
);

/**
 * Refume: user card for moderators (route /moderacja/uzytkownik/:id) — account, listings,
 * orders, reports, chat flags, appeals, decisions, notes, and actions.
 */
const ModeratorUserPage = () => {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setError(null);
    return fetchUserCard(id)
      .then(r => setData(r?.data || null))
      .catch(e => setError(errorMessage(e)));
  }, [id]);

  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  const user = data?.user;
  const sales = (data?.transactions || []).filter(t => t.role === 'provider');
  const purchases = (data?.transactions || []).filter(t => t.role === 'customer');
  const problems = (data?.transactions || []).filter(t => t.problem).length;

  return (
    <Page title="Karta użytkownika – moderator" scrollingDisabled={false}>
      <LayoutSingleColumn topbar={<TopbarContainer />} footer={<FooterContainer />}>
        <div className={css.root}>
          <NamedLink name="ModerationPage" className={css.back}>
            ← Panel moderatora
          </NamedLink>
          <ModerationSearch />

          {error ? (
            <p className={mcss.error} role="alert">
              {error}
            </p>
          ) : !data ? (
            <p className={mcss.muted}>Ładowanie…</p>
          ) : (
            <>
              <header className={css.head}>
                <span className={css.avatar} aria-hidden="true">
                  {(user.name || '?').slice(0, 1).toUpperCase()}
                </span>
                <div className={css.headText}>
                  <h1 className={css.title}>
                    {user.name || 'Użytkownik'}
                    {user.blocked ? <span className={mcss.pillDanger}>zablokowany</span> : null}
                    {user.isModerator ? <span className={mcss.pill}>moderator</span> : null}
                    {user.banned ? <span className={mcss.pillDanger}>zbanowany w Console</span> : null}
                  </h1>
                  <p className={mcss.meta}>
                    {`${user.firstName} ${user.lastName}`.trim()} · {user.email}
                    {user.emailVerified ? '' : ' (niepotwierdzony)'}
                  </p>
                  <p className={mcss.metaSmall}>
                    Konto od {formatDate(user.createdAt)} · ID {user.id} ·{' '}
                    <NamedLink name="ProfilePage" params={{ id: user.id }}>
                      Profil publiczny
                    </NamedLink>
                  </p>
                  {user.blocked ? (
                    <p className={css.blockedInfo}>
                      Zablokowany {formatDate(user.blocked.od)}. Powód: {user.blocked.powod}
                    </p>
                  ) : null}
                </div>
              </header>

              <div className={css.stats}>
                <div>
                  <strong>{data.listings.filter(l => l.state === 'published').length}</strong>
                  <span>aktywnych ofert</span>
                </div>
                <div>
                  <strong>{sales.length}</strong>
                  <span>sprzedaży</span>
                </div>
                <div>
                  <strong>{purchases.length}</strong>
                  <span>zakupów</span>
                </div>
                <div className={problems ? css.statWarn : null}>
                  <strong>{problems}</strong>
                  <span>sporów / anulowań</span>
                </div>
                <div className={data.reportsAgainst.length ? css.statWarn : null}>
                  <strong>{data.reportsAgainst.length}</strong>
                  <span>zgłoszeń na</span>
                </div>
                <div className={data.chatFlags.length ? css.statWarn : null}>
                  <strong>{data.chatFlags.length}</strong>
                  <span>flag z czatu</span>
                </div>
              </div>

              <Section title="Działania">
                <div className={css.actionsGrid}>
                  <BlockControl user={user} onChanged={load} />
                  <ModeratorBadgeControls userId={user.id} />
                </div>
              </Section>

              <Section title="Wiadomość od Zespołu Refume">
                <MessageForm userId={user.id} listings={data.listings} onSent={load} />
              </Section>

              {data.appeals.length ? (
                <Section title="Odwołania" count={data.appeals.length}>
                  <ul className={mcss.list}>
                    {data.appeals.map(a => (
                      <AppealCard key={a.id} item={a} userId={user.id} hideUser onChanged={load} />
                    ))}
                  </ul>
                </Section>
              ) : null}

              <Section title="Oferty" count={data.listings.length}>
                {data.listings.length ? (
                  <ul className={css.rows}>
                    {data.listings.map(l => (
                      <li key={l.id} className={css.row}>
                        {l.image ? (
                          <img src={l.image} alt="" className={css.thumb} loading="lazy" />
                        ) : (
                          <span className={css.thumb} />
                        )}
                        <div className={css.rowBody}>
                          <NamedLink name="ListingPageCanonical" params={{ id: l.id }}>
                            {l.title}
                          </NamedLink>
                          <span className={mcss.metaSmall}>
                            {formatPrice(l.price)} · {formatDate(l.createdAt)} ·{' '}
                            {l.ukryta ? 'ukryta przez moderatora' : l.state === 'published' ? 'aktywna' : l.state === 'closed' ? 'zamknięta' : l.state}
                            {l.weryfikacja === 'zweryfikowano' ? ' · zweryfikowana' : ''}
                            {l.waitingForProof ? ' · dowód czeka na sprawdzenie' : ''}
                          </span>
                        </div>
                        <NamedLink name="ModeratorListingEditPage" params={{ id: l.id }} className={mcss.editLink}>
                          Edytuj
                        </NamedLink>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={mcss.muted}>Brak ofert.</p>
                )}
              </Section>

              <Section title="Zamówienia" count={data.transactions.length}>
                {data.transactions.length ? (
                  <ul className={css.rows}>
                    {data.transactions.map(t => (
                      <li key={t.id} className={css.row}>
                        <span className={t.problem ? mcss.pillDanger : mcss.pill}>
                          {t.role === 'provider' ? 'Sprzedaż' : 'Zakup'}
                        </span>
                        <div className={css.rowBody}>
                          <span>
                            {t.listing?.title || 'Oferta'} · {txState(t.lastTransition)}
                            {t.problem === 'spor' ? ' · był spór' : ''}
                          </span>
                          <span className={mcss.metaSmall}>
                            {t.role === 'provider' ? 'Kupujący' : 'Sprzedawca'}:{' '}
                            {t.other ? (
                              <NamedLink name="ModeratorUserPage" params={{ id: t.other.id }}>
                                {t.other.name || '—'}
                              </NamedLink>
                            ) : (
                              '—'
                            )}{' '}
                            · {formatPrice(t.payinTotal)} · {formatDate(t.lastTransitionedAt || t.createdAt)}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={mcss.muted}>Brak zamówień.</p>
                )}
              </Section>

              <Section title="Zgłoszenia na tę osobę" count={data.reportsAgainst.length}>
                {data.reportsAgainst.length ? (
                  <ul className={css.rows}>
                    {data.reportsAgainst.map(r => (
                      <ReportRow key={`${r.reporterId}-${r.id}`} r={r} />
                    ))}
                  </ul>
                ) : (
                  <p className={mcss.muted}>Brak.</p>
                )}
              </Section>

              {data.reportsBy.length ? (
                <Section title="Zgłoszenia wysłane przez tę osobę" count={data.reportsBy.length}>
                  <ul className={css.rows}>
                    {data.reportsBy.map(r => (
                      <ReportRow key={r.id} r={r} by />
                    ))}
                  </ul>
                </Section>
              ) : null}

              {data.chatFlags.length ? (
                <Section title="Wykryte w czacie" count={data.chatFlags.length}>
                  <ul className={css.rows}>
                    {data.chatFlags.map(f => (
                      <li key={f.id} className={css.row}>
                        <span className={f.status === 'nowe' ? mcss.pillWarning : mcss.pill}>
                          {f.status === 'nowe' ? 'Nowe' : f.status === 'ostrzezono' ? 'Ostrzeżono' : f.status === 'zablokowano' ? 'Blokada' : 'OK'}
                        </span>
                        <div className={css.rowBody}>
                          <span>{f.typy.join(', ')}{f.listingTitle ? ` · „${f.listingTitle}”` : ''}</span>
                          <span className={mcss.metaSmall}>{formatDate(f.wyslano || f.utworzono)}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </Section>
              ) : null}

              <Section title="Decyzje i wiadomości od Refume" count={data.notifications.length}>
                {data.notifications.length ? (
                  <ul className={css.rows}>
                    {data.notifications.map(n => (
                      <li key={n.id} className={css.row}>
                        <div className={css.rowBody}>
                          <strong>{n.title}</strong>
                          <span className={css.notificationBody}>{n.body}</span>
                          <span className={mcss.metaSmall}>
                            {formatDate(n.createdAt)}
                            {n.read ? ' · przeczytane' : ' · nieprzeczytane'}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={mcss.muted}>Brak.</p>
                )}
              </Section>

              <Section title="Notatki moderatorów" count={data.notes.length}>
                <NoteForm userId={user.id} onSaved={load} />
                {data.notes.length ? (
                  <ul className={css.rows}>
                    {data.notes.map(n => (
                      <li key={n.id} className={css.row}>
                        <span className={mcss.pill}>
                          {n.typ === 'wiadomosc' ? 'Wiadomość' : n.typ === 'odwolanie' ? 'Odwołanie' : 'Notatka'}
                        </span>
                        <div className={css.rowBody}>
                          <span className={css.notificationBody}>{n.tekst}</span>
                          <span className={mcss.metaSmall}>{formatDate(n.utworzono)}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </Section>
            </>
          )}
        </div>
      </LayoutSingleColumn>
    </Page>
  );
};

export default ModeratorUserPage;
