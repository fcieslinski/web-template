import React, { useCallback, useEffect, useRef, useState } from 'react';
import classNames from 'classnames';

import { fetchDisputes, disputeAction, fetchReportedConversation } from '../../util/api';
import { detectChatRisks } from '../../util/refumeChatSafety';
import { NamedLink } from '../../components';

import css from './ModerationDisputes.module.css';

// ---------- Helpers ----------

const formatPrice = price =>
  price?.amount != null
    ? `${(price.amount / 100).toFixed(2).replace('.', ',')} ${price.currency === 'PLN' ? 'zł' : price.currency}`
    : '';
const formatTime = iso => {
  try {
    return new Date(iso).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    return '';
  }
};
const formatDay = iso => {
  try {
    const d = new Date(iso);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return 'Dzisiaj';
    if (new Date(today.getTime() - 864e5).toDateString() === d.toDateString()) return 'Wczoraj';
    return d.toLocaleDateString('pl-PL', { weekday: 'short', day: 'numeric', month: 'long' });
  } catch (e) {
    return '';
  }
};
const daysSince = iso => {
  const ms = Date.now() - new Date(iso).getTime();
  if (!iso || Number.isNaN(ms)) return '';
  const d = Math.floor(ms / 864e5);
  return d <= 0 ? 'dziś' : d === 1 ? '1 dzień temu' : `${d} dni temu`;
};
const errorText = e =>
  e?.status === 403
    ? 'To konto nie ma uprawnień moderatora.'
    : e?.statusText && e?.status === 400
    ? e.statusText
    : 'Coś poszło nie tak. Spróbuj ponownie.';
const initials = name =>
  String(name || '?')
    .split(/\s+/)
    .map(p => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

// ---------- Chat view (also used for reported conversations) ----------

/**
 * Refume: a conversation as a chat for moderators — the buyer on the left, the seller on the
 * right, messages from Zespół Refume in the middle; flagged messages are outlined in red.
 * @param {string} txId
 * @param {Array} [teamMessages] [{ id, at, tresc }]
 * @param {Object} [decision] { wynik, uzasadnienie, at }
 * @param {number} [reloadKey] change to reload
 */
export const ChatView = ({
  txId,
  teamMessages = [],
  privateMessages = [],
  decision = null,
  reloadKey = 0,
  compact = false,
}) => {
  const [state, setState] = useState({ loading: true });
  const boxRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setState(s => ({ ...s, loading: !s.data }));
    fetchReportedConversation(txId)
      .then(r => !cancelled && setState({ data: r?.data }))
      .catch(e => !cancelled && setState({ error: errorText(e) }));
    return () => {
      cancelled = true;
    };
  }, [txId, reloadKey]);

  const messages = state.data?.messages || [];
  const items = [
    ...messages.map(m => ({ kind: m.role === 'kupujący' ? 'buyer' : 'seller', at: m.createdAt, ...m })),
    ...teamMessages.map(m => ({ kind: 'team', id: `team-${m.id}`, at: m.at, content: m.tresc })),
    ...privateMessages.map(m => ({
      kind: 'private',
      id: `private-${m.id}`,
      at: m.at,
      content: m.tresc,
      to: m.do,
    })),
    ...(decision ? [{ kind: 'decision', id: 'decision', at: decision.at, content: decision.uzasadnienie, wynik: decision.wynik }] : []),
  ].sort((a, b) => new Date(a.at) - new Date(b.at));

  useEffect(() => {
    const el = boxRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items.length]);

  if (state.loading) return <p className={css.muted}>Ładowanie rozmowy…</p>;
  if (state.error) return <p className={css.error}>{state.error}</p>;

  const buyer = messages.find(m => m.role === 'kupujący')?.senderName;
  const seller = messages.find(m => m.role !== 'kupujący')?.senderName;
  let lastDay = null;

  return (
    <div className={classNames(css.chat, { [css.chatCompact]: compact })}>
      <div className={css.legend}>
        <span>
          <i className={css.dotBuyer} /> Kupujący{buyer ? `: ${buyer}` : ''}
        </span>
        <span>
          <i className={css.dotSeller} /> Sprzedawca{seller ? `: ${seller}` : ''}
        </span>
        <span>
          <i className={css.dotTeam} /> Zespół Refume
        </span>
        <span>
          <i className={css.dotPrivate} /> Prywatnie (jedna strona)
        </span>
      </div>
      <div className={css.chatScroll} ref={boxRef}>
        {items.length === 0 ? <p className={css.muted}>Brak wiadomości w tej rozmowie.</p> : null}
        {items.map(item => {
          const day = formatDay(item.at);
          const separator = day !== lastDay ? <div className={css.day}>{day}</div> : null;
          lastDay = day;
          if (item.kind === 'private') {
            return (
              <React.Fragment key={item.id}>
                {separator}
                <div className={classNames(css.private, item.to === 'sprzedawca' ? css.privateRight : css.privateLeft)}>
                  <span className={css.teamLabel}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
                      <rect x="5" y="11" width="14" height="10" rx="2"></rect>
                      <path d="M8 11V7a4 4 0 0 1 8 0v4"></path>
                    </svg>{' '}
                    Zespół Refume · tylko dla {item.to === 'sprzedawca' ? 'sprzedawcy' : 'kupującego'} ·{' '}
                    {formatTime(item.at)}
                  </span>
                  <p className={css.text}>{item.content}</p>
                  <span className={css.privateNote}>Wysłane do skrzynki – druga strona tego nie widzi.</span>
                </div>
              </React.Fragment>
            );
          }
          if (item.kind === 'team' || item.kind === 'decision') {
            return (
              <React.Fragment key={item.id}>
                {separator}
                <div className={item.kind === 'decision' ? css.decision : css.team}>
                  <span className={css.teamLabel}>
                    {item.kind === 'decision'
                      ? item.wynik === 'zwrot'
                        ? 'Decyzja: zwrot pieniędzy'
                        : 'Decyzja: wypłata dla sprzedawcy'
                      : 'Zespół Refume'}{' '}
                    · {formatTime(item.at)}
                  </span>
                  <p className={css.text}>{item.content}</p>
                </div>
              </React.Fragment>
            );
          }
          const flagged = detectChatRisks(item.content).any;
          const isBuyer = item.kind === 'buyer';
          return (
            <React.Fragment key={item.id}>
              {separator}
              <div className={classNames(css.line, isBuyer ? css.lineLeft : css.lineRight)}>
                {isBuyer ? (
                  <span className={classNames(css.avatar, css.avatarBuyer)} aria-hidden="true">
                    {initials(item.senderName)}
                  </span>
                ) : null}
                <div className={css.bubbleWrap}>
                  <div
                    className={classNames(css.bubble, isBuyer ? css.bubbleBuyer : css.bubbleSeller, {
                      [css.bubbleFlagged]: flagged,
                    })}
                  >
                    <p className={css.text}>{item.content}</p>
                  </div>
                  <span className={css.meta}>
                    {item.senderName || '—'} · {formatTime(item.at)}
                    {flagged ? <strong className={css.flagNote}> · możliwy kontakt poza Refume</strong> : null}
                  </span>
                </div>
                {!isBuyer ? (
                  <span className={classNames(css.avatar, css.avatarSeller)} aria-hidden="true">
                    {initials(item.senderName)}
                  </span>
                ) : null}
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

// ---------- Disputes ----------

const TEMPLATES = [
  {
    label: 'Prosimy o zdjęcia',
    text:
      'Dzień dobry, zajmujemy się tym zgłoszeniem. Prosimy kupującego o zdjęcia otrzymanej paczki i produktu (z widocznym kodem batch), a sprzedawcę o potwierdzenie nadania. Zdjęcia można dodać tutaj w rozmowie.',
  },
  {
    label: 'Sprawdzamy',
    text: 'Dziękujemy za informacje. Sprawdzamy sprawę i wrócimy z decyzją najpóźniej w ciągu 3 dni roboczych.',
  },
  {
    label: 'Prośba o odesłanie',
    text:
      'Proponujemy rozwiązanie: kupujący odsyła produkt sprzedawcy, a po potwierdzeniu odbioru zwrócimy pieniądze. Prosimy o potwierdzenie w rozmowie.',
  },
];
const DECISION_REASONS = [
  'Produkt zgodny z opisem',
  'Brak dowodów na problem',
  'Produkt niezgodny z opisem',
  'Paczka nie dotarła',
  'Podejrzenie podróbki',
];

const DisputeRow = ({ item, active, onSelect }) => (
  <li>
    <button
      type="button"
      className={classNames(css.row, { [css.rowActive]: active })}
      onClick={() => onSelect(item.id)}
      aria-current={active ? 'true' : undefined}
    >
      {item.listing?.image ? (
        <img src={item.listing.image} alt="" className={css.rowThumb} />
      ) : (
        <span className={css.rowThumb} aria-hidden="true" />
      )}
      <span className={css.rowText}>
        <span className={css.rowTop}>
          <strong className={css.rowTitle}>{item.listing?.title || 'Zamówienie'}</strong>
          <span className={css.rowAge}>{item.open ? daysSince(item.zgloszono) : ''}</span>
        </span>
        <span className={css.rowPeople}>
          {item.customer?.name || '—'} → {item.provider?.name || '—'}
        </span>
        <span className={css.rowBottom}>
          <span className={css.rowAmount}>{formatPrice(item.payinTotal)}</span>
          <span
            className={classNames(
              css.chip,
              item.open
                ? item.spor?.wiadomosci?.length
                  ? css.chipInfo
                  : css.chipDanger
                : css.chipMuted
            )}
          >
            {item.open
              ? item.spor?.wiadomosci?.length
                ? 'W toku'
                : 'Nowy'
              : item.lastTransition === 'transition/mark-received-from-disputed'
              ? 'Dla sprzedawcy'
              : 'Zwrot'}
          </span>
        </span>
      </span>
    </button>
  </li>
);

const DisputeDetail = ({ item, onChanged, onBack }) => {
  const [text, setText] = useState('');
  const [privateTo, setPrivateTo] = useState(null); // null = in the chat, else 'kupujacy' | 'sprzedawca'
  const [decision, setDecision] = useState(null); // 'dla-sprzedawcy' | 'zwrot'
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setText('');
    setPrivateTo(null);
    setDecision(null);
    setReason('');
    setError(null);
    setSent(null);
  }, [item.id]);

  const run = (body, after) => {
    setBusy(true);
    setError(null);
    return disputeAction({ txId: item.id, ...body })
      .then(() => {
        setBusy(false);
        after();
        setReloadKey(k => k + 1);
        onChanged();
      })
      .catch(e => {
        setBusy(false);
        setError(errorText(e));
      });
  };

  const send = () =>
    run(
      privateTo
        ? { action: 'prywatna', do: privateTo, tresc: text.trim() }
        : { action: 'wiadomosc', tresc: text.trim() },
      () => {
        setSent(privateTo ? 'Wysłano prywatnie do skrzynki.' : 'Wysłano do rozmowy.');
        setText('');
      }
    );

  return (
    <section className={css.detail} aria-label="Spór">
      <div className={css.detailHead}>
        {onBack ? (
          <button type="button" className={css.back} onClick={onBack}>
            ← Spory
          </button>
        ) : null}
        <div className={css.headMain}>
          {item.listing?.image ? <img src={item.listing.image} alt="" className={css.headThumb} /> : null}
          <div className={css.headText}>
            {item.listing ? (
              <NamedLink name="ListingPageCanonical" params={{ id: item.listing.id }} className={css.headTitle}>
                {item.listing.title}
              </NamedLink>
            ) : (
              <span className={css.headTitle}>Zamówienie</span>
            )}
            <span className={css.headMeta}>
              Kupujący{' '}
              {item.customer ? (
                <NamedLink name="ModeratorUserPage" params={{ id: item.customer.id }}>
                  {item.customer.name}
                </NamedLink>
              ) : '—'}{' '}
              · Sprzedawca{' '}
              {item.provider ? (
                <NamedLink name="ModeratorUserPage" params={{ id: item.provider.id }}>
                  {item.provider.name}
                </NamedLink>
              ) : '—'}
            </span>
            <span className={css.headMeta}>
              Zapłacono {formatPrice(item.payinTotal)} · wypłata {formatPrice(item.payoutTotal)}
              {item.bundle ? ` · zestaw (${item.bundle + 1} rzeczy)` : ''} · zgłoszono{' '}
              {daysSince(item.zgloszono)}
            </span>
          </div>
        </div>
        <div className={css.problem}>
          <span className={css.problemLabel}>Problem zgłoszony przez kupującego</span>
          <p className={css.text}>{item.powod || '(bez opisu)'}</p>
        </div>
      </div>

      <ChatView
        txId={item.id}
        teamMessages={item.spor?.wiadomosci || []}
        privateMessages={item.prywatne || []}
        decision={item.spor?.decyzja || null}
        reloadKey={reloadKey}
      />

      {item.open ? (
        <div className={css.composer}>
          <div className={css.composerTabs} role="tablist" aria-label="Komu wysłać">
            {[
              [null, 'Do rozmowy (obie strony)'],
              ['kupujacy', 'Prywatnie: kupujący'],
              ['sprzedawca', 'Prywatnie: sprzedawca'],
            ].map(([key, label]) => (
              <button
                key={label}
                type="button"
                role="tab"
                aria-selected={privateTo === key}
                className={classNames(css.composerTab, { [css.composerTabActive]: privateTo === key })}
                onClick={() => setPrivateTo(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className={css.templates}>
            {TEMPLATES.map(t => (
              <button key={t.label} type="button" className={css.template} onClick={() => setText(t.text)}>
                {t.label}
              </button>
            ))}
          </div>
          <div className={css.inputRow}>
            <label htmlFor={`dispute-msg-${item.id}`} className={css.srOnly}>
              Wiadomość
            </label>
            <textarea
              id={`dispute-msg-${item.id}`}
              className={css.input}
              rows={2}
              maxLength={1500}
              placeholder={
                privateTo
                  ? `Wiadomość do skrzynki ${privateTo === 'kupujacy' ? 'kupującego' : 'sprzedawcy'}…`
                  : 'Napisz jako Zespół Refume – zobaczą to obie strony…'
              }
              value={text}
              onChange={e => {
                setText(e.target.value);
                setSent(null);
              }}
            />
            <button type="button" className={css.send} disabled={busy || !text.trim()} onClick={send}>
              Wyślij
            </button>
          </div>
          {sent ? <p className={css.ok}>{sent}</p> : null}

          {decision ? (
            <div className={classNames(css.decisionBox, decision === 'zwrot' ? css.decisionRefund : css.decisionSeller)}>
              <strong>
                {decision === 'zwrot'
                  ? `Zwrot ${formatPrice(item.payinTotal)} dla kupującego i anulowanie zamówienia`
                  : `Zamknięcie zgłoszenia – sprzedawca dostaje ${formatPrice(item.payoutTotal)}`}
              </strong>
              <span className={css.small}>Uzasadnienie zobaczą obie strony. Tego nie da się cofnąć.</span>
              <div className={css.templates}>
                {DECISION_REASONS.map(r => (
                  <button key={r} type="button" className={css.template} onClick={() => setReason(r)}>
                    {r}
                  </button>
                ))}
              </div>
              <textarea
                className={css.input}
                rows={2}
                maxLength={1500}
                value={reason}
                placeholder="Uzasadnienie decyzji"
                onChange={e => setReason(e.target.value)}
              />
              <div className={css.decisionActions}>
                <button
                  type="button"
                  className={decision === 'zwrot' ? css.dangerBtn : css.darkBtn}
                  disabled={busy || !reason.trim()}
                  onClick={() => run({ action: decision, tresc: reason.trim() }, () => setDecision(null))}
                >
                  Zatwierdź decyzję
                </button>
                <button type="button" className={css.ghostBtn} disabled={busy} onClick={() => setDecision(null)}>
                  Anuluj
                </button>
              </div>
            </div>
          ) : (
            <div className={css.decisionBar}>
              <span className={css.small}>Decyzja:</span>
              <button type="button" className={css.ghostBtn} onClick={() => setDecision('dla-sprzedawcy')}>
                Zamknij dla sprzedawcy
              </button>
              <button type="button" className={css.dangerOutline} onClick={() => setDecision('zwrot')}>
                Zwróć pieniądze kupującemu
              </button>
            </div>
          )}
          {error ? (
            <p className={css.error} role="alert">
              {error}
            </p>
          ) : null}
        </div>
      ) : (
        <p className={css.closedNote}>Spór jest zamknięty.</p>
      )}
    </section>
  );
};

/** Refume: "Spory" tab — list on the left, the selected dispute as a chat on the right. */
export const DisputesTab = ({ onCount }) => {
  const [state, setState] = useState({ loading: true });
  const [filter, setFilter] = useState('open');
  const [selectedId, setSelectedId] = useState(null);
  const [mobileDetail, setMobileDetail] = useState(false);

  const load = useCallback(
    () =>
      fetchDisputes()
        .then(r => {
          setState({ data: r?.data });
          if (onCount) onCount(r?.data?.open?.length || 0);
        })
        .catch(e => setState({ error: errorText(e) })),
    []
  );
  useEffect(() => {
    load();
  }, [load]);

  if (state.loading) return <p className={css.muted}>Ładowanie sporów…</p>;
  if (state.error) return <p className={css.error}>{state.error}</p>;

  const { open = [], closed = [] } = state.data || {};
  const list = filter === 'open' ? open : closed;
  const selected = list.find(i => i.id === selectedId) || list[0] || null;

  return (
    <div className={classNames(css.layout, { [css.showDetail]: mobileDetail })}>
      <aside className={css.listPane}>
        <div className={css.filters} role="tablist" aria-label="Spory">
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'open'}
            className={classNames(css.filter, { [css.filterActive]: filter === 'open' })}
            onClick={() => setFilter('open')}
          >
            Otwarte <span className={css.count}>{open.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'closed'}
            className={classNames(css.filter, { [css.filterActive]: filter === 'closed' })}
            onClick={() => setFilter('closed')}
          >
            Zamknięte <span className={css.count}>{closed.length}</span>
          </button>
        </div>
        {list.length ? (
          <ul className={css.list}>
            {list.map(item => (
              <DisputeRow
                key={item.id}
                item={item}
                active={selected?.id === item.id}
                onSelect={id => {
                  setSelectedId(id);
                  setMobileDetail(true);
                }}
              />
            ))}
          </ul>
        ) : (
          <p className={css.empty}>{filter === 'open' ? 'Nie ma otwartych sporów.' : 'Brak zamkniętych sporów.'}</p>
        )}
        <p className={css.help}>
          Pieniądze są wstrzymane do decyzji. Bez decyzji po 60 dniach Sharetribe zwraca je kupującemu.
        </p>
      </aside>
      {selected ? (
        <DisputeDetail item={selected} onChanged={load} onBack={() => setMobileDetail(false)} />
      ) : (
        <div className={css.placeholder}>Wybierz spór z listy.</div>
      )}
    </div>
  );
};
