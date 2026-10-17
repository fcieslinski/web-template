/**
 * Refume: moderation of proof-of-purchase photos.
 *
 * Data model (keep in sync with src/util/refumeVerification.js):
 * - listing privateData.dowodZakupu = { imageId, url, uploadedAt }  — written by the seller
 * - listing privateData.weryfikacjaPowod = rejection reason          — written here (seller-only)
 * - listing metadata.weryfikacja = { status, dowodUploadedAt, sprawdzonoAt } — written here
 *     status: 'zweryfikowano' | 'odrzucono'. Public: drives the "verified" badge.
 *
 * A proof is waiting for review when it exists and the last decision was made for a
 * different upload (or there is no decision yet). Re-uploading after a rejection
 * therefore puts the listing back into the queue automatically.
 *
 * Only users listed in REFUME_MODERATOR_USER_IDS (comma-separated user UUIDs) may call these.
 */
const { getSdk, handleError } = require('../api-util/sdk');
const {
  isIntegrationApiConfigured,
  queryListings,
  showListing,
  updateListing,
} = require('../api-util/refumeIntegrationApi');
const { sendEmail, proofDecisionEmail } = require('../api-util/refumeEmail');

const MAX_PAGES = 20; // up to 2000 listings scanned per request
const MAX_REASON_LENGTH = 500;

const moderatorIds = () =>
  (process.env.REFUME_MODERATOR_USER_IDS || '')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean);

const httpError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  error.statusText = message;
  error.data = {};
  return error;
};

// Resolves when the logged-in user is a moderator; rejects with 401/403 otherwise.
const requireModerator = (req, res) =>
  getSdk(req, res)
    .currentUser.show()
    .then(response => {
      const userId = response?.data?.data?.id?.uuid;
      if (!userId || !moderatorIds().includes(userId)) {
        throw httpError(403, 'Not a moderator.');
      }
      if (!isIntegrationApiConfigured()) {
        throw httpError(500, 'Integration API credentials are missing (see .env).');
      }
      return userId;
    })
    .catch(e => {
      if (e.status === 403 || e.status === 500) {
        throw e;
      }
      throw httpError(401, 'Log in as a moderator.');
    });

const isWaitingForReview = attributes => {
  const proof = attributes?.privateData?.dowodZakupu;
  const decision = attributes?.metadata?.weryfikacja;
  return !!proof?.url && (!decision || decision.dowodUploadedAt !== proof.uploadedAt);
};

const authorName = (listing, included) => {
  const authorId = listing.relationships?.author?.data?.id;
  const author = (included || []).find(i => i.type === 'user' && i.id === authorId);
  return author?.attributes?.profile?.displayName || '';
};

// GET /api/moderacja/dowody — listings whose proof of purchase waits for review
const listPendingProofs = (req, res) => {
  requireModerator(req, res)
    .then(async () => {
      const pending = [];
      for (let page = 1; page <= MAX_PAGES; page++) {
        const result = await queryListings({ page, perPage: 100, include: 'author' });
        (result.data || []).forEach(listing => {
          if (isWaitingForReview(listing.attributes)) {
            const { title, state, privateData, metadata } = listing.attributes;
            pending.push({
              id: listing.id,
              title,
              state,
              author: authorName(listing, result.included),
              proofUrl: privateData.dowodZakupu.url,
              uploadedAt: privateData.dowodZakupu.uploadedAt,
              previousStatus: metadata?.weryfikacja?.status || null,
              previousReason: privateData.weryfikacjaPowod || null,
            });
          }
        });
        const totalPages = result.meta?.totalPages || 1;
        if (page >= totalPages) {
          break;
        }
      }
      pending.sort((a, b) => (a.uploadedAt || '').localeCompare(b.uploadedAt || ''));
      res.status(200).json({ data: pending });
    })
    .catch(e => handleError(res, e));
};

// POST /api/moderacja/decyzja — body: { listingId, decision: 'approve' | 'reject', reason? }
const notifySeller = async (shown, isApproved, reason) => {
  const listing = shown?.data;
  const authorId = listing?.relationships?.author?.data?.id;
  const author = (shown?.included || []).find(i => i.type === 'user' && i.id === authorId);
  const email = author?.attributes?.email;
  if (!email) {
    return false;
  }
  const rootUrl = (process.env.REACT_APP_MARKETPLACE_ROOT_URL || '').replace(/\/$/, '');
  const listingId = listing.id;
  const editUrl = isApproved
    ? `${rootUrl}/l/${listingId}`
    : `${rootUrl}/l/listing/${listingId}/edit/photos`;
  const content = proofDecisionEmail({
    sellerName: author.attributes?.profile?.firstName,
    listingTitle: listing.attributes?.title || '',
    isApproved,
    reason,
    editUrl,
  });
  const result = await sendEmail({ to: email, ...content });
  return !result?.skipped;
};

const decideProof = (req, res) => {
  const { listingId, decision, reason } = req.body || {};
  const trimmedReason = typeof reason === 'string' ? reason.trim() : '';

  requireModerator(req, res)
    .then(async () => {
      if (!listingId || !['approve', 'reject'].includes(decision)) {
        throw httpError(400, 'Invalid decision.');
      }
      if (decision === 'reject' && !trimmedReason) {
        throw httpError(400, 'A reason is required when rejecting.');
      }
      if (trimmedReason.length > MAX_REASON_LENGTH) {
        throw httpError(400, 'Reason is too long.');
      }

      // Read the current proof on the server, so the decision applies to the reviewed upload
      const shown = await showListing({ id: listingId, include: 'author' });
      const proof = shown?.data?.attributes?.privateData?.dowodZakupu;
      if (!proof?.url) {
        throw httpError(400, 'Listing has no proof of purchase.');
      }

      const isApproved = decision === 'approve';
      await updateListing({
        id: listingId,
        metadata: {
          weryfikacja: {
            status: isApproved ? 'zweryfikowano' : 'odrzucono',
            dowodUploadedAt: proof.uploadedAt,
            sprawdzonoAt: new Date().toISOString(),
          },
        },
        privateData: { weryfikacjaPowod: isApproved ? null : trimmedReason },
      });
      // Notify the seller. A failed email must not undo the decision.
      const emailSent = await notifySeller(shown, isApproved, trimmedReason).catch(e => {
        console.error('[refume-moderation] seller email failed:', e.message);
        return false;
      });
      res.status(200).json({ data: { listingId, decision, emailSent } });
    })
    .catch(e => handleError(res, e));
};

module.exports = { listPendingProofs, decideProof, isWaitingForReview };
