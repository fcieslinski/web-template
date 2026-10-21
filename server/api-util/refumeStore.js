/**
 * Refume: moderation lists (notes, chat flags, private dispute messages, open bundles).
 *
 * With DATABASE_URL: kept in Postgres (refume_store), no size limit. The first time a list
 * is read from the database, what was saved before in the first moderator's privateData is
 * copied over (privateData is left as it was, as a backup).
 * Without DATABASE_URL: the first moderator's privateData, as before.
 *
 * Every change goes through withList, one at a time per list, so concurrent requests
 * don't overwrite each other.
 */
const { isDbConfigured, query } = require('./refumeDb');
const { showUser, updateUserProfile } = require('./refumeIntegrationApi');

const ownerId = () =>
  (process.env.REFUME_MODERATOR_USER_IDS || '')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean)[0] || null;

const fromPrivateData = async key => {
  const owner = ownerId();
  if (!owner) return [];
  const shown = await showUser({ id: owner });
  const list = shown.data?.attributes?.profile?.privateData?.[key];
  return Array.isArray(list) ? list : [];
};

const readList = async key => {
  if (!isDbConfigured()) return fromPrivateData(key);
  const found = await query('SELECT value FROM refume_store WHERE key = $1', [key]);
  if (found.rows.length) {
    const value = found.rows[0].value;
    return Array.isArray(value) ? value : [];
  }
  // First use of the database: bring over what was kept with the moderator
  const legacy = await fromPrivateData(key).catch(() => []);
  await query(
    'INSERT INTO refume_store (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING',
    [key, JSON.stringify(legacy)]
  );
  return legacy;
};

const writeList = async (key, list) => {
  if (!isDbConfigured()) {
    const owner = ownerId();
    if (!owner) throw new Error('REFUME_MODERATOR_USER_IDS is not set.');
    await updateUserProfile({ id: owner, privateData: { [key]: list } });
    return;
  }
  await query(
    `INSERT INTO refume_store (key, value, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, JSON.stringify(list)]
  );
};

const locks = new Map();

/**
 * Reads the list, calls fn(list) and saves what it returns (when it's a new array).
 * `max` limits the saved list (privateData has a size limit; the database a much larger one).
 */
const withList = (key, fn, { max, maxWithDb } = {}) => {
  const previous = locks.get(key) || Promise.resolve();
  const run = previous.then(async () => {
    const list = await readList(key);
    const next = await fn(list);
    if (Array.isArray(next) && next !== list) {
      const limit = isDbConfigured() ? maxWithDb || max : max;
      await writeList(key, limit ? next.slice(0, limit) : next);
    }
    return next;
  });
  locks.set(key, run.catch(() => null));
  return run;
};

module.exports = { readList, withList, isDbConfigured };
