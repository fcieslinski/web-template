/**
 * Refume: what the AI perfume description is based on, and a short key of it.
 * The same code lives in src/util/refumeAiInput.js — keep both in sync, so the browser can
 * tell whether the saved description still matches the listing.
 */
const NOTE_LEVELS = ['glowy', 'serca', 'bazy'];

const aiInputOf = publicData => {
  const pd = publicData || {};
  const nuty = pd.nuty || {};
  return {
    marka: String(pd.marka || '').trim(),
    stezenie: String(pd.stezenie || '').trim(),
    nuty: NOTE_LEVELS.reduce((acc, level) => {
      acc[level] = Array.isArray(nuty[level]) ? nuty[level].map(String).slice(0, 12) : [];
      return acc;
    }, {}),
    akordy: Array.isArray(pd.akordy) ? pd.akordy.map(String).slice(0, 8) : [],
  };
};

const hasEnoughForAi = input =>
  input.nuty.glowy.length + input.nuty.serca.length + input.nuty.bazy.length + input.akordy.length >=
  3;

// djb2 over a stable string — short and identical in Node and the browser
const aiInputKey = (title, input) => {
  const text = JSON.stringify([
    String(title || '').trim(),
    input.marka,
    input.stezenie,
    input.nuty.glowy,
    input.nuty.serca,
    input.nuty.bazy,
    input.akordy,
  ]);
  let hash = 5381;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  }
  return `v3-${(hash >>> 0).toString(36)}`;
};

module.exports = { aiInputOf, aiInputKey, hasEnoughForAi };
