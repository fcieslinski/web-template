/**
 * Refume: chat messages flagged automatically (contact details, payment outside Refume,
 * suspicious links) — queued for moderators.
 *
 * The queue is kept in the first moderator's profile privateData.refumeFlagiCzatu
 * (only moderators/operator can read it; users can't remove their own flags):
 *   [{ id, txId, messageId, senderId, senderName, listingTitle, typy: ['kontakt'|'platnosc'|'link'],
 *      utworzono, status: 'nowe' | 'ok' | 'ostrzezono' | 'zablokowano', rozpatrzono? }]
 *
 * POST /api/czat/sprawdz       { txId } — a participant's browser asks the server to check the
 *                              latest messages of a conversation; the server reads them itself.
 * POST /api/moderacja/flaga    { flagId, action: 'ok' | 'ostrzez' } (moderators)
 */
const { getSdk, handleError } = require('../api-util/sdk');
const {
  isIntegrationApiConfigured,
  showUser,
  updateUserProfile,
} = require('../api-util/refumeIntegrationApi');
const { readList, withList, isDbConfigured } = require('../api-util/refumeStore');
const { addNotification } = require('../api-util/refumeNotifications');
const { detectChatRisks, hasHiddenPhone } = require('../api-util/refumeChatSafety.generated');

const QUEUE_KEY = 'refumeFlagiCzatu';
const MAX_QUEUE = 120;
const MAX_QUEUE_DB = 5000;
const MIN_GAP_MS = 10 * 1000; // per user and conversation
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuidOf = id => (typeof id === 'string' ? id : id?.uuid);
const httpError = (status, message) =>
  Object.assign(new Error(message), { status, statusText: message, data: {} });

const moderatorIds = () =>
  (process.env.REFUME_MODERATOR_USER_IDS || '')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean);
const queueOwner = () => moderatorIds()[0] || null;

// One write at a time, so concurrent checks don't overwrite each other
// Kept in the Refume database (or the first moderator's privateData without one)
const withQueue = fn => {
  if (!queueOwner()) return Promise.reject(httpError(500, 'No moderator configured.'));
  return withList(QUEUE_KEY, async queue => {
    const next = await fn(queue);
    if (!next || next === queue) return next;
    // Keep all open flags; drop the oldest handled ones first
    const limit = isDbConfigured() ? MAX_QUEUE_DB : MAX_QUEUE;
    const open = next.filter(f => f.status === 'nowe');
    const closed = next.filter(f => f.status !== 'nowe');
    const trimmed = [...open, ...closed].slice(0, limit);
    trimmed.sort((a, b) => (b.utworzono || '').localeCompare(a.utworzono || ''));
    return trimmed;
  });
};

const readQueue = async () => (queueOwner() ? readList(QUEUE_KEY) : []);

const typesOf = risks =>
  [risks.contact ? 'kontakt' : null, risks.payment ? 'platnosc' : null, risks.links.length ? 'link' : null].filter(
    Boolean
  );

const lastCheck = new Map(); // `${userId}|${txId}` -> timestamp

const checkConversation = (req, res) => {
  const txId = uuidOf(req.body?.txId);
  const sdk = getSdk(req, res);
  Promise.resolve()
    .then(async () => {
      if (!UUID_RE.test(txId || '')) throw httpError(400, 'Invalid txId.');
      if (!isIntegrationApiConfigured() || !queueOwner()) {
        return res.status(200).json({ data: { flagged: 0 } });
      }
      const me = (await sdk.currentUser.show()).data.data;
      const key = `${me.id.uuid}|${txId}`;
      if (Date.now() - (lastCheck.get(key) || 0) < MIN_GAP_MS) {
        return res.status(200).json({ data: { flagged: 0, throttled: true } });
      }
      lastCheck.set(key, Date.now());

      // Both calls only work for participants of the conversation
      const tx = (await sdk.transactions.show({ id: txId, include: ['listing'] })).data;
      const listingRef = tx.data.relationships?.listing?.data?.id?.uuid;
      const listing = (tx.included || []).find(i => i.type === 'listing' && i.id.uuid === listingRef);
      const messagesResponse = await sdk.messages.query({
        transaction_id: txId,
        include: ['sender'],
        perPage: 50,
      });
      const users = new Map(
        (messagesResponse.data.included || [])
          .filter(i => i.type === 'user')
          .map(u => [u.id.uuid, u.attributes?.profile?.displayName || ''])
      );
      // Oldest first
      const messages = (messagesResponse.data.data || [])
        .map(m => ({
          id: m.id.uuid,
          content: m.attributes.content || '',
          createdAt: m.attributes.createdAt,
          senderId: m.relationships?.sender?.data?.id?.uuid,
        }))
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

      const found = [];
      messages.forEach((m, i) => {
        const risks = detectChatRisks(m.content);
        let types = typesOf(risks);
        if (!types.includes('kontakt')) {
          // A number split over several messages in a row
          const parts = [m.content];
          for (let j = i - 1; j >= 0 && parts.length < 4 && messages[j].senderId === m.senderId; j--) {
            parts.unshift(messages[j].content);
          }
          if (parts.length > 1 && hasHiddenPhone(parts.join(' '))) types = ['kontakt', ...types];
        }
        if (types.length) found.push({ message: m, types });
      });
      if (!found.length) return res.status(200).json({ data: { flagged: 0 } });

      let added = 0;
      await withQueue(queue => {
        const known = new Set(queue.map(f => f.messageId));
        const fresh = found
          .filter(f => !known.has(f.message.id))
          .map(f => ({
            id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
            txId,
            messageId: f.message.id,
            senderId: f.message.senderId,
            senderName: users.get(f.message.senderId) || '',
            listingTitle: listing?.attributes?.title || '',
            typy: f.types,
            wyslano: f.message.createdAt,
            utworzono: new Date().toISOString(),
            status: 'nowe',
          }));
        added = fresh.length;
        return fresh.length ? [...fresh, ...queue] : queue;
      });
      if (added) console.log(`[refume-chat] ${added} message(s) flagged in ${txId}`);
      res.status(200).json({ data: { flagged: added } });
    })
    .catch(e => handleError(res, e));
};

// Used by the moderator panel (refume-moderation-panel.js)
const flagAction = async ({ flagId, action, moderatorId }) => {
  let flag = null;
  await withQueue(queue => {
    flag = queue.find(f => f.id === flagId);
    if (!flag) throw httpError(404, 'Flag not found.');
    return queue.map(f =>
      f.id === flagId
        ? { ...f, status: action === 'ostrzez' ? 'ostrzezono' : action === 'zablokuj' ? 'zablokowano' : 'ok', rozpatrzono: new Date().toISOString(), przez: moderatorId }
        : f
    );
  });
  if (action === 'ostrzez' && flag?.senderId) {
    await addNotification(flag.senderId, {
      type: 'ostrzezenie-czat',
      odwolanie: true,
      dedupeKey: `ostrzezenie:${flag.messageId}`,
      title: 'Ostrzeżenie od moderatora',
      body:
        'W rozmowie podałeś(-aś) dane kontaktowe albo zaproponowałeś(-aś) płatność poza Refume. ' +
        'To narusza zasady serwisu i odbiera obu stronom Ochronę Kupującego. Kolejne próby mogą skończyć się blokadą konta.',
    }).catch(() => null);
  }
  return flag;
};

module.exports = { checkConversation, readQueue, flagAction };
