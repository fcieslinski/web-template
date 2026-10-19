/**
 * Refume: moderator panel (/moderacja) — everything except the proof decision itself,
 * which lives in refume-moderation.js.
 *
 * Data model:
 * - listing metadata.moderacja = { przejrzano?, ukryta?, powod?, zmieniono, przez }
 *     przejrzano: ISO date when a moderator marked a new listing as OK
 *     ukryta: listing closed by a moderator (the seller can't reopen it in the UI)
 * - user metadata.refumeBlokada = { od, powod, przez }  — blocked account (null = active)
 * - reporter's privateData.refumeZgloszenia = [{ id, typ, celId, celNazwa, powod, opis,
 *     utworzono, status: 'nowe' | 'rozpatrzone' | 'odrzucone', rozpatrzono?, decyzja? }]
 *   Reports live with the reporter (only they and the operator can read them), so nobody
 *   else learns who reported whom.
 *
 * GET  /api/moderacja/status        { isModerator, counts? }   (cheap for non-moderators)
 * GET  /api/moderacja/panel         proofs, new listings, reports, history
 * POST /api/moderacja/oferta        { listingId, action: 'ok'|'ukryj'|'przywroc', reason? }
 * POST /api/moderacja/uzytkownik    { userId, action: 'zablokuj'|'odblokuj', reason? }
 * POST /api/moderacja/cofnij-dowod  { listingId } — undo a proof decision (back to the queue)
 * POST /api/moderacja/zgloszenie    { reporterId, reportId, action: 'rozpatrzone'|'odrzucone' }
 * POST /api/zgloszenia              { typ: 'oferta'|'uzytkownik', celId, powod, opis } (any user)
 */
const { getSdk, handleError } = require('../api-util/sdk');
const {
  isIntegrationApiConfigured,
  queryListings,
  queryUsers,
  showListing,
  showUser,
  updateListing,
  updateUserProfile,
  closeListing,
  openListing,
} = require('../api-util/refumeIntegrationApi');
const { addNotification } = require('../api-util/refumeNotifications');
const { isWaitingForReview } = require('./refume-moderation');

const MAX_LISTING_PAGES = 20;
const MAX_USER_PAGES = 50;
const CACHE_MS = 20 * 1000;
const NEW_LISTING_DAYS = 30;
const REPORTS_KEY = 'refumeZgloszenia';
const MAX_REPORTS_PER_USER = 50;
const REPORT_REASONS = {
  podrobka: 'Podejrzenie podróbki',
  'niezgodne-z-opisem': 'Niezgodne z opisem lub zdjęciami',
  oszustwo: 'Oszustwo lub płatność poza Refume',
  niedozwolone: 'Niedozwolony produkt',
  spam: 'Spam lub powielona oferta',
  zachowanie: 'Obraźliwe zachowanie',
  inne: 'Inne',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuidOf = id => (typeof id === 'string' ? id : id?.uuid);
const httpError = (status, message) =>
  Object.assign(new Error(message), { status, statusText: message, data: {} });
const clean = (text, max) =>
  String(text || '')
    .trim()
    .slice(0, max);

const moderatorIds = () =>
  (process.env.REFUME_MODERATOR_USER_IDS || '')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean);

const currentUserId = (req, res) =>
  getSdk(req, res)
    .currentUser.show()
    .then(r => r?.data?.data?.id?.uuid || null)
    .catch(() => null);

const requireModerator = async (req, res) => {
  const userId = await currentUserId(req, res);
  if (!userId) throw httpError(401, 'Log in as a moderator.');
  if (!moderatorIds().includes(userId)) throw httpError(403, 'Not a moderator.');
  if (!isIntegrationApiConfigured()) {
    throw httpError(500, 'Integration API credentials are missing (see .env).');
  }
  return userId;
};

// ---------- Scans (cached for a few seconds) ----------

const IMAGE_VARIANTS = ['landscape-crop', 'square-small2x', 'square-small', 'default'];
const imageUrl = image => {
  const variants = image?.attributes?.variants || {};
  const name = IMAGE_VARIANTS.find(v => variants[v]?.url) || Object.keys(variants)[0];
  return name ? variants[name].url : null;
};

let listingScan = null;
const scanListings = async () => {
  if (listingScan && Date.now() - listingScan.at < CACHE_MS) return listingScan.data;
  const listings = [];
  for (let page = 1; page <= MAX_LISTING_PAGES; page++) {
    const result = await queryListings({
      page,
      perPage: 100,
      include: 'author,images',
      'fields.image': 'variants.landscape-crop,variants.square-small2x,variants.default',
    });
    const included = result.included || [];
    const byId = new Map(included.map(i => [`${i.type}/${i.id}`, i]));
    (result.data || []).forEach(l => {
      const authorId = l.relationships?.author?.data?.id;
      const author = byId.get(`user/${authorId}`);
      const images = (l.relationships?.images?.data || [])
        .map(ref => imageUrl(byId.get(`image/${ref.id}`)))
        .filter(Boolean)
        .slice(0, 6);
      const a = l.attributes;
      listings.push({
        id: l.id,
        title: a.title,
        state: a.state,
        createdAt: a.createdAt,
        price: a.price ? { amount: a.price.amount, currency: a.price.currency } : null,
        brand: a.publicData?.marka || '',
        description: clean(a.description, 400),
        images,
        author: {
          id: authorId,
          name: author?.attributes?.profile?.displayName || '',
          blocked: !!author?.attributes?.profile?.metadata?.refumeBlokada,
        },
        proof: a.privateData?.dowodZakupu || null,
        proofReason: a.privateData?.weryfikacjaPowod || null,
        weryfikacja: a.metadata?.weryfikacja || null,
        moderacja: a.metadata?.moderacja || null,
        waitingForProof: isWaitingForReview(a),
      });
    });
    if (page >= (result.meta?.totalPages || 1)) break;
  }
  listingScan = { at: Date.now(), data: listings };
  return listings;
};

let userScan = null;
const scanUsers = async () => {
  if (userScan && Date.now() - userScan.at < CACHE_MS) return userScan.data;
  const reports = [];
  const blocked = [];
  for (let page = 1; page <= MAX_USER_PAGES; page++) {
    const result = await queryUsers({ page, perPage: 100 });
    (result.data || []).forEach(u => {
      const profile = u.attributes?.profile || {};
      const name = profile.displayName || '';
      (Array.isArray(profile.privateData?.[REPORTS_KEY]) ? profile.privateData[REPORTS_KEY] : [])
        .filter(r => r && r.id)
        .forEach(r => reports.push({ ...r, reporterId: u.id, reporterName: name }));
      if (profile.metadata?.refumeBlokada) {
        blocked.push({ id: u.id, name, ...profile.metadata.refumeBlokada });
      }
    });
    if (page >= (result.meta?.totalPages || 1)) break;
  }
  userScan = { at: Date.now(), data: { reports, blocked } };
  return userScan.data;
};

const invalidate = () => {
  listingScan = null;
  userScan = null;
};

const isNewToReview = l =>
  l.state === 'published' &&
  !l.moderacja?.przejrzano &&
  !l.moderacja?.ukryta &&
  Date.now() - new Date(l.createdAt).getTime() < NEW_LISTING_DAYS * 24 * 3600 * 1000;

// ---------- Endpoints ----------

const getStatus = (req, res) => {
  Promise.resolve()
    .then(async () => {
      const userId = await currentUserId(req, res);
      if (!userId || !moderatorIds().includes(userId) || !isIntegrationApiConfigured()) {
        return res.status(200).json({ data: { isModerator: false } });
      }
      const [listings, users] = await Promise.all([scanListings(), scanUsers()]);
      res.status(200).json({
        data: {
          isModerator: true,
          counts: {
            dowody: listings.filter(l => l.waitingForProof).length,
            oferty: listings.filter(isNewToReview).length,
            zgloszenia: users.reports.filter(r => r.status === 'nowe').length,
          },
        },
      });
    })
    .catch(e => handleError(res, e));
};

const getPanel = (req, res) => {
  requireModerator(req, res)
    .then(async () => {
      const [listings, users] = await Promise.all([scanListings(), scanUsers()]);
      const proofs = listings
        .filter(l => l.waitingForProof)
        .sort((a, b) => (a.proof?.uploadedAt || '').localeCompare(b.proof?.uploadedAt || ''));
      const newListings = listings
        .filter(isNewToReview)
        .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
      const listingById = new Map(listings.map(l => [l.id, l]));
      const reports = users.reports
        .map(r => ({
          ...r,
          listing: r.typ === 'oferta' ? listingById.get(r.celId) || null : null,
        }))
        .sort((a, b) => (b.utworzono || '').localeCompare(a.utworzono || ''));

      const history = [
        ...listings
          .filter(l => l.weryfikacja?.sprawdzonoAt && !l.waitingForProof)
          .map(l => ({
            kind: 'dowod',
            at: l.weryfikacja.sprawdzonoAt,
            status: l.weryfikacja.status,
            reason: l.proofReason,
            listing: l,
          })),
        ...listings
          .filter(l => l.moderacja?.ukryta)
          .map(l => ({ kind: 'ukryta', at: l.moderacja.zmieniono, reason: l.moderacja.powod, listing: l })),
        ...users.blocked.map(u => ({ kind: 'blokada', at: u.od, reason: u.powod, user: u })),
      ]
        .sort((a, b) => (b.at || '').localeCompare(a.at || ''))
        .slice(0, 150);

      res.status(200).json({ data: { proofs, newListings, reports, history } });
    })
    .catch(e => handleError(res, e));
};

const listingAction = (req, res) => {
  const listingId = uuidOf(req.body?.listingId);
  const { action } = req.body || {};
  const reason = clean(req.body?.reason, 500);
  requireModerator(req, res)
    .then(async moderatorId => {
      if (!UUID_RE.test(listingId || '') || !['ok', 'ukryj', 'przywroc'].includes(action)) {
        throw httpError(400, 'Invalid action.');
      }
      if (action === 'ukryj' && !reason) throw httpError(400, 'A reason is required.');
      const shown = await showListing({ id: listingId });
      const listing = shown.data;
      const previous = listing.attributes.metadata?.moderacja || {};
      const now = new Date().toISOString();
      const authorId = listing.relationships?.author?.data?.id;
      const title = listing.attributes.title || '';

      if (action === 'ok') {
        await updateListing({
          id: listingId,
          metadata: { moderacja: { ...previous, przejrzano: now, przez: moderatorId } },
        });
      } else if (action === 'ukryj') {
        if (listing.attributes.state === 'published') await closeListing({ id: listingId });
        await updateListing({
          id: listingId,
          metadata: {
            moderacja: { ...previous, ukryta: true, powod: reason, zmieniono: now, przez: moderatorId },
          },
        });
        if (authorId) {
          await addNotification(authorId, {
            type: 'oferta-ukryta',
            dedupeKey: `ukryta:${listingId}:${now}`,
            title: 'Oferta została ukryta',
            body: `Moderator ukrył Twoją ofertę „${title}”. Powód: ${reason}. Jeśli to pomyłka, odpowiedz na tę wiadomość przez formularz kontaktowy.`,
            editListingId: listingId,
          }).catch(() => null);
        }
      } else {
        if (listing.attributes.state === 'closed') await openListing({ id: listingId });
        await updateListing({
          id: listingId,
          metadata: {
            moderacja: { ...previous, ukryta: false, powod: null, zmieniono: now, przez: moderatorId },
          },
        });
        if (authorId && previous.ukryta) {
          await addNotification(authorId, {
            type: 'oferta-przywrocona',
            dedupeKey: `przywrocona:${listingId}:${now}`,
            title: 'Oferta znów jest widoczna',
            body: `Moderator przywrócił Twoją ofertę „${title}”.`,
            listingId,
          }).catch(() => null);
        }
      }
      invalidate();
      res.status(200).json({ data: { ok: true } });
    })
    .catch(e => handleError(res, e));
};

const userAction = (req, res) => {
  const userId = uuidOf(req.body?.userId);
  const { action } = req.body || {};
  const reason = clean(req.body?.reason, 500);
  requireModerator(req, res)
    .then(async moderatorId => {
      if (!UUID_RE.test(userId || '') || !['zablokuj', 'odblokuj'].includes(action)) {
        throw httpError(400, 'Invalid action.');
      }
      if (moderatorIds().includes(userId)) throw httpError(400, 'Cannot block a moderator.');
      if (action === 'zablokuj') {
        if (!reason) throw httpError(400, 'A reason is required.');
        const now = new Date().toISOString();
        await updateUserProfile({
          id: userId,
          metadata: { refumeBlokada: { od: now, powod: reason, przez: moderatorId } },
        });
        // Hide all their published listings
        const listings = (await scanListings()).filter(
          l => l.author.id === userId && l.state === 'published'
        );
        for (const l of listings) {
          await closeListing({ id: l.id }).catch(() => null);
          await updateListing({
            id: l.id,
            metadata: {
              moderacja: {
                ...(l.moderacja || {}),
                ukryta: true,
                powod: `Konto zablokowane: ${reason}`,
                zmieniono: now,
                przez: moderatorId,
              },
            },
          }).catch(() => null);
        }
        await addNotification(userId, {
          type: 'konto-zablokowane',
          dedupeKey: `blokada:${now}`,
          title: 'Konto zostało zablokowane',
          body: `Moderator zablokował Twoje konto. Powód: ${reason}. Nie możesz teraz kupować ani wystawiać ofert.`,
        }).catch(() => null);
      } else {
        await updateUserProfile({ id: userId, metadata: { refumeBlokada: null } });
        await addNotification(userId, {
          type: 'konto-odblokowane',
          dedupeKey: `odblokowanie:${Date.now()}`,
          title: 'Konto odblokowane',
          body: 'Twoje konto znów działa normalnie. Ukryte oferty możesz przywrócić, pisząc do nas.',
        }).catch(() => null);
      }
      invalidate();
      res.status(200).json({ data: { ok: true } });
    })
    .catch(e => handleError(res, e));
};

const undoProofDecision = (req, res) => {
  const listingId = uuidOf(req.body?.listingId);
  requireModerator(req, res)
    .then(async () => {
      if (!UUID_RE.test(listingId || '')) throw httpError(400, 'Invalid listingId.');
      await updateListing({
        id: listingId,
        metadata: { weryfikacja: null },
        privateData: { weryfikacjaPowod: null },
      });
      invalidate();
      res.status(200).json({ data: { ok: true } });
    })
    .catch(e => handleError(res, e));
};

const reportAction = (req, res) => {
  const reporterId = uuidOf(req.body?.reporterId);
  const { reportId, action } = req.body || {};
  const note = clean(req.body?.note, 300);
  requireModerator(req, res)
    .then(async moderatorId => {
      if (!UUID_RE.test(reporterId || '') || !reportId || !['rozpatrzone', 'odrzucone'].includes(action)) {
        throw httpError(400, 'Invalid action.');
      }
      const shown = await showUser({ id: reporterId });
      const list = shown.data?.attributes?.profile?.privateData?.[REPORTS_KEY];
      const reports = Array.isArray(list) ? list : [];
      const report = reports.find(r => r.id === reportId);
      if (!report) throw httpError(404, 'Report not found.');
      const updated = reports.map(r =>
        r.id === reportId
          ? { ...r, status: action, rozpatrzono: new Date().toISOString(), decyzja: note || null, przez: moderatorId }
          : r
      );
      await updateUserProfile({ id: reporterId, privateData: { [REPORTS_KEY]: updated } });
      await addNotification(reporterId, {
        type: 'zgloszenie-rozpatrzone',
        dedupeKey: `zgloszenie:${reportId}`,
        title: 'Dziękujemy za zgłoszenie',
        body:
          action === 'rozpatrzone'
            ? `Sprawdziliśmy Twoje zgłoszenie dotyczące „${report.celNazwa || 'oferty'}” i podjęliśmy działania.`
            : `Sprawdziliśmy Twoje zgłoszenie dotyczące „${report.celNazwa || 'oferty'}”. Nie znaleźliśmy naruszenia zasad.`,
      }).catch(() => null);
      invalidate();
      res.status(200).json({ data: { ok: true } });
    })
    .catch(e => handleError(res, e));
};

// Any logged-in user: report a listing or a user
const createReport = (req, res) => {
  const { typ } = req.body || {};
  const celId = uuidOf(req.body?.celId);
  const powod = String(req.body?.powod || '');
  const opis = clean(req.body?.opis, 1000);
  const sdk = getSdk(req, res);
  Promise.resolve()
    .then(async () => {
      if (!['oferta', 'uzytkownik'].includes(typ) || !UUID_RE.test(celId || '') || !REPORT_REASONS[powod]) {
        throw httpError(400, 'Invalid report.');
      }
      if (!isIntegrationApiConfigured()) throw httpError(500, 'Integration API is not configured.');
      const me = (await sdk.currentUser.show()).data.data;
      const myId = me.id.uuid;

      let celNazwa = '';
      if (typ === 'oferta') {
        const listing = (await showListing({ id: celId })).data;
        if (listing.relationships?.author?.data?.id === myId) throw httpError(400, 'Own listing.');
        celNazwa = listing.attributes.title || '';
      } else {
        if (celId === myId) throw httpError(400, 'Yourself.');
        const user = (await showUser({ id: celId })).data;
        celNazwa = user.attributes?.profile?.displayName || '';
      }

      const shown = await showUser({ id: myId });
      const list = shown.data?.attributes?.profile?.privateData?.[REPORTS_KEY];
      const reports = Array.isArray(list) ? list : [];
      // One open report per target and person
      if (reports.some(r => r.celId === celId && r.status === 'nowe')) {
        return res.status(200).json({ data: { ok: true, duplicate: true } });
      }
      const report = {
        id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
        typ,
        celId,
        celNazwa,
        powod,
        powodEtykieta: REPORT_REASONS[powod],
        opis,
        utworzono: new Date().toISOString(),
        status: 'nowe',
      };
      await updateUserProfile({
        id: myId,
        privateData: { [REPORTS_KEY]: [report, ...reports].slice(0, MAX_REPORTS_PER_USER) },
      });
      invalidate();
      res.status(200).json({ data: { ok: true } });
    })
    .catch(e => handleError(res, e));
};

module.exports = {
  getStatus,
  getPanel,
  listingAction,
  userAction,
  undoProofDecision,
  reportAction,
  createReport,
  REPORT_REASONS,
};
