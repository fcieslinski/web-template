/**
 * Refume: perfume lookup (name → brand, concentration, gender, accords, top/middle/base notes)
 * through the Fragella API. Used by the "Znajdź perfumy" helper when creating a listing.
 *
 * GET /api/perfumy?q=sauvage
 *
 * Env: FRAGELLA_API_KEY (secret, server-only). Results are cached in memory for 24 h to save
 * the monthly quota. Only logged-in users can search.
 */
const { getSdk, handleError } = require('../api-util/sdk');

const BASE_URL = 'https://api.fragella.com/api/v1';
const CACHE_TTL_MS = 24 * 3600 * 1000;
const CACHE_MAX = 2000;
const cache = new Map();

const httpError = (status, message) =>
  Object.assign(new Error(message), { status, statusText: message, data: {} });

// Notes come either as [{ name, imageUrl }] or as a comma-separated string
const toNoteList = value =>
  (Array.isArray(value)
    ? value.map(v => (typeof v === 'string' ? v : v?.name))
    : typeof value === 'string'
    ? value.split(',')
    : []
  )
    .map(s => (s || '').trim())
    .filter(Boolean);

const simplify = f => ({
  id: f._id || `${f.Brand}-${f.Name}`,
  name: f.Name || '',
  brand: f.Brand || '',
  year: f.Year || '',
  gender: (f.Gender || '').toLowerCase(),
  concentration: f.OilType || '',
  image: f['Image URL Transparent'] || f['Image URL'] || '',
  accords: Array.isArray(f['Main Accords']) ? f['Main Accords'].slice(0, 6) : [],
  notes: {
    top: toNoteList(f.Notes?.Top),
    middle: toNoteList(f.Notes?.Middle),
    base: toNoteList(f.Notes?.Base),
    general: toNoteList(f['General Notes']),
  },
});

const searchFragella = async query => {
  const key = query.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return hit.data;
  }
  const url = `${BASE_URL}/fragrances?search=${encodeURIComponent(query)}&limit=8`;
  const res = await fetch(url, { headers: { 'x-api-key': process.env.FRAGELLA_API_KEY } });
  if (res.status === 404) {
    return [];
  }
  if (!res.ok) {
    throw httpError(res.status === 429 ? 429 : 502, `Fragella error ${res.status}`);
  }
  const json = await res.json();
  const list = Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : [];
  const data = list.map(simplify);
  if (cache.size >= CACHE_MAX) {
    cache.delete(cache.keys().next().value);
  }
  cache.set(key, { at: Date.now(), data });
  return data;
};

const searchPerfumes = (req, res) => {
  const query = String(req.query?.q || '').trim().slice(0, 80);
  Promise.resolve()
    .then(async () => {
      if (!process.env.FRAGELLA_API_KEY) {
        throw httpError(503, 'Perfume lookup is not configured.');
      }
      if (query.length < 3) {
        return res.status(200).json({ data: [] });
      }
      await getSdk(req, res).currentUser.show(); // 401 for anonymous users
      const data = await searchFragella(query);
      res.status(200).json({ data });
    })
    .catch(e => handleError(res, e));
};

module.exports = { searchPerfumes, simplify };
