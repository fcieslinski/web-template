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
 * POST /api/zgloszenia              { typ: 'oferta'|'uzytkownik'|'rozmowa', celId, powod, opis }
 * GET  /api/moderacja/rozmowa?txId  messages of a reported conversation (moderators only)
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
  showTransaction,
} = require('../api-util/refumeIntegrationApi');
const { addNotification } = require('../api-util/refumeNotifications');
const { isWaitingForReview } = require('./refume-moderation');
const { readQueue, flagAction } = require('./refume-chat-flags');
const { forgetUser, OVERRIDE_KEY, BADGE_KEYS } = require('./refume-badges');
const { checkListingPhotos } = require('./refume-photo-check');
const { hammingDistance, SAME_PHOTO_MAX_DISTANCE } = require('../api-util/refumeImageHash');

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
  kontakt: 'Namawianie do kontaktu lub płatności poza Refume',
  phishing: 'Podejrzany link lub prośba o dane',
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
        imageUrlById: Object.fromEntries(
          (l.relationships?.images?.data || []).map(ref => [ref.id, imageUrl(byId.get(`image/${ref.id}`))])
        ),
        imagesKey: (l.relationships?.images?.data || []).slice(0, 8).map(ref => ref.id).join(','),
        photos: a.metadata?.refumeZdjecia || null,
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
  const badgeOverrides = [];
  const users = [];
  const appeals = [];
  for (let page = 1; page <= MAX_USER_PAGES; page++) {
    const result = await queryUsers({ page, perPage: 100 });
    (result.data || []).forEach(u => {
      const profile = u.attributes?.profile || {};
      const name = profile.displayName || '';
      users.push({
        id: u.id,
        name,
        firstName: profile.firstName || '',
        lastName: profile.lastName || '',
        email: u.attributes?.email || '',
        createdAt: u.attributes?.createdAt,
        banned: !!u.attributes?.banned,
        deleted: !!u.attributes?.deleted,
        blocked: profile.metadata?.refumeBlokada || null,
      });
      (Array.isArray(profile.privateData?.refumeOdwolania) ? profile.privateData.refumeOdwolania : [])
        .filter(a => a && a.id)
        .forEach(a => appeals.push({ ...a, userId: u.id, userName: name }));
      (Array.isArray(profile.privateData?.[REPORTS_KEY]) ? profile.privateData[REPORTS_KEY] : [])
        .filter(r => r && r.id)
        .forEach(r => reports.push({ ...r, reporterId: u.id, reporterName: name }));
      if (profile.metadata?.refumeBlokada) {
        blocked.push({ id: u.id, name, ...profile.metadata.refumeBlokada });
      }
      if (profile.metadata?.refumeOdznakiReczne) {
        badgeOverrides.push({ id: u.id, name, ...profile.metadata.refumeOdznakiReczne });
      }
    });
    if (page >= (result.meta?.totalPages || 1)) break;
  }
  userScan = { at: Date.now(), data: { reports, blocked, badgeOverrides, users, appeals } };
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

// ---------- Photo checks (same photo in several listings, photos from the internet) ----------

const brief = l => ({
  id: l.id,
  title: l.title,
  state: l.state,
  author: l.author,
  images: l.images,
  price: l.price,
  brand: l.brand,
  createdAt: l.createdAt,
  description: l.description,
  moderacja: l.moderacja,
});

const findPhotoFlags = listings => {
  const withHashes = listings.filter(l => (l.photos?.hashes || []).length);
  const flags = [];
  withHashes.forEach(l => {
    if (l.state !== 'published' || l.moderacja?.ukryta) return;
    if (l.photos.ok && l.photos.ok >= (l.photos.sprawdzono || '')) return;
    const matches = [];
    withHashes.forEach(other => {
      if (other.id === l.id) return;
      let best = null;
      l.photos.hashes.forEach(h => {
        other.photos.hashes.forEach(oh => {
          const d = hammingDistance(h.hash, oh.hash);
          if (d <= SAME_PHOTO_MAX_DISTANCE && (!best || d < best.distance)) {
            best = { distance: d, mine: l.imageUrlById[h.imageId], theirs: other.imageUrlById[oh.imageId] };
          }
        });
      });
      if (best) {
        matches.push({ listing: brief(other), sameAuthor: other.author.id === l.author.id, ...best });
      }
    });
    // Only the newer listing of a pair is flagged (the copy is usually the later one)
    const earlier = matches.filter(m => (m.listing.createdAt || '') <= (l.createdAt || ''));
    const web = l.photos.web && (l.photos.web.strony?.length || l.photos.web.pelne) ? l.photos.web : null;
    if (earlier.length || web) {
      flags.push({
        listing: brief(l),
        matches: matches.sort((a, b) => a.sameAuthor - b.sameAuthor || a.distance - b.distance).slice(0, 6),
        // Whoever used the photo first decides: the seller's own older listing = a duplicate
        reason: earlier.length
          ? [...earlier].sort((a, b) => (a.listing.createdAt || '').localeCompare(b.listing.createdAt || ''))[0]
              .sameAuthor
            ? 'ten-sam-sprzedawca'
            : 'inni-sprzedawcy'
          : 'internet',
        web,
      });
    }
  });
  const order = { 'inni-sprzedawcy': 0, internet: 1, 'ten-sam-sprzedawca': 2 };
  return flags.sort((a, b) => order[a.reason] - order[b.reason]);
};

// Older listings get their photos checked a few at a time while moderators use the panel
const checkSomeUncheckedPhotos = listings => {
  listings
    .filter(l => l.state === 'published' && l.imagesKey && l.photos?.obrazy !== l.imagesKey)
    .slice(0, 3)
    .forEach(l =>
      checkListingPhotos(l.id).catch(e => console.error('[refume-photos] background check:', e.message))
    );
};

const photosOk = (req, res) => {
  const listingId = uuidOf(req.body?.listingId);
  requireModerator(req, res)
    .then(async () => {
      if (!UUID_RE.test(listingId || '')) throw httpError(400, 'Invalid listingId.');
      const listing = (await showListing({ id: listingId })).data;
      const current = listing.attributes.metadata?.refumeZdjecia || {};
      await updateListing({
        id: listingId,
        metadata: { refumeZdjecia: { ...current, ok: new Date().toISOString() } },
      });
      invalidate();
      res.status(200).json({ data: { ok: true } });
    })
    .catch(e => handleError(res, e));
};

// ---------- Endpoints ----------

const getStatus = (req, res) => {
  Promise.resolve()
    .then(async () => {
      const userId = await currentUserId(req, res);
      if (!userId || !moderatorIds().includes(userId) || !isIntegrationApiConfigured()) {
        return res.status(200).json({ data: { isModerator: false } });
      }
      const [listings, users, flags] = await Promise.all([
        scanListings(),
        scanUsers(),
        readQueue().catch(() => []),
      ]);
      res.status(200).json({
        data: {
          isModerator: true,
          counts: {
            dowody: listings.filter(l => l.waitingForProof).length,
            oferty: listings.filter(isNewToReview).length + findPhotoFlags(listings).length,
            zgloszenia:
              users.reports.filter(r => r.status === 'nowe').length +
              flags.filter(f => f.status === 'nowe').length,
            odwolania: users.appeals.filter(a => a.status === 'nowe').length,
          },
        },
      });
    })
    .catch(e => handleError(res, e));
};

const getPanel = (req, res) => {
  requireModerator(req, res)
    .then(async () => {
      const [listings, users, chatFlags] = await Promise.all([
        scanListings(),
        scanUsers(),
        readQueue().catch(() => []),
      ]);
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
        ...users.badgeOverrides.map(u => ({
          kind: 'odznaki',
          at: u.zmieniono,
          reason: [
            u.szybkaWysylka ? `Szybka wysyłka: ${u.szybkaWysylka === 'tak' ? 'przyznana' : 'odebrana'}` : null,
            u.topSprzedawca ? `Top sprzedawca: ${u.topSprzedawca === 'tak' ? 'przyznana' : 'odebrana'}` : null,
            u.powod,
          ]
            .filter(Boolean)
            .join(' · '),
          user: u,
        })),
      ]
        .sort((a, b) => (b.at || '').localeCompare(a.at || ''))
        .slice(0, 150);

      const photoFlags = findPhotoFlags(listings);
      checkSomeUncheckedPhotos(listings);
      const appeals = users.appeals.sort((a, b) => (b.utworzono || '').localeCompare(a.utworzono || ''));
      res.status(200).json({
        data: { proofs, newListings, reports, history, chatFlags, photoFlags, appeals },
      });
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
            odwolanie: true,
            dedupeKey: `ukryta:${listingId}:${now}`,
            title: 'Oferta została ukryta',
            body: `Moderator ukrył Twoją ofertę „${title}”. Powód: ${reason}. Jeśli się nie zgadzasz, możesz się odwołać.`,
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
          odwolanie: true,
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
      if (
        !['oferta', 'uzytkownik', 'rozmowa'].includes(typ) ||
        !UUID_RE.test(celId || '') ||
        !REPORT_REASONS[powod]
      ) {
        throw httpError(400, 'Invalid report.');
      }
      if (!isIntegrationApiConfigured()) throw httpError(500, 'Integration API is not configured.');
      const me = (await sdk.currentUser.show()).data.data;
      const myId = me.id.uuid;

      let celNazwa = '';
      let celUzytkownikId = null;
      if (typ === 'rozmowa') {
        // Only a participant can report a conversation (the Marketplace API checks that)
        const tx = (
          await sdk.transactions.show({ id: celId, include: ['listing', 'customer', 'provider'] })
        ).data;
        const rel = tx.data.relationships || {};
        const included = tx.included || [];
        const find = (type, id) => included.find(i => i.type === type && i.id.uuid === id?.uuid);
        const isCustomer = rel.customer?.data?.id?.uuid === myId;
        const other = find('user', isCustomer ? rel.provider?.data?.id : rel.customer?.data?.id);
        const listing = find('listing', rel.listing?.data?.id);
        celUzytkownikId = other?.id?.uuid || null;
        celNazwa = `Rozmowa z użytkownikiem ${other?.attributes?.profile?.displayName || '—'}${
          listing ? ` o „${listing.attributes.title}”` : ''
        }`;
      } else if (typ === 'oferta') {
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
        ...(celUzytkownikId ? { celUzytkownikId } : {}),
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

// ---------- Editing someone's listing ----------

const NOTE_LEVELS = ['glowy', 'serca', 'bazy'];
const cleanList = (value, max, maxLen = 60) =>
  (Array.isArray(value) ? value : [])
    .map(v => clean(v, maxLen))
    .filter(Boolean)
    .slice(0, max);

// GET /api/moderacja/oferta?id=…
const getListingForEdit = (req, res) => {
  const listingId = String(req.query.id || '');
  requireModerator(req, res)
    .then(async () => {
      if (!UUID_RE.test(listingId)) throw httpError(400, 'Invalid id.');
      const shown = await showListing({
        id: listingId,
        include: 'author,images',
        'fields.image': 'variants.landscape-crop,variants.square-small2x,variants.default',
      });
      const l = shown.data;
      const included = shown.included || [];
      const author = included.find(i => i.type === 'user');
      const images = (l.relationships?.images?.data || []).map(ref => {
        const image = included.find(i => i.type === 'image' && i.id === ref.id);
        return { id: ref.id, url: imageUrl(image) };
      });
      const a = l.attributes;
      res.status(200).json({
        data: {
          id: l.id,
          state: a.state,
          title: a.title || '',
          description: a.description || '',
          price: a.price ? { amount: a.price.amount, currency: a.price.currency } : null,
          marka: a.publicData?.marka || '',
          nuty: a.publicData?.nuty || {},
          akordy: Array.isArray(a.publicData?.akordy) ? a.publicData.akordy : [],
          images,
          author: { id: author?.id, name: author?.attributes?.profile?.displayName || '' },
          edycje: a.metadata?.moderacja?.edycje || [],
          weryfikacja: a.metadata?.weryfikacja || null,
          hasProof: !!a.privateData?.dowodZakupu?.url,
        },
      });
    })
    .catch(e => handleError(res, e));
};

// POST /api/moderacja/oferta-edycja
//   { listingId, title, description, priceAmount, marka, nuty, akordy, keepImageIds, note }
const editListing = (req, res) => {
  const body = req.body || {};
  const listingId = uuidOf(body.listingId);
  requireModerator(req, res)
    .then(async moderatorId => {
      if (!UUID_RE.test(listingId || '')) throw httpError(400, 'Invalid listingId.');
      const shown = await showListing({ id: listingId, include: 'images' });
      const l = shown.data;
      const a = l.attributes;
      const currentImageIds = (l.relationships?.images?.data || []).map(r => r.id);

      const title = clean(body.title, 120);
      const description = clean(body.description, 5000);
      const priceAmount = Math.round(Number(body.priceAmount));
      if (!title) throw httpError(400, 'Title is required.');
      if (!Number.isFinite(priceAmount) || priceAmount < 100) throw httpError(400, 'Invalid price.');
      const keep = (Array.isArray(body.keepImageIds) ? body.keepImageIds : [])
        .map(uuidOf)
        .filter(id => currentImageIds.includes(id));
      if (!keep.length) throw httpError(400, 'At least one photo must stay.');

      const nuty = NOTE_LEVELS.reduce((acc, level) => {
        acc[level] = cleanList(body.nuty?.[level], 20);
        return acc;
      }, {});
      const akordy = cleanList(body.akordy, 8);
      const marka = clean(body.marka, 80);

      // What changed (for the seller and the history)
      const changed = [];
      if (title !== a.title) changed.push('tytuł');
      if (description !== (a.description || '')) changed.push('opis');
      if (priceAmount !== a.price?.amount) changed.push('cena');
      if (marka !== (a.publicData?.marka || '')) changed.push('marka');
      if (JSON.stringify(nuty) !== JSON.stringify({ glowy: a.publicData?.nuty?.glowy || [], serca: a.publicData?.nuty?.serca || [], bazy: a.publicData?.nuty?.bazy || [] })) {
        changed.push('nuty zapachowe');
      }
      if (JSON.stringify(akordy) !== JSON.stringify(a.publicData?.akordy || [])) changed.push('akordy');
      const removedPhotos = currentImageIds.length - keep.length;
      if (removedPhotos > 0) changed.push(removedPhotos === 1 ? 'usunięte 1 zdjęcie' : `usunięte zdjęcia (${removedPhotos})`);
      if (!changed.length) return res.status(200).json({ data: { ok: true, changed } });

      const now = new Date().toISOString();
      const previous = a.metadata?.moderacja || {};
      const note = clean(body.note, 400);
      await updateListing({
        id: listingId,
        title,
        description,
        price: { amount: priceAmount, currency: a.price?.currency || 'PLN' },
        images: keep,
        publicData: { marka, nuty, akordy },
        metadata: {
          moderacja: {
            ...previous,
            edycje: [{ at: now, przez: moderatorId, pola: changed, notatka: note || null }, ...(previous.edycje || [])].slice(0, 10),
          },
        },
      });

      const authorId = l.relationships?.author?.data?.id;
      if (authorId) {
        await addNotification(authorId, {
          type: 'oferta-edytowana',
          odwolanie: true,
          dedupeKey: `edycja:${listingId}:${now}`,
          title: 'Moderator poprawił Twoją ofertę',
          body: `W ofercie „${title}” zmieniono: ${changed.join(', ')}.${note ? ` ${note}` : ''}`,
          listingId,
        }).catch(() => null);
      }
      invalidate();
      res.status(200).json({ data: { ok: true, changed } });
    })
    .catch(e => handleError(res, e));
};

// ---------- Manual corrections of badges ----------

const BADGE_LABELS = { szybkaWysylka: 'Szybka wysyłka', topSprzedawca: 'Top sprzedawca' };

// GET /api/moderacja/uzytkownik?id=… — badges (automatic) and manual overrides
const getUserBadges = (req, res) => {
  const userId = String(req.query.id || '');
  requireModerator(req, res)
    .then(async () => {
      if (!UUID_RE.test(userId)) throw httpError(400, 'Invalid id.');
      const user = (await showUser({ id: userId })).data;
      const metadata = user.attributes?.profile?.metadata || {};
      res.status(200).json({
        data: {
          id: userId,
          name: user.attributes?.profile?.displayName || '',
          automatic: metadata.refumeOdznaki || null,
          override: metadata[OVERRIDE_KEY] || null,
          blocked: metadata.refumeBlokada || null,
        },
      });
    })
    .catch(e => handleError(res, e));
};

// POST /api/moderacja/odznaki-konta { userId, values: { szybkaWysylka: 'auto'|'tak'|'nie', … }, reason }
const setUserBadges = (req, res) => {
  const userId = uuidOf(req.body?.userId);
  const values = req.body?.values || {};
  const reason = clean(req.body?.reason, 300);
  requireModerator(req, res)
    .then(async moderatorId => {
      if (!UUID_RE.test(userId || '')) throw httpError(400, 'Invalid userId.');
      if (!reason) throw httpError(400, 'A reason is required.');
      const user = (await showUser({ id: userId })).data;
      const previous = user.attributes?.profile?.metadata?.[OVERRIDE_KEY] || {};
      const next = { powod: reason, przez: moderatorId, zmieniono: new Date().toISOString() };
      const changes = [];
      BADGE_KEYS.forEach(key => {
        const v = ['tak', 'nie'].includes(values[key]) ? values[key] : null;
        if (v) next[key] = v;
        if ((previous[key] || null) !== v) {
          changes.push(
            `${BADGE_LABELS[key]}: ${v === 'tak' ? 'przyznana' : v === 'nie' ? 'odebrana' : 'liczona automatycznie'}`
          );
        }
      });
      if (!changes.length) return res.status(200).json({ data: { ok: true, changes } });
      const hasAny = BADGE_KEYS.some(k => next[k]);
      await updateUserProfile({ id: userId, metadata: { [OVERRIDE_KEY]: hasAny ? next : null } });
      forgetUser(userId);
      await addNotification(userId, {
        type: 'odznaki-zmienione',
        odwolanie: true,
        dedupeKey: `odznaki:${next.zmieniono}`,
        title: 'Zmiana odznak na Twoim profilu',
        body: `Moderator poprawił odznaki: ${changes.join('; ')}. Powód: ${reason}.`,
      }).catch(() => null);
      invalidate();
      res.status(200).json({ data: { ok: true, changes } });
    })
    .catch(e => handleError(res, e));
};

// POST /api/moderacja/znacznik-oferty { listingId, verified: true|false, reason }
const setListingVerified = (req, res) => {
  const listingId = uuidOf(req.body?.listingId);
  const verified = !!req.body?.verified;
  const reason = clean(req.body?.reason, 300);
  requireModerator(req, res)
    .then(async moderatorId => {
      if (!UUID_RE.test(listingId || '')) throw httpError(400, 'Invalid listingId.');
      if (!reason) throw httpError(400, 'A reason is required.');
      const listing = (await showListing({ id: listingId })).data;
      const proof = listing.attributes.privateData?.dowodZakupu;
      const now = new Date().toISOString();
      await updateListing({
        id: listingId,
        metadata: {
          weryfikacja: {
            status: verified ? 'zweryfikowano' : 'cofnieto',
            // Tie the decision to the current proof, so it doesn't land back in the queue
            dowodUploadedAt: proof?.uploadedAt || null,
            sprawdzonoAt: now,
            reczna: true,
            przez: moderatorId,
          },
        },
        privateData: { weryfikacjaPowod: verified ? null : reason },
      });
      const authorId = listing.relationships?.author?.data?.id;
      const title = listing.attributes.title || '';
      if (authorId) {
        await addNotification(authorId, {
          type: verified ? 'znacznik-przyznany' : 'znacznik-odebrany',
          odwolanie: !verified,
          dedupeKey: `znacznik:${listingId}:${now}`,
          title: verified ? 'Oferta oznaczona jako zweryfikowana' : 'Znacznik weryfikacji usunięty',
          body: verified
            ? `Moderator oznaczył ofertę „${title}” jako „Zweryfikowano dowodem zakupu”. ${reason}`
            : `Moderator usunął znacznik „Zweryfikowano dowodem zakupu” z oferty „${title}”. Powód: ${reason}. Możesz dodać nowy dowód zakupu w edycji oferty.`,
          ...(verified ? { listingId } : { editListingId: listingId }),
        }).catch(() => null);
      }
      invalidate();
      res.status(200).json({ data: { ok: true } });
    })
    .catch(e => handleError(res, e));
};

// Moderator: handle an automatically flagged chat message
const chatFlagAction = (req, res) => {
  const { flagId, action } = req.body || {};
  requireModerator(req, res)
    .then(async moderatorId => {
      if (!flagId || !['ok', 'ostrzez', 'zablokuj'].includes(action)) {
        throw httpError(400, 'Invalid action.');
      }
      await flagAction({ flagId, action, moderatorId });
      res.status(200).json({ data: { ok: true } });
    })
    .catch(e => handleError(res, e));
};

// Moderator: messages of a reported conversation
const getConversation = (req, res) => {
  const txId = String(req.query.txId || '');
  requireModerator(req, res)
    .then(async () => {
      if (!UUID_RE.test(txId)) throw httpError(400, 'Invalid txId.');
      const shown = await showTransaction({
        id: txId,
        include: 'messages,messages.sender,listing,customer,provider',
      });
      const included = shown.included || [];
      const byKey = new Map(included.map(i => [`${i.type}/${i.id}`, i]));
      const rel = shown.data?.relationships || {};
      const customerId = rel.customer?.data?.id;
      const messages = (rel.messages?.data || [])
        .map(ref => byKey.get(`message/${ref.id}`))
        .filter(Boolean)
        .map(m => {
          const senderId = m.relationships?.sender?.data?.id;
          const sender = byKey.get(`user/${senderId}`);
          return {
            id: m.id,
            content: m.attributes?.content || '',
            createdAt: m.attributes?.createdAt,
            senderId,
            senderName: sender?.attributes?.profile?.displayName || '',
            role: senderId === customerId ? 'kupujący' : 'sprzedający',
          };
        })
        .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''))
        .slice(-200);
      const listing = byKey.get(`listing/${rel.listing?.data?.id}`);
      res.status(200).json({
        data: { listingTitle: listing?.attributes?.title || '', lastTransition: shown.data?.attributes?.lastTransition, messages },
      });
    })
    .catch(e => handleError(res, e));
};

module.exports = {
  // shared with refume-moderation-users.js
  scanListings,
  scanUsers,
  invalidate,
  requireModerator,
  photosOk,
  getUserBadges,
  setUserBadges,
  setListingVerified,
  getListingForEdit,
  editListing,
  chatFlagAction,
  getConversation,
  getStatus,
  getPanel,
  listingAction,
  userAction,
  undoProofDecision,
  reportAction,
  createReport,
  REPORT_REASONS,
};
