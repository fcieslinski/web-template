import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import classNames from 'classnames';

import { NamedLink } from '../../../components';
import {
  getNotifications,
  getUnreadCount,
  markNotificationsRead,
} from '../../../ducks/refumeNotifications';
import { timeAgoPl } from '../../../util/refumeTimeAgo';

import css from './RefumeNotifications.module.css';

const TeamAvatar = ({ small }) => (
  <span className={classNames(css.avatar, { [css.avatarSmall]: small })} aria-hidden="true">
    R
  </span>
);

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
          <p className={css.panelSub}>Powiadomienia o Twoich poszukiwanych perfumach i nie tylko.</p>
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
                {n.listingId ? (
                  <NamedLink
                    name="ListingPageCanonical"
                    params={{ id: n.listingId }}
                    className={css.cta}
                  >
                    Zobacz ofertę
                  </NamedLink>
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
