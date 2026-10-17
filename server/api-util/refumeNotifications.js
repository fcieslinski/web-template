/**
 * Refume: in-app notifications from "Zespół Refume" (shown in the inbox).
 * Stored in the recipient's profile privateData.refumePowiadomienia (newest first, max 50),
 * written with the Integration API. The user marks them read in the browser.
 */
const { showUser, updateUserProfile } = require('./refumeIntegrationApi');

const KEY = 'refumePowiadomienia';
const MAX = 50;

const addNotification = async (userId, notification) => {
  const shown = await showUser({ id: userId });
  const existing = shown?.data?.attributes?.profile?.privateData?.[KEY];
  const list = Array.isArray(existing) ? existing : [];
  // Same event twice (e.g. retried request) → keep one
  if (notification.dedupeKey && list.some(n => n.dedupeKey === notification.dedupeKey)) {
    return false;
  }
  const entry = {
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
    read: false,
    ...notification,
  };
  await updateUserProfile({ id: userId, privateData: { [KEY]: [entry, ...list].slice(0, MAX) } });
  return true;
};

module.exports = { addNotification, NOTIFICATIONS_KEY: KEY };
