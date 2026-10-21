/**
 * Refume: moderator tools around users.
 *
 *  - Messages from "Zespół Refume" to any user (templates live in the browser)
 *      POST /api/moderacja/wiadomosc   { userId, title, body, listingId? }
 *  - Internal notes about a user (only moderators see them)
 *      POST /api/moderacja/notatka     { userId, text }
 *  - Search users and listings
 *      GET  /api/moderacja/szukaj?q=
 *  - User card (everything about one account in one place)
 *      GET  /api/moderacja/karta?id=
 *  - Appeals against moderation decisions
 *      POST /api/odwolania             { notificationId, tresc }      (the user)
 *      POST /api/moderacja/odwolanie   { userId, appealId, decision: 'uwzglednione' | 'odrzucone', odpowiedz }
 *
 * Appeals are stored with the user: privateData.refumeOdwolania
 *   [{ id, notificationId, typ, tytul, decyzja (text of the decision), listingId?, tresc,
 *      utworzono, status: 'nowe' | 'uwzglednione' | 'odrzucone', odpowiedz?, rozpatrzono?, przez? }]
 * Notes and sent messages are kept in the first moderator's privateData.refumeNotatki.
 */
const { readList, withList } = require('../api-util/refumeStore');
const { getSdk, handleError } = require('../api-util/sdk');
const {
  isIntegrationApiConfigured,
  showUser,
  updateUserProfile,
  showListing,
  updateListing,
  openListing,
  queryTransactions,
} = require('../api-util/refumeIntegrationApi');
const { addNotification, NOTIFICATIONS_KEY } = require('../api-util/refumeNotifications');
const { readQueue } = require('./refume-chat-flags');
const { OVERRIDE_KEY } = require('./refume-badges');
const {
  scanListings,
  scanUsers,
  invalidate,
  requireModerator,
} = require('./refume-moderation-panel');

const APPEALS_KEY = 'refumeOdwolania';
const NOTES_KEY = 'refumeNotatki';
const MAX_NOTES = 300;
const MAX_APPEALS = 30;
const APPEAL_DAYS = 30;
const APPEALABLE = [
  'dowod-odrzucony',
  'oferta-ukryta',
  'konto-zablokowane',
  'znacznik-odebrany',
  'ostrzezenie-czat',
  'oferta-edytowana',
  'odznaki-zmienione',
];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuidOf = id => (typeof id === 'string' ? id : id?.uuid);
const httpError = (status, message) =>
  Object.assign(new Error(message), { status, statusText: message, data: {} });
const clean = (text, max) =>
  String(text || '')
    .replace(/\r/g, '')
    .trim()
    .slice(0, max);
const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const norm = s =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l');

const moderatorIds = () =>
  (process.env.REFUME_MODERATOR_USER_IDS || '')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean);

// ---------- Notes log (first moderator's privateData) ----------

// Kept in the Refume database (or the first moderator's privateData without one)
const withNotes = fn => {
  if (!moderatorIds()[0]) return Promise.reject(httpError(500, 'No moderator configured.'));
  return withList(NOTES_KEY, fn, { max: MAX_NOTES, maxWithDb: 20000 });
};
const readNotes = async () => (moderatorIds()[0] ? readList(NOTES_KEY) : []);
const addNote = (entry, moderatorId) =>
  withNotes(notes => [{ id: newId(), utworzono: new Date().toISOString(), przez: moderatorId, ...entry }, ...notes]);

// ---------- Messages from the team ----------

const sendMessage = (req, res) => {
  const userId = uuidOf(req.body?.userId);
  const listingId = uuidOf(req.body?.listingId);
  const title = clean(req.body?.title, 120);
  const body = clean(req.body?.body, 2000);
  requireModerator(req, res)
    .then(async moderatorId => {
      if (!UUID_RE.test(userId || '')) throw httpError(400, 'Invalid userId.');
      if (!title || !body) throw httpError(400, 'Title and message are required.');
      if (listingId && !UUID_RE.test(listingId)) throw httpError(400, 'Invalid listingId.');
      await addNotification(userId, {
        type: 'wiadomosc-zespolu',
        title,
        body,
        ...(listingId ? { listingId } : {}),
      });
      await addNote({ userId, typ: 'wiadomosc', tekst: `${title}: ${body}`, listingId: listingId || null }, moderatorId).catch(
        () => null
      );
      res.status(200).json({ data: { ok: true } });
    })
    .catch(e => handleError(res, e));
};

const saveNote = (req, res) => {
  const userId = uuidOf(req.body?.userId);
  const text = clean(req.body?.text, 1000);
  requireModerator(req, res)
    .then(async moderatorId => {
      if (!UUID_RE.test(userId || '')) throw httpError(400, 'Invalid userId.');
      if (!text) throw httpError(400, 'Empty note.');
      await addNote({ userId, typ: 'notatka', tekst: text }, moderatorId);
      res.status(200).json({ data: { ok: true } });
    })
    .catch(e => handleError(res, e));
};

// ---------- Search ----------

const search = (req, res) => {
  const q = clean(req.query?.q, 100);
  requireModerator(req, res)
    .then(async () => {
      if (q.length < 2) return res.status(200).json({ data: { users: [], listings: [] } });
      const [users, listings] = await Promise.all([scanUsers(), scanListings()]);
      const needle = norm(q);
      const words = needle.split(/\s+/).filter(Boolean);
      const matches = hay => {
        const h = norm(hay);
        return words.every(w => h.includes(w));
      };
      const foundUsers = users.users
        .filter(u => u.id === q || matches(`${u.name} ${u.firstName} ${u.lastName} ${u.email}`))
        .slice(0, 20)
        .map(u => ({ ...u, isModerator: moderatorIds().includes(u.id) }));
      const foundListings = listings
        .filter(l => l.id === q || matches(`${l.title} ${l.brand} ${l.author.name}`))
        .slice(0, 20)
        .map(l => ({
          id: l.id,
          title: l.title,
          brand: l.brand,
          state: l.state,
          price: l.price,
          image: l.images[0] || null,
          author: l.author,
          ukryta: !!l.moderacja?.ukryta,
        }));
      res.status(200).json({ data: { users: foundUsers, listings: foundListings } });
    })
    .catch(e => handleError(res, e));
};

// ---------- User card ----------

const PROBLEM_TRANSITIONS = [
  'transition/dispute',
  'transition/operator-dispute',
  'transition/cancel',
  'transition/auto-cancel',
];
const TX_FIELDS = ['lastTransition', 'lastTransitionedAt', 'createdAt', 'payinTotal'];
const queryUserTransactions = async (role, userId) => {
  const result = await queryTransactions({
    [role === 'customer' ? 'customerId' : 'providerId']: userId,
    include: 'listing,customer,provider',
    perPage: 30,
  }).catch(() => ({ data: [] }));
  const included = result.included || [];
  const byId = new Map(included.map(i => [`${i.type}/${i.id}`, i]));
  return (result.data || []).map(t => {
    const listingRef = t.relationships?.listing?.data?.id;
    const otherRef = t.relationships?.[role === 'customer' ? 'provider' : 'customer']?.data?.id;
    const a = t.attributes || {};
    return {
      id: t.id,
      role,
      ...Object.fromEntries(TX_FIELDS.map(f => [f, a[f] ?? null])),
      payinTotal: a.payinTotal ? { amount: a.payinTotal.amount, currency: a.payinTotal.currency } : null,
      listing: listingRef
        ? { id: listingRef, title: byId.get(`listing/${listingRef}`)?.attributes?.title || '' }
        : null,
      other: otherRef
        ? { id: otherRef, name: byId.get(`user/${otherRef}`)?.attributes?.profile?.displayName || '' }
        : null,
      problem: (a.transitions || []).some(tr => PROBLEM_TRANSITIONS.includes(tr.transition))
        ? (a.transitions || []).some(tr => /dispute/.test(tr.transition) && !/from-disputed/.test(tr.transition))
          ? 'spor'
          : 'anulowane'
        : null,
    };
  });
};

const getUserCard = (req, res) => {
  const userId = uuidOf(req.query?.id);
  requireModerator(req, res)
    .then(async () => {
      if (!UUID_RE.test(userId || '')) throw httpError(400, 'Invalid id.');
      const shown = await showUser({ id: userId });
      const u = shown.data;
      const profile = u.attributes?.profile || {};
      const [listings, users, flags, notes, asCustomer, asProvider] = await Promise.all([
        scanListings(),
        scanUsers(),
        readQueue().catch(() => []),
        readNotes().catch(() => []),
        queryUserTransactions('customer', userId),
        queryUserTransactions('provider', userId),
      ]);
      const own = listings.filter(l => l.author.id === userId);
      const ownIds = new Set(own.map(l => l.id));
      const reportsAgainst = users.reports.filter(
        r =>
          (r.typ === 'uzytkownik' && r.celId === userId) ||
          (r.typ === 'oferta' && ownIds.has(r.celId)) ||
          (r.typ === 'rozmowa' && r.celUzytkownikId === userId)
      );
      const reportsBy = users.reports.filter(r => r.reporterId === userId);
      const moderationNotifications = (profile.privateData?.[NOTIFICATIONS_KEY] || []).filter(
        n => n && n.type && n.type !== 'poszukiwane'
      );
      const transactions = [...asCustomer, ...asProvider].sort((a, b) =>
        (b.lastTransitionedAt || b.createdAt || '').localeCompare(a.lastTransitionedAt || a.createdAt || '')
      );

      res.status(200).json({
        data: {
          user: {
            id: u.id,
            name: profile.displayName || '',
            firstName: profile.firstName || '',
            lastName: profile.lastName || '',
            email: u.attributes?.email || '',
            emailVerified: !!u.attributes?.emailVerified,
            createdAt: u.attributes?.createdAt,
            banned: !!u.attributes?.banned,
            deleted: !!u.attributes?.deleted,
            bio: clean(profile.bio, 400),
            blocked: profile.metadata?.refumeBlokada || null,
            badges: profile.metadata?.refumeOdznaki || null,
            badgeOverride: profile.metadata?.[OVERRIDE_KEY] || null,
            isModerator: moderatorIds().includes(u.id),
          },
          listings: own
            .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
            .map(l => ({
              id: l.id,
              title: l.title,
              state: l.state,
              createdAt: l.createdAt,
              price: l.price,
              image: l.images[0] || null,
              ukryta: !!l.moderacja?.ukryta,
              weryfikacja: l.weryfikacja?.status || null,
              waitingForProof: l.waitingForProof,
            })),
          transactions,
          reportsAgainst: reportsAgainst.sort((a, b) => (b.utworzono || '').localeCompare(a.utworzono || '')),
          reportsBy: reportsBy.sort((a, b) => (b.utworzono || '').localeCompare(a.utworzono || '')),
          chatFlags: flags.filter(f => f.senderId === userId),
          appeals: (profile.privateData?.[APPEALS_KEY] || []).filter(a => a && a.id),
          notes: notes.filter(n => n.userId === userId),
          notifications: moderationNotifications.slice(0, 30),
          powiazania: await require('./refume-traces')
            .linkedAccountsFor(userId, users.users)
            .catch(() => require('./refume-traces').linkedAccounts(userId, users.users)),
        },
      });
    })
    .catch(e => handleError(res, e));
};

// ---------- Appeals ----------

const createAppeal = (req, res) => {
  const notificationId = clean(req.body?.notificationId, 40);
  const tresc = clean(req.body?.tresc, 2000);
  const sdk = getSdk(req, res);
  Promise.resolve()
    .then(async () => {
      if (!isIntegrationApiConfigured()) throw httpError(500, 'Integration API is not configured.');
      if (!notificationId) throw httpError(400, 'Missing notificationId.');
      if (tresc.length < 10) throw httpError(400, 'Opisz krótko, dlaczego się nie zgadzasz (min. 10 znaków).');
      const me = (await sdk.currentUser.show()).data.data;
      const userId = me.id.uuid;
      const shown = await showUser({ id: userId });
      const privateData = shown.data?.attributes?.profile?.privateData || {};
      const notifications = Array.isArray(privateData[NOTIFICATIONS_KEY]) ? privateData[NOTIFICATIONS_KEY] : [];
      const n = notifications.find(x => x && x.id === notificationId);
      if (!n || !APPEALABLE.includes(n.type)) throw httpError(400, 'Od tej wiadomości nie można się odwołać.');
      if (Date.now() - new Date(n.createdAt).getTime() > APPEAL_DAYS * 24 * 3600 * 1000) {
        throw httpError(400, `Na odwołanie jest ${APPEAL_DAYS} dni od decyzji.`);
      }
      const appeals = Array.isArray(privateData[APPEALS_KEY]) ? privateData[APPEALS_KEY] : [];
      if (appeals.some(a => a.notificationId === notificationId)) {
        throw httpError(409, 'Od tej decyzji już się odwołano.');
      }
      const appeal = {
        id: newId(),
        notificationId,
        typ: n.type,
        tytul: clean(n.title, 120),
        decyzja: clean(n.body, 600),
        decyzjaData: n.createdAt,
        listingId: n.listingId || n.editListingId || null,
        tresc,
        utworzono: new Date().toISOString(),
        status: 'nowe',
      };
      await updateUserProfile({
        id: userId,
        privateData: { [APPEALS_KEY]: [appeal, ...appeals].slice(0, MAX_APPEALS) },
      });
      invalidate();
      res.status(200).json({ data: { appeal } });
    })
    .catch(e => handleError(res, e));
};

// Accepting an appeal reverses what can be reversed automatically
const reverseDecision = async (appeal, userId, moderatorId) => {
  const now = new Date().toISOString();
  if (appeal.typ === 'oferta-ukryta' && appeal.listingId) {
    const listing = (await showListing({ id: appeal.listingId })).data;
    const previous = listing.attributes.metadata?.moderacja || {};
    if (listing.attributes.state === 'closed') await openListing({ id: appeal.listingId }).catch(() => null);
    await updateListing({
      id: appeal.listingId,
      metadata: { moderacja: { ...previous, ukryta: false, powod: null, zmieniono: now, przez: moderatorId } },
    });
    return 'Oferta znów jest widoczna.';
  }
  if (appeal.typ === 'konto-zablokowane') {
    await updateUserProfile({ id: userId, metadata: { refumeBlokada: null } });
    const hidden = (await scanListings()).filter(
      l => l.author.id === userId && l.moderacja?.ukryta && /^Konto zablokowane/.test(l.moderacja?.powod || '')
    );
    for (const l of hidden) {
      if (l.state === 'closed') await openListing({ id: l.id }).catch(() => null);
      await updateListing({
        id: l.id,
        metadata: { moderacja: { ...(l.moderacja || {}), ukryta: false, powod: null, zmieniono: now, przez: moderatorId } },
      }).catch(() => null);
    }
    return 'Konto zostało odblokowane, a ukryte przy blokadzie oferty przywrócone.';
  }
  return null;
};

const decideAppeal = (req, res) => {
  const userId = uuidOf(req.body?.userId);
  const appealId = clean(req.body?.appealId, 40);
  const decision = req.body?.decision;
  const odpowiedz = clean(req.body?.odpowiedz, 1000);
  requireModerator(req, res)
    .then(async moderatorId => {
      if (!UUID_RE.test(userId || '') || !appealId) throw httpError(400, 'Invalid appeal.');
      if (!['uwzglednione', 'odrzucone'].includes(decision)) throw httpError(400, 'Invalid decision.');
      if (!odpowiedz) throw httpError(400, 'Napisz uzasadnienie.');
      const shown = await showUser({ id: userId });
      const appeals = shown.data?.attributes?.profile?.privateData?.[APPEALS_KEY] || [];
      const appeal = appeals.find(a => a && a.id === appealId);
      if (!appeal) throw httpError(404, 'Appeal not found.');
      if (appeal.status !== 'nowe') throw httpError(409, 'To odwołanie zostało już rozpatrzone.');

      const reversed = decision === 'uwzglednione' ? await reverseDecision(appeal, userId, moderatorId) : null;
      const now = new Date().toISOString();
      const updated = appeals.map(a =>
        a.id === appealId ? { ...a, status: decision, odpowiedz, rozpatrzono: now, przez: moderatorId } : a
      );
      await updateUserProfile({ id: userId, privateData: { [APPEALS_KEY]: updated } });
      await addNotification(userId, {
        type: 'odwolanie-rozpatrzone',
        dedupeKey: `odwolanie:${appealId}`,
        title: decision === 'uwzglednione' ? 'Odwołanie uwzględnione' : 'Odwołanie odrzucone',
        body:
          `Rozpatrzyliśmy Twoje odwołanie od decyzji „${appeal.tytul}”. ` +
          (decision === 'uwzglednione'
            ? `Przyznajemy Ci rację. ${reversed || ''} `
            : 'Decyzja zostaje utrzymana. ') +
          `Uzasadnienie: ${odpowiedz}`,
        ...(appeal.listingId ? { listingId: appeal.listingId } : {}),
      }).catch(() => null);
      await addNote(
        { userId, typ: 'odwolanie', tekst: `Odwołanie (${appeal.tytul}) ${decision === 'uwzglednione' ? 'uwzględnione' : 'odrzucone'}: ${odpowiedz}` },
        moderatorId
      ).catch(() => null);
      invalidate();
      res.status(200).json({ data: { ok: true, reversed } });
    })
    .catch(e => handleError(res, e));
};

module.exports = {
  sendMessage,
  saveNote,
  search,
  getUserCard,
  createAppeal,
  decideAppeal,
  APPEALABLE,
  APPEALS_KEY,
};
