/**
 * Refume: perfume lookup (name → brand, concentration, gender, accords, top/middle/base notes)
 * through the Fragella API. Used by the "Znajdź perfumy" helper when creating a listing.
 *
 * GET /api/perfumy?q=sauvage
 *
 * Env: FRAGELLA_API_KEY (secret, server-only). Results are cached for 30 days in
 * server/data/fragella-cache.json (git-ignored) to save the monthly quota. Only logged-in users can search.
 */
const { getSdk, handleError } = require('../api-util/sdk');
const { searchCatalog, normalizeCatalogText } = require('../api-util/refumePerfumeCatalog');

const ENOUGH_RESULTS = 3;

const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://api.fragella.com/api/v1';
// Search results are remembered for 30 days (also across server restarts), then asked again.
const CACHE_TTL_MS = 30 * 24 * 3600 * 1000;
const CACHE_MAX = 5000;
const CACHE_FILE = path.join(__dirname, '..', 'data', 'fragella-cache.json');
const cache = new Map();

const loadCache = () => {
  try {
    const entries = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    const now = Date.now();
    entries.forEach(([key, value]) => {
      if (value && now - value.at < CACHE_TTL_MS) cache.set(key, value);
    });
  } catch (e) {
    // no cache file yet
  }
};
loadCache();

let saveTimer = null;
const saveCacheSoon = () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
      fs.writeFileSync(CACHE_FILE, JSON.stringify(Array.from(cache.entries())));
    } catch (e) {
      console.error('[refume-perfumes] cache save failed:', e.message);
    }
  }, 2000);
};

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
  // Community data, used by the AI description ("O tym zapachu")
  facts: {
    perfumers: f.perfumers || '',
    rating: f.rating || '',
    longevity: f.Longevity || '',
    sillage: f.Sillage || '',
    popularity: f.Popularity || '',
    seasons: topRanked(f['Season Ranking']),
    occasions: topRanked(f['Occasion Ranking']),
  },
});

// Two best-scored names from a ranking: [{ name, score }] → ['spring', 'summer']
function topRanked(list) {
  return Array.isArray(list)
    ? list
        .filter(r => r && r.name && Number.isFinite(Number(r.score)))
        .sort((a, b) => Number(b.score) - Number(a.score))
        .slice(0, 2)
        .map(r => String(r.name))
    : [];
}

const searchFragella = async (query, { force = false } = {}) => {
  const key = query.toLowerCase();
  const hit = cache.get(key);
  if (!force && hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return hit.data;
  }
  const url = `${BASE_URL}/fragrances?search=${encodeURIComponent(query)}&limit=10`;
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
  saveCacheSoon();
  return data;
};

// Perfume picture: saved on the listing, or from cached Fragella results
const safeImage = url =>
  typeof url === 'string' && /^https:\/\/[a-z0-9.-]*fragella\.com\//i.test(url) ? url : '';
const cachedImage = fragellaId => {
  if (!fragellaId) return '';
  for (const { data } of cache.values()) {
    const hit = (data || []).find(item => item.id === fragellaId && item.image);
    if (hit) return hit.image;
  }
  return '';
};

// Perfumes already listed on Refume (notes chosen by sellers) — our own data
const searchListings = async (sdk, query) => {
  const response = await sdk.listings.query({
    keywords: query,
    perPage: 24,
    'fields.listing': [
      'title',
      'publicData.marka',
      'publicData.nuty',
      'publicData.akordy',
      'publicData.fragellaId',
      'publicData.fragellaImage',
    ],
  });
  const seen = new Set();
  const out = [];
  (response.data.data || []).forEach(l => {
    const { title, publicData = {} } = l.attributes;
    const nuty = publicData.nuty || {};
    const hasNotes = ['glowy', 'serca', 'bazy'].some(k => (nuty[k] || []).length);
    if (!hasNotes) return;
    const key = publicData.fragellaId || normalizeCatalogText(title);
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      id: `listing-${key}`,
      name: title,
      brand: publicData.marka || '',
      year: '',
      gender: '',
      concentration: '',
      image: safeImage(publicData.fragellaImage) || cachedImage(publicData.fragellaId),
      accordsPl: Array.isArray(publicData.akordy) ? publicData.akordy : [],
      noteIds: { top: nuty.glowy || [], middle: nuty.serca || [], base: nuty.bazy || [] },
      source: 'listings',
    });
  });
  return out.slice(0, 5);
};

const dedupe = list => {
  const seen = new Set();
  return list.filter(p => {
    const k = normalizeCatalogText(`${p.brand} ${p.name}`);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

/**
 * Order: local catalog → perfumes from Refume listings → Fragella (only when the first two
 * give fewer than ENOUGH_RESULTS), so popular perfumes never use the Fragella quota.
 */
const searchPerfumes = (req, res) => {
  const query = String(req.query?.q || '').trim().slice(0, 80);
  Promise.resolve()
    .then(async () => {
      if (query.length < 3) {
        return res.status(200).json({ data: [] });
      }
      const sdk = getSdk(req, res);
      await sdk.currentUser.show(); // 401 for anonymous users

      const local = searchCatalog(query, 8);
      const fromListings = await searchListings(sdk, query).catch(() => []);
      let results = dedupe([...local, ...fromListings]);

      if (results.length < ENOUGH_RESULTS && process.env.FRAGELLA_API_KEY) {
        const remote = await searchFragella(query).catch(e => {
          console.error('[refume-perfumes] Fragella failed:', e.message);
          return [];
        });
        results = dedupe([...results, ...remote.map(r => ({ ...r, source: 'fragella' }))]);
      }
      res.status(200).json({ data: results.slice(0, 8) });
    })
    .catch(e => handleError(res, e));
};

/**
 * Fragella data of one perfume for the AI description: from the cache by id, otherwise one
 * search by name (cached like any other search). Returns null when not found.
 */
const findFragellaPerfume = async ({ fragellaId, query, title }) => {
  const byId = item => fragellaId && item.id === fragellaId;
  let cachedWithoutFacts = null;
  for (const { data } of cache.values()) {
    const hit = (data || []).find(byId);
    if (hit && hit.facts) return hit;
    if (hit) cachedWithoutFacts = hit;
  }
  if (!process.env.FRAGELLA_API_KEY || !query) return cachedWithoutFacts;
  // Results saved before community data was kept: ask Fragella again once
  const results = await searchFragella(query, { force: !!cachedWithoutFacts }).catch(() => []);
  const wanted = normalizeCatalogText(title || query);
  return (
    results.find(byId) ||
    results.find(item => {
      const name = normalizeCatalogText(item.name);
      return name && ` ${wanted} `.includes(` ${name} `);
    }) ||
    null
  );
};

module.exports = { searchPerfumes, simplify, findFragellaPerfume };
