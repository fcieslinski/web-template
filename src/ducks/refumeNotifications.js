/**
 * Refume: in-app notifications from "Zespół Refume" (written by the server into the user's
 * privateData.refumePowiadomienia, see server/api-util/refumeNotifications.js).
 */
import { setCurrentUser } from './user.duck';

export const NOTIFICATIONS_KEY = 'refumePowiadomienia';

export const getNotifications = currentUser => {
  const list = currentUser?.attributes?.profile?.privateData?.[NOTIFICATIONS_KEY];
  return Array.isArray(list) ? list : [];
};

export const getUnreadCount = currentUser => getNotifications(currentUser).filter(n => !n.read).length;

/** Marks all notifications as read (only if some are unread). */
export const markNotificationsRead = () => (dispatch, getState, sdk) => {
  const currentUser = getState().user?.currentUser;
  const list = getNotifications(currentUser);
  if (!currentUser?.id || !list.some(n => !n.read)) return Promise.resolve();
  const updated = list.map(n => ({ ...n, read: true }));
  dispatch(
    setCurrentUser({
      ...currentUser,
      attributes: {
        ...currentUser.attributes,
        profile: {
          ...currentUser.attributes.profile,
          privateData: { ...(currentUser.attributes.profile?.privateData || {}), [NOTIFICATIONS_KEY]: updated },
        },
      },
    })
  );
  return sdk.currentUser.updateProfile({ privateData: { [NOTIFICATIONS_KEY]: updated } }).catch(() => null);
};
