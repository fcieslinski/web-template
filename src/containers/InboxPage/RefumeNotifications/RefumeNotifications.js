import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import classNames from 'classnames';

import { NamedLink } from '../../../components';
import {
  getNotifications,
  getUnreadCount,
  markNotificationsRead,
} from '../../../ducks/refumeNotifications';
import { fetchCurrentUser } from '../../../ducks/user.duck';
import { createAppeal } from '../../../util/api';
import { timeAgoPl } from '../../../util/refumeTimeAgo';

import css from './RefumeNotifications.module.css';

const TeamAvatar = ({ small }) => (
  <span className={classNames(css.avatar, { [css.avatarSmall]: small })} aria-hidden="true">
    R
  </span>
);

// Decisions a user can appeal against (checked again on the server)
const APPEALABLE = [
  'dowod-odrzucony',
  'oferta-ukryta',
  'konto-zablokowane',
  'znacznik-odebrany',
  'ostrzezenie-czat',
  'oferta-edytowana',
  'odznaki-zmienione',
];
const APPEAL_DAYS = 30;
const APPEAL_STATUS = {
  nowe: 'Odwołanie wysłane – czeka na rozpatrzenie.',
  uwzglednione: 'Odwołanie uwzględnione.',
  odrzucone: 'Odwołanie rozpatrzone – decyzja utrzymana.',
};

const AppealBox = ({ notification, appeal }) => {
  const dispatch = useDispatch();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (appeal) {
    return <p className={css.appealStatus}>{APPEAL_STATUS[appeal.status] || APPEAL_STATUS.nowe}</p>;
  }
  const tooOld =
    Date.now() - new Date(notification.createdAt).getTime() > APPEAL_DAYS * 24 * 3600 * 1000;
  if (tooOld) return null;

  const submit = () => {
    setBusy(true);
    setError(null);
    createAppeal({ notificationId: notification.id, tresc: text.trim() })
      .then(() => dispatch(fetchCurrentUser({ enforce: true })))
      .then(() => setBusy(false))
      .catch(e => {
        setBusy(false);
        setError(
          e?.status === 409
            ? 'Od tej decyzji już się odwołano.'
            : e?.status === 400 && e?.statusText
            ? e.statusText
            : 'Nie udało się wysłać odwołania. Spróbuj ponownie.'
        );
      });
  };

  return open ? (
    <div className={css.appealForm}>
      <label htmlFor={`appeal-${notification.id}`} className={css.appealLabel}>
        Dlaczego nie zgadzasz się z decyzją?
      </label>
      <textarea
        id={`appeal-${notification.id}`}
        className={css.appealTextarea}
        rows={4}
        maxLength={2000}
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Opisz sytuację. Możesz też napisać, co poprawiłeś(-aś) w ofercie."
      />
      <p className={css.appealHint}>
        Odwołanie sprawdzi moderator, a odpowiedź z uzasadnieniem dostaniesz tutaj.
      </p>
      {error ? (
        <p className={css.appealError} role="alert">
          {error}
        </p>
      ) : null}
      <div className={css.appealActions}>
        <button
          type="button"
          className={css.appealSend}
          disabled={busy || text.trim().length < 10}
          onClick={submit}
        >
          Wyślij odwołanie
        </button>
        <button type="button" className={css.appealCancel} disabled={busy} onClick={() => setOpen(false)}>
          Anuluj
        </button>
      </div>
    </div>
  ) : (
    <button type="button" className={css.appealOpen} onClick={() => setOpen(true)}>
      Nie zgadzam się – odwołaj się
    </button>
  );
};

/** Pinned "Zespół Refume" row at the top of the inbox list. */
export const RefumeTeamInboxItem = ({ tab, isActive }) => {
  const currentUser = useSelector(state => state.user?.currentUser);
  const list = getNotifications(currentUser);
  const unread = getUnreadCount(currentUser);
  const latest = list[0];
  return (
    <li className={classNames(css.item, { [css.itemActive]: isActive })}>
      <NamedLink
        name="InboxPage"
        params={{ tab }}
        to={{ search: '?tx=refume' }}
        className={css.itemLink}
      >
        <TeamAvatar />
        <span className={css.itemText}>
          <span className={css.itemName}>
            Zespół Refume
            {unread > 0 ? <span className={css.badge}>{unread}</span> : null}
          </span>
          <span className={classNames(css.itemPreview, { [css.unread]: unread > 0 })}>
            {latest ? latest.title : 'Tu znajdziesz powiadomienia od Refume.'}
          </span>
        </span>
      </NamedLink>
    </li>
  );
};

/** Right pane: messages from "Zespół Refume" (marked read when opened). */
const RefumeNotificationsPanel = () => {
  const dispatch = useDispatch();
  const currentUser = useSelector(state => state.user?.currentUser);
  const list = getNotifications(currentUser);
  const appealsList = currentUser?.attributes?.profile?.privateData?.refumeOdwolania;
  const appeals = Array.isArray(appealsList) ? appealsList : [];

  useEffect(() => {
    // Give the user a moment to see what's new before the badges disappear
    const t = setTimeout(() => dispatch(markNotificationsRead()), 1500);
    return () => clearTimeout(t);
  }, [list.length]);

  return (
    <div className={css.panel}>
      <div className={css.panelHeader}>
        <TeamAvatar />
        <div>
          <h2 className={css.panelTitle}>Zespół Refume</h2>
          <p className={css.panelSub}>Powiadomienia o poszukiwanych perfumach, weryfikacji ogłoszeń i nie tylko.</p>
        </div>
      </div>
      {list.length === 0 ? (
        <p className={css.empty}>
          Nie masz jeszcze powiadomień. Kliknij „Powiadom mnie” w zakładce{' '}
          <NamedLink name="ScentRequestsPage">Poszukiwane</NamedLink>, a damy Ci znać, gdy ktoś
          wystawi ten zapach.
        </p>
      ) : (
        <ul className={css.messages}>
          {list.map(n => (
            <li key={n.id} className={classNames(css.message, { [css.messageUnread]: !n.read })}>
              <TeamAvatar small />
              <div className={css.bubble}>
                <div className={css.bubbleTop}>
                  {n.image ? <img src={n.image} alt="" className={css.thumb} loading="lazy" /> : null}
                  <div>
                    <p className={css.messageTitle}>{n.title}</p>
                    <p className={css.messageBody}>{n.body}</p>
                  </div>
                </div>
                {n.txId ? (
                  <NamedLink
                    name="InboxPage"
                    params={{ tab: n.tab === 'sales' ? 'sales' : 'orders' }}
                    to={{ search: `?tx=${n.txId}` }}
                    className={css.cta}
                  >
                    Otwórz rozmowę
                  </NamedLink>
                ) : n.editListingId ? (
                  <NamedLink
                    name="EditListingPage"
                    params={{ id: n.editListingId, slug: 'ogloszenie', type: 'edit', tab: 'details' }}
                    className={css.cta}
                  >
                    Wyślij nowe zdjęcie
                  </NamedLink>
                ) : n.listingId ? (
                  <NamedLink
                    name="ListingPageCanonical"
                    params={{ id: n.listingId }}
                    className={css.cta}
                  >
                    {n.type === 'poszukiwane' ? 'Zobacz ofertę' : 'Zobacz ogłoszenie'}
                  </NamedLink>
                ) : null}
                {APPEALABLE.includes(n.type) ? (
                  <AppealBox notification={n} appeal={appeals.find(a => a.notificationId === n.id)} />
                ) : null}
                <time className={css.time} dateTime={n.createdAt}>
                  {timeAgoPl(n.createdAt)}
                </time>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default RefumeNotificationsPanel;
