/**
 * Refume: build the local perfume catalog from a one-off export (e.g. Apify JSON or CSV→JSON).
 *
 *   node scripts/refume-import-perfumes.js ~/Downloads/dataset.json
 *
 * Writes server/data/perfumes.json (ignored by git — keep it local). Field names are detected
 * automatically; notes are translated to Refume's Polish note ids, unknown notes are dropped.
 */
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'server', 'data', 'perfumes.json');

const pick = (obj, keys) => {
  for (const key of keys) {
    const parts = key.split('.');
    let v = obj;
    for (const p of parts) v = v == null ? undefined : v[p];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
};

const toList = v =>
  (Array.isArray(v)
    ? v.map(x => (typeof x === 'string' ? x : x?.name || x?.title || x?.note || ''))
    : typeof v === 'string'
    ? v.split(/[,;|]/)
    : []
  )
    .map(s => String(s).trim())
    .filter(Boolean);

const toNumber = v => {
  const n = Number(String(v ?? '').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

const normalizeGender = g => {
  const s = String(g || '').toLowerCase();
  if (/unisex|for women and men|women and men/.test(s)) return 'unisex';
  if (/women|female|her\b|femme/.test(s)) return 'women';
  if (/men|male|him\b|homme/.test(s)) return 'men';
  return '';
};

const main = async () => {
  const file = process.argv[2];
  if (!file) {
    console.error('Użycie: node scripts/refume-import-perfumes.js <plik.json>');
    process.exit(1);
  }
  const notesLib = await import(path.join(__dirname, '..', 'src', 'util', 'refumeNotes.js'));
  const brandsLib = await import(path.join(__dirname, '..', 'src', 'util', 'refumeBrands.js'));
  // "Lattafa Perfumes" → "Lattafa", "Christian Dior" → "Dior", "dior" → "Dior"
  const cleanBrand = b => {
    const direct = brandsLib.canonicalBrand(b);
    if (brandsLib.isKnownBrand(direct)) return direct;
    return brandsLib.canonicalBrand(b.replace(/\s+(perfumes?|parfums?|fragrances?|paris|london)$/i, ''));
  };
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const rows = Array.isArray(raw) ? raw : raw.items || raw.data || raw.results || [];
  console.log(`Wczytano rekordów: ${rows.length}`);

  const seen = new Set();
  const unknownNotes = new Map();
  const out = [];

  rows.forEach(r => {
    const name = String(pick(r, ['name', 'perfumeName', 'perfume', 'title', 'Name']) || '').trim();
    const brand = cleanBrand(
      String(pick(r, ['brand', 'brandName', 'designer', 'house', 'Brand', 'company']) || '').trim()
    );
    if (!name || !brand) return;

    const notesTop = toList(pick(r, ['topNotes', 'top_notes', 'notes.top', 'notes.Top', 'Notes.Top', 'top']));
    const notesMid = toList(
      pick(r, ['middleNotes', 'heartNotes', 'middle_notes', 'heart_notes', 'notes.middle', 'notes.heart', 'notes.Middle', 'Notes.Middle', 'middle', 'heart'])
    );
    const notesBase = toList(pick(r, ['baseNotes', 'base_notes', 'notes.base', 'notes.Base', 'Notes.Base', 'base']));
    const notesFlat = toList(pick(r, ['notes', 'generalNotes', 'General Notes', 'allNotes']));

    const translate = list => {
      const ids = [];
      list.forEach(n => {
        const id = notesLib.matchNote(n);
        if (id) {
          if (!ids.includes(id)) ids.push(id);
        } else {
          unknownNotes.set(n, (unknownNotes.get(n) || 0) + 1);
        }
      });
      return ids;
    };

    const hasPyramid = notesTop.length || notesMid.length || notesBase.length;
    const entry = {
      id: `${brand}-${name}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      name,
      brand,
      year: String(pick(r, ['year', 'releaseYear', 'launchYear', 'Year']) || ''),
      gender: normalizeGender(pick(r, ['gender', 'Gender', 'for', 'target'])),
      concentration: String(pick(r, ['concentration', 'oilType', 'OilType', 'type']) || ''),
      image: String(pick(r, ['image', 'imageUrl', 'image_url', 'Image URL', 'thumbnail']) || ''),
      popularity: toNumber(pick(r, ['ratingCount', 'votes', 'reviewsCount', 'ratingsCount', 'rating_count', 'popularity'])),
      accordsPl: toList(pick(r, ['accords', 'mainAccords', 'main_accords', 'Main Accords']))
        .map(notesLib.translateAccord)
        .filter(Boolean)
        .slice(0, 6),
      noteIds: hasPyramid
        ? { top: translate(notesTop), middle: translate(notesMid), base: translate(notesBase) }
        : { top: translate(notesFlat), middle: [], base: [] },
    };
    if (seen.has(entry.id)) return;
    seen.add(entry.id);
    out.push(entry);
  });

  out.sort((a, b) => b.popularity - a.popularity);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log(`Zapisano perfum: ${out.length} → ${OUT}`);

  const topUnknown = Array.from(unknownNotes.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 40);
  if (topUnknown.length) {
    console.log('\nNajczęstsze nuty spoza słownika (warto dopisać do src/util/refumeNotes.js):');
    topUnknown.forEach(([n, c]) => console.log(`  ${c}× ${n}`));
  }
};

main().catch(e => {
  console.error(e);
  process.exit(1);
});
