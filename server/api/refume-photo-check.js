/**
 * Refume: photo checks for listings.
 *
 * 1. Fingerprints (pHash) of every photo are saved in listing metadata, so the moderator panel
 *    can find the same photo in other listings (other sellers = suspicious).
 * 2. Optional: the first photo is looked up on the internet with Google Cloud Vision
 *    "web detection" (env GOOGLE_VISION_API_KEY). Matches on other websites suggest a photo
 *    copied from a shop or another marketplace.
 *
 * metadata.refumeZdjecia = {
 *   obrazy: 'imageId,imageId',            // which photos were checked
 *   hashes: [{ imageId, hash }],
 *   web: { strony: [{ url, title }], pelne: n } | null,
 *   sprawdzono: ISO date,
 *   ok: ISO date | null                    // moderator marked the photos as fine
 * }
 *
 * POST /api/zdjecia/sprawdz { listingId } — the seller (after publishing/editing) or a moderator
 */
const { getSdk, handleError } = require('../api-util/sdk');
const {
  isIntegrationApiConfigured,
  showListing,
  updateListing,
} = require('../api-util/refumeIntegrationApi');
const { pHashFromJpeg, isUsableHash } = require('../api-util/refumeImageHash');

const META_KEY = 'refumeZdjecia';
const MAX_IMAGES = 8;
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuidOf = id => (typeof id === 'string' ? id : id?.uuid);
const httpError = (status, message) =>
  Object.assign(new Error(message), { status, statusText: message, data: {} });

const moderatorIds = () =>
  (process.env.REFUME_MODERATOR_USER_IDS || '')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean);

const VARIANTS = ['square-small2x', 'scaled-small', 'landscape-crop', 'default'];
const variantUrl = image => {
  const variants = image?.attributes?.variants || {};
  const name = VARIANTS.find(v => variants[v]?.url) || Object.keys(variants)[0];
  return name ? variants[name].url : null;
};

const fetchJpeg = async url => {
  const res = await fetch(url, { headers: { Accept: 'image/jpeg' } });
  if (!res.ok) throw new Error(`image HTTP ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length > MAX_IMAGE_BYTES) throw new Error('image too large');
  return buffer;
};

// Google Cloud Vision: is this photo published elsewhere on the internet?
const OWN_HOSTS = /(^|\.)(refume\.pl|sharetribe\.com|imgix\.net|localhost)$/i;
const webDetection = async imageUrl => {
  const key = process.env.GOOGLE_VISION_API_KEY;
  if (!key || !imageUrl) return null;
  const res = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [{ image: { source: { imageUri: imageUrl } }, features: [{ type: 'WEB_DETECTION', maxResults: 10 }] }],
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message || `Vision HTTP ${res.status}`);
  const web = json?.responses?.[0]?.webDetection || {};
  const hostOf = url => {
    try {
      return new URL(url).hostname;
    } catch (e) {
      return '';
    }
  };
  const strony = (web.pagesWithMatchingImages || [])
    .filter(p => p.url && !OWN_HOSTS.test(hostOf(p.url)))
    .slice(0, 5)
    .map(p => ({ url: p.url, title: String(p.pageTitle || '').replace(/<[^>]+>/g, '').slice(0, 120) }));
  const pelne = (web.fullMatchingImages || []).filter(i => !OWN_HOSTS.test(hostOf(i.url))).length;
  return { strony, pelne };
};

const running = new Map();

/** Checks a listing's photos (skips when the same photos were checked before). */
const checkListingPhotos = listingId => {
  if (running.has(listingId)) return running.get(listingId);
  const job = (async () => {
    const shown = await showListing({
      id: listingId,
      include: 'images',
      'fields.image': 'variants.square-small2x,variants.scaled-small,variants.landscape-crop,variants.default',
    });
    const listing = shown.data;
    const imageRefs = (listing.relationships?.images?.data || []).slice(0, MAX_IMAGES);
    const key = imageRefs.map(r => r.id).join(',');
    const previous = listing.attributes.metadata?.[META_KEY];
    if (previous?.obrazy === key) return previous;

    const included = shown.included || [];
    const hashes = [];
    for (const ref of imageRefs) {
      const image = included.find(i => i.type === 'image' && i.id === ref.id);
      const url = variantUrl(image);
      if (!url) continue;
      try {
        const hash = pHashFromJpeg(await fetchJpeg(url));
        if (isUsableHash(hash)) hashes.push({ imageId: ref.id, hash });
      } catch (e) {
        console.error(`[refume-photos] ${listingId} image skipped:`, e.message);
      }
    }

    let web = null;
    const firstImage = included.find(i => i.type === 'image' && i.id === imageRefs[0]?.id);
    const bigUrl = firstImage?.attributes?.variants?.default?.url || variantUrl(firstImage);
    web = await webDetection(bigUrl).catch(e => {
      console.error('[refume-photos] web detection failed:', e.message);
      return null;
    });

    const value = {
      obrazy: key,
      hashes,
      web,
      sprawdzono: new Date().toISOString(),
      // New photos need a new look from the moderator
      ok: null,
    };
    await updateListing({ id: listingId, metadata: { [META_KEY]: value } });
    console.log(
      `[refume-photos] ${listingId}: ${hashes.length} photo(s)` +
        (web ? `, internet matches: ${web.strony.length} page(s)` : '')
    );
    return value;
  })().finally(() => running.delete(listingId));
  running.set(listingId, job);
  return job;
};

const requestPhotoCheck = (req, res) => {
  const listingId = uuidOf(req.body?.listingId);
  const sdk = getSdk(req, res);
  Promise.resolve()
    .then(async () => {
      if (!UUID_RE.test(listingId || '')) throw httpError(400, 'Invalid listingId.');
      if (!isIntegrationApiConfigured()) return res.status(200).json({ data: { checked: false } });
      const me = (await sdk.currentUser.show()).data.data;
      const listing = (await showListing({ id: listingId })).data;
      const isAuthor = listing.relationships?.author?.data?.id === me.id.uuid;
      if (!isAuthor && !moderatorIds().includes(me.id.uuid)) throw httpError(403, 'Not allowed.');
      // Answer right away; the check runs in the background
      checkListingPhotos(listingId).catch(e => console.error('[refume-photos] check failed:', e.message));
      res.status(200).json({ data: { checked: true } });
    })
    .catch(e => handleError(res, e));
};

module.exports = { requestPhotoCheck, checkListingPhotos, PHOTO_META_KEY: META_KEY };
