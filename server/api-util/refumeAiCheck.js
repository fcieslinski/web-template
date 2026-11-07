/**
 * Refume: checks an AI perfume description against the data it was written from, so made-up
 * details (notes the perfume doesn't have, names, years, who it's for) never reach the page.
 *
 * findUnsupported(text, { title, input, perfume }) -> ['wiśnia', 'Saed', ...] (empty = OK)
 *
 * The checks are deliberately simple and strict: a description that fails is written again,
 * and if it fails twice the listing shows no description at all.
 */
const fs = require('fs');
const path = require('path');

const LETTER = 'a-ząćęłńóśźż';

let dictionary = null;
// [{ id, en: ['cherry', 'sour cherry'], pl: ['wiśnia', 'czereśnia'] }]
const loadDictionary = () => {
  if (dictionary) return dictionary;
  dictionary = [];
  try {
    const source = fs.readFileSync(
      path.join(__dirname, '..', '..', 'src', 'util', 'refumeNotes.js'),
      'utf8'
    );
    const raw = source.split('const RAW = `')[1]?.split('`')[0] || '';
    raw
      .trim()
      .split('\n')
      .forEach(line => {
        const [id, en = '', pl = '', aliases = ''] = line.split('|').map(s => (s || '').trim());
        if (!id || !pl) return;
        dictionary.push({
          id,
          en: en
            .split(',')
            .map(s => s.trim().toLowerCase())
            .filter(Boolean),
          pl: [pl, ...aliases.split(',')].map(s => s.trim().toLowerCase()).filter(Boolean),
        });
      });
  } catch (e) {
    console.error('[refume-ai-check] note dictionary not loaded:', e.message);
  }
  return dictionary;
};

// Rough Polish stem, enough to catch inflected forms ("wiśnia" → "wiśn" matches "wiśni", "wiśnią")
const stem = word => {
  const w = word.toLowerCase();
  if (w.length > 6) return w.slice(0, -2);
  if (w.length > 4) return w.slice(0, -1);
  return w;
};

const words = text =>
  String(text || '')
    .toLowerCase()
    .split(new RegExp(`[^${LETTER}0-9]+`))
    .filter(Boolean);

const mentions = (lowerText, s) =>
  s.length >= 4 && new RegExp(`(^|[^${LETTER}])${s}`).test(lowerText);

const GENDER_WORDS = {
  women: ['damsk', 'kobiet', 'dla pań'],
  men: ['męsk', 'mężczyzn', 'dla panów'],
  unisex: ['unisex', 'uniseks'],
};

/** Things in the text that the data doesn't support. */
const findUnsupported = (text, { title = '', input, perfume }) => {
  const problems = [];
  const lower = String(text || '').toLowerCase();
  const dict = loadDictionary();
  const f = perfume?.facts || {};

  // --- 1. Notes: every note named in the text must be among the perfume's notes or accords
  const inputIds = new Set([...input.nuty.glowy, ...input.nuty.serca, ...input.nuty.bazy]);
  const accordWords = new Set(input.akordy.flatMap(words));
  const titleWords = new Set(words(`${title} ${input.marka}`));
  const allowedStems = new Set();
  dict.forEach(entry => {
    const allowed =
      inputIds.has(entry.id) ||
      entry.en.some(name => words(name).some(w => accordWords.has(w))) ||
      entry.pl.some(name => words(name).some(w => titleWords.has(w)));
    if (allowed) entry.pl.forEach(name => words(name).forEach(w => allowedStems.add(stem(w))));
  });
  input.akordy.forEach(a => words(a).forEach(w => allowedStems.add(stem(w))));
  dict.forEach(entry => {
    entry.pl.forEach(name => {
      const ws = words(name);
      // Only single-word note names: "wiśnia", "piżmo", "tytoń" (multi-word ones are too vague)
      if (ws.length !== 1 || ws[0].startsWith('nut')) return;
      const s = stem(ws[0]);
      if (!allowedStems.has(s) && mentions(lower, s)) problems.push(ws[0]);
    });
  });

  // --- 2. Years: only the release year from the data
  (String(text).match(/\b(19|20)\d{2}\b/g) || []).forEach(y => {
    if (String(perfume?.year || '') !== y) problems.push(y);
  });

  // --- 3. Names: capitalised words inside a sentence must come from the data
  const known = new Set(words(`${title} ${input.marka} ${f.perfumers || ''}`));
  const sentences = String(text).split(/(?<=[.!?])\s+/);
  sentences.forEach(sentence => {
    const tokens = sentence.split(/\s+/).slice(1); // the first word is capitalised anyway
    tokens.forEach(token => {
      const clean = token.replace(new RegExp(`[^${LETTER}A-ZĄĆĘŁŃÓŚŹŻ0-9-]`, 'gi'), '');
      if (
        /^[A-ZĄĆĘŁŃÓŚŹŻ]/.test(clean) &&
        !known.has(clean.toLowerCase()) &&
        !allowedStems.has(stem(clean))
      ) {
        problems.push(clean);
      }
    });
  });

  // --- 4. Who it's for: only when the data says so, and only what it says
  const gender = (perfume?.gender || '').toLowerCase();
  Object.entries(GENDER_WORDS).forEach(([g, list]) => {
    if (g === gender) return;
    list.forEach(w => {
      if (lower.includes(w)) problems.push(w);
    });
  });

  return Array.from(new Set(problems));
};

module.exports = { findUnsupported };
