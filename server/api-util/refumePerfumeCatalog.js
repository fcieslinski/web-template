/**
 * Refume: local perfume catalog (server/data/perfumes.json, built by
 * scripts/refume-import-perfumes.js). Loaded once, searched in memory.
 */
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'data', 'perfumes.json');
let catalog = null;

const normalize = s =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const load = () => {
  if (catalog) return catalog;
  try {
    const list = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    catalog = list.map(p => ({ ...p, _key: normalize(`${p.brand} ${p.name}`), _name: normalize(p.name) }));
    console.log(`[refume] perfume catalog: ${catalog.length} entries`);
  } catch (e) {
    catalog = [];
  }
  return catalog;
};

/** Every query word must appear; name-prefix matches and popular perfumes first. */
const searchCatalog = (query, limit = 8) => {
  const words = normalize(query).split(' ').filter(Boolean);
  if (!words.length) return [];
  const hits = [];
  for (const p of load()) {
    if (words.every(w => p._key.includes(w))) {
      const score =
        (p._name.startsWith(words[0]) ? 2 : 0) + (p._key.startsWith(words[0]) ? 1 : 0);
      hits.push({ p, score });
    }
  }
  hits.sort((a, b) => b.score - a.score || (b.p.popularity || 0) - (a.p.popularity || 0));
  return hits.slice(0, limit).map(({ p }) => {
    const { _key, _name, popularity, ...rest } = p;
    return { ...rest, source: 'refume' };
  });
};

module.exports = { searchCatalog, normalizeCatalogText: normalize };
