/**
 * Refume: short AI description of a perfume ("O tym zapachu"), 3–4 sentences in Polish:
 * what it is (year, perfumer, standing), how the notes work together, when to wear it and
 * what users say. Based on the listing (brand, name, notes, accords) and Fragella community
 * data (year, perfumer, rating, longevity, sillage, popularity, seasons, occasions).
 *
 * GET /api/opis-ai?listingId=…
 *
 * Generated once per perfume and saved:
 *   - in listing metadata:  metadata.refumeOpisAI = { tekst, klucz, model, utworzono }
 *   - in server/data/ai-descriptions.json (reused by other listings of the same perfume)
 *
 * Provider: Google Gemini (GEMINI_API_KEY, optional GEMINI_MODEL). Without a key the
 * endpoint returns no description and the page shows nothing.
 */
const fs = require('fs');
const path = require('path');
const { handleError } = require('../api-util/sdk');
const {
  isIntegrationApiConfigured,
  showListing,
  updateListing,
} = require('../api-util/refumeIntegrationApi');
const { aiInputOf, aiInputKey, hasEnoughForAi } = require('../api-util/refumeAiInput');
const { findFragellaPerfume } = require('./refume-perfumes');

const META_KEY = 'refumeOpisAI';
const DEFAULT_MODELS = ['gemini-3.5-flash-lite', 'gemini-flash-latest'];
const MAX_PER_MINUTE = 8; // stay well inside the free tier
const MAX_LENGTH = 800;
const CACHE_FILE = path.join(__dirname, '..', 'data', 'ai-descriptions.json');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const httpError = (status, message) =>
  Object.assign(new Error(message), { status, statusText: message, data: {} });

// ---------- Polish note names (read from the browser dictionary) ----------

let noteLabels = null;
const loadNoteLabels = () => {
  if (noteLabels) return noteLabels;
  noteLabels = new Map();
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
        const [id, , pl] = line.split('|');
        if (id && pl) noteLabels.set(id.trim(), pl.trim());
      });
  } catch (e) {
    console.error('[refume-ai] note dictionary not loaded:', e.message);
  }
  return noteLabels;
};
const noteName = id => loadNoteLabels().get(id) || String(id).replace(/-/g, ' ');

// ---------- Cache on disk (per perfume) ----------

let fileCache = null;
const readCache = () => {
  if (fileCache) return fileCache;
  try {
    fileCache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  } catch (e) {
    fileCache = {};
  }
  return fileCache;
};
const writeCache = (key, value) => {
  const cache = readCache();
  cache[key] = value;
  try {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
  } catch (e) {
    console.error('[refume-ai] cache not saved:', e.message);
  }
};

// ---------- Gemini ----------

const SYSTEM_PROMPT = [
  'Jesteś redaktorem polskiego serwisu z perfumami. Piszesz krótką notkę o perfumach dla',
  'kupujących, konkretnie i ciekawie, jak w dobrym magazynie o zapachach.',
  '',
  'Struktura: 4 zdania, razem najwyżej 650 znaków, po polsku, zwykłym tekstem.',
  '1. Czym jest ten zapach: rok premiery, perfumiarz i jego pozycja (np. klasyk, bestseller).',
  '2. Kompozycja: jak połączenie konkretnych nut tworzy charakter zapachu',
  '   (np. „połączenie bergamotki i ambroksanu daje…”).',
  '3. Kiedy i dla kogo: pory roku i okazje.',
  '4. Co mówią użytkownicy: odbiór na podstawie oceny społeczności, trwałości i projekcji',
  '   (np. „Użytkownicy szczególnie doceniają jego trwałość…”).',
  '',
  'Zasady dotyczące faktów:',
  '- Dane w sekcji „Dane” są sprawdzone, korzystaj z nich.',
  '- Nagrody, historię powstania i ciekawostki dodawaj tylko wtedy, gdy to powszechnie znany',
  '  fakt o bardzo znanym zapachu i masz co do niego pewność. W razie wątpliwości pomiń.',
  '  Nigdy nie zgaduj lat, nazwisk ani nagród.',
  '- Słów „kultowy” lub „ikoniczny” używaj tylko przy wysokiej popularności albo dla',
  '  powszechnie uznanego klasyka.',
  '- Jeśli brakuje danych do któregoś zdania, pomiń je zamiast zmyślać (wtedy 3 zdania).',
  '- Nie podawaj ceny, nie porównuj z innymi perfumami, nie wspominaj o ofercie, sprzedającym,',
  '  stanie flakonu ani o źródłach danych.',
  '- Bez emoji, nagłówków, list, cudzysłowów wokół całego tekstu i wykrzykników.',
].join('\n');

const buildPrompt = (title, input, perfume) => {
  const list = ids => (ids.length ? ids.map(noteName).join(', ') : '—');
  const f = perfume?.facts || {};
  const facts = [
    perfume?.year ? `Rok premiery: ${perfume.year}` : null,
    f.perfumers ? `Perfumiarz: ${f.perfumers.replace(/;\s*/g, ', ')}` : null,
    perfume?.gender ? `Dla: ${perfume.gender}` : null,
    f.popularity ? `Popularność (dane społeczności, po angielsku): ${f.popularity}` : null,
    f.rating ? `Średnia ocena społeczności: ${f.rating}/5` : null,
    f.longevity ? `Trwałość wg użytkowników (po angielsku): ${f.longevity}` : null,
    f.sillage ? `Projekcja wg użytkowników (po angielsku): ${f.sillage}` : null,
    f.seasons?.length ? `Najlepsze pory roku (po angielsku): ${f.seasons.join(', ')}` : null,
    f.occasions?.length ? `Najlepsze okazje (po angielsku): ${f.occasions.join(', ')}` : null,
  ].filter(Boolean);
  return [
    'Dane:',
    `Perfumy: ${title}`,
    input.marka ? `Marka: ${input.marka}` : null,
    input.stezenie ? `Stężenie: ${input.stezenie}` : null,
    `Nuty głowy: ${list(input.nuty.glowy)}`,
    `Nuty serca: ${list(input.nuty.serca)}`,
    `Nuty bazy: ${list(input.nuty.bazy)}`,
    `Główne akordy: ${input.akordy.length ? input.akordy.join(', ') : '—'}`,
    ...facts,
  ]
    .filter(Boolean)
    .join('\n');
};

const cleanText = text =>
  String(text || '')
    .replace(/[*#_`>]/g, '')
    .replace(/^\s*[-•]\s*/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_LENGTH);

const callGemini = async (model, prompt) => {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model
    )}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': process.env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.5, maxOutputTokens: 2048 },
      }),
    }
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = json?.error?.message || `HTTP ${res.status}`;
    throw Object.assign(new Error(message), { status: res.status });
  }
  const parts = json?.candidates?.[0]?.content?.parts || [];
  return cleanText(
    parts
      .filter(p => !p.thought)
      .map(p => p.text || '')
      .join(' ')
  );
};

let recentCalls = [];
const generate = async prompt => {
  const now = Date.now();
  recentCalls = recentCalls.filter(t => now - t < 60 * 1000);
  if (recentCalls.length >= MAX_PER_MINUTE) {
    throw httpError(429, 'Too many AI descriptions right now.');
  }
  recentCalls.push(now);
  const models = process.env.GEMINI_MODEL ? [process.env.GEMINI_MODEL] : DEFAULT_MODELS;
  let lastError = null;
  for (const model of models) {
    try {
      const text = await callGemini(model, prompt);
      if (text.length >= 80) return { text, model };
      lastError = new Error('Too short answer.');
    } catch (e) {
      lastError = e;
      // Unknown model → try the next one; other errors stop here
      if (e.status !== 404 && e.status !== 400) break;
    }
  }
  throw lastError || new Error('AI description failed.');
};

// ---------- Endpoint ----------

const running = new Map(); // key -> Promise

const getAiDescription = (req, res) => {
  const listingId = String(req.query.listingId || '');
  Promise.resolve()
    .then(async () => {
      if (!UUID_RE.test(listingId)) throw httpError(400, 'Invalid listingId.');
      if (!isIntegrationApiConfigured()) throw httpError(500, 'Integration API is not configured.');

      const listing = (await showListing({ id: listingId })).data;
      if (!listing || listing.attributes.state !== 'published') {
        return res.status(200).json({ data: null });
      }
      const { title, publicData = {}, metadata = {} } = listing.attributes;
      const input = aiInputOf(publicData);
      if (!hasEnoughForAi(input)) {
        return res.status(200).json({ data: null });
      }
      const key = aiInputKey(title, input);
      const saved = metadata[META_KEY];
      if (saved?.klucz === key && saved?.tekst) {
        return res.status(200).json({ data: saved });
      }

      // Same perfume described before (any listing)?
      let result = readCache()[key];
      if (!result) {
        if (!process.env.GEMINI_API_KEY) {
          return res.status(200).json({ data: null });
        }
        if (!running.has(key)) {
          const job = findFragellaPerfume({
            fragellaId: publicData.fragellaId,
            query: title,
            title,
          })
            .catch(() => null)
            .then(perfume => generate(buildPrompt(title, input, perfume)))
            .then(({ text, model }) => {
              const value = { tekst: text, klucz: key, model, utworzono: new Date().toISOString() };
              writeCache(key, value);
              console.log(`[refume-ai] described "${title}" (${model})`);
              return value;
            })
            .finally(() => running.delete(key));
          running.set(key, job);
        }
        result = await running.get(key);
      }

      await updateListing({ id: listingId, metadata: { [META_KEY]: result } }).catch(e =>
        console.error('[refume-ai] not saved on listing:', e.message)
      );
      res.status(200).json({ data: result });
    })
    .catch(e => {
      if (e.status === 429 || (e.status && e.status >= 400 && !e.data)) {
        console.error('[refume-ai] generation failed:', e.message);
        return res.status(200).json({ data: null });
      }
      handleError(res, e);
    });
};

module.exports = { getAiDescription };
