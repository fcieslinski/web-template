/**
 * Refume: short AI description of a perfume ("O tym zapachu"), 3–4 sentences in Polish,
 * written only from the listing's brand, name, concentration, notes and accords.
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

const META_KEY = 'refumeOpisAI';
const DEFAULT_MODELS = ['gemini-3.5-flash-lite', 'gemini-flash-latest'];
const MAX_PER_MINUTE = 8; // stay well inside the free tier
const MAX_LENGTH = 700;
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
  'Jesteś redaktorem polskiego serwisu z perfumami. Piszesz krótki, rzeczowy opis zapachu',
  'dla kupujących na podstawie podanych danych.',
  'Zasady:',
  '- Dokładnie 3 albo 4 zdania, razem najwyżej 600 znaków, po polsku, zwykłym tekstem',
  '  (bez nagłówków, list, cudzysłowów i emoji).',
  '- Opisz charakter zapachu i jak się rozwija (otwarcie, serce, baza), komu i na jaką porę',
  '  roku lub okazję może pasować.',
  '- Opieraj się wyłącznie na podanych nutach i akordach. Nie wymyślaj faktów: nie podawaj',
  '  trwałości, projekcji, roku premiery, perfumiarza, ceny ani porównań do innych perfum.',
  '- Bez przesadnych zachwytów i słów typu „idealny”, „najlepszy”, „must-have”.',
  '- Nie wspominaj o stanie flakonu, sprzedającym ani o tym, że to oferta.',
].join('\n');

const buildPrompt = (title, input) => {
  const list = ids => (ids.length ? ids.map(noteName).join(', ') : '—');
  return [
    `Perfumy: ${title}`,
    input.marka ? `Marka: ${input.marka}` : null,
    input.stezenie ? `Stężenie: ${input.stezenie}` : null,
    `Nuty głowy: ${list(input.nuty.glowy)}`,
    `Nuty serca: ${list(input.nuty.serca)}`,
    `Nuty bazy: ${list(input.nuty.bazy)}`,
    `Główne akordy: ${input.akordy.length ? input.akordy.join(', ') : '—'}`,
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
        generationConfig: { temperature: 0.6, maxOutputTokens: 2048 },
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
          const job = generate(buildPrompt(title, input))
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
