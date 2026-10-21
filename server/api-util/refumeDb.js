/**
 * Refume: own Postgres database (Neon) for data that doesn't belong in Sharetribe:
 * moderation lists, account traces and caches. Accounts, listings, orders and messages
 * stay in Sharetribe.
 *
 * Env: DATABASE_URL (secret, server-only). Without it everything falls back to the old
 * storage (first moderator's privateData, files in server/data), so the app still runs.
 *
 * Tables (created automatically):
 *   refume_store  (key, value jsonb)                      moderation lists
 *   refume_traces (user_id, kind, hash, first_seen, last_seen)  linked-account traces
 *   refume_cache  (ns, key, value jsonb, updated_at)       Fragella results, AI descriptions
 */
let Pool = null;
try {
  // eslint-disable-next-line global-require
  ({ Pool } = require('pg'));
} catch (e) {
  Pool = null;
}

const isDbConfigured = () => !!process.env.DATABASE_URL && !!Pool;

let pool = null;
const getPool = () => {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 30000,
      // Neon wakes up from sleep in a moment; give it time
      connectionTimeoutMillis: 15000,
    });
    pool.on('error', e => console.error('[refume-db] pool error:', e.message));
  }
  return pool;
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS refume_store (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS refume_traces (
  user_id text NOT NULL,
  kind text NOT NULL,
  hash text NOT NULL,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, kind, hash)
);
CREATE INDEX IF NOT EXISTS refume_traces_hash ON refume_traces (kind, hash);
CREATE INDEX IF NOT EXISTS refume_traces_seen ON refume_traces (last_seen);
CREATE TABLE IF NOT EXISTS refume_secrets (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS refume_shipments (
  tx_id text PRIMARY KEY,
  status text NOT NULL,
  package_id text,
  waybill text,
  carrier text,
  tracking_url text,
  state text,
  error text,
  attempts int NOT NULL DEFAULT 0,
  next_try_at timestamptz,
  order_uuid text,
  events jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS refume_shipments_package ON refume_shipments (package_id);
CREATE INDEX IF NOT EXISTS refume_shipments_status ON refume_shipments (status);
CREATE TABLE IF NOT EXISTS refume_cache (
  ns text NOT NULL,
  key text NOT NULL,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ns, key)
);
`;

let ready = null;
const ensureSchema = () => {
  if (!ready) {
    ready = getPool()
      .query(SCHEMA)
      .then(() => console.log('[refume-db] connected'))
      .catch(e => {
        ready = null; // try again next time
        throw e;
      });
  }
  return ready;
};

/** Runs a query after the tables exist. */
const query = async (text, params) => {
  await ensureSchema();
  return getPool().query(text, params);
};

// ---------- Cache (survives restarts and new deploys, unlike files on Render) ----------

/** All entries of a namespace not older than maxAgeMs: [[key, value, updatedAtMs]]. */
const cacheLoad = async (ns, maxAgeMs) => {
  if (!isDbConfigured()) return [];
  const result = await query(
    `SELECT key, value, updated_at FROM refume_cache
     WHERE ns = $1 AND ($2::bigint IS NULL OR updated_at > now() - ($2::bigint * interval '1 millisecond'))`,
    [ns, maxAgeMs || null]
  );
  return result.rows.map(r => [r.key, r.value, new Date(r.updated_at).getTime()]);
};

const cacheSet = (ns, key, value) =>
  isDbConfigured()
    ? query(
        `INSERT INTO refume_cache (ns, key, value, updated_at) VALUES ($1, $2, $3, now())
         ON CONFLICT (ns, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [ns, key, JSON.stringify(value)]
      ).catch(e => console.error(`[refume-db] cache ${ns} not saved:`, e.message))
    : Promise.resolve();

/** Copies entries saved in a local file into the database, without overwriting. */
const cacheSeed = async (ns, entries) => {
  if (!isDbConfigured() || !entries.length) return;
  for (const [key, value, atMs] of entries) {
    await query(
      `INSERT INTO refume_cache (ns, key, value, updated_at) VALUES ($1, $2, $3, to_timestamp($4 / 1000.0))
       ON CONFLICT (ns, key) DO NOTHING`,
      [ns, key, JSON.stringify(value), atMs || Date.now()]
    );
  }
};

/** Runs fn(client) inside a transaction; rolls back when it throws. */
const withTransaction = async fn => {
  await ensureSchema();
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => null);
    throw e;
  } finally {
    client.release();
  }
};

module.exports = { isDbConfigured, query, ensureSchema, cacheLoad, cacheSet, cacheSeed, withTransaction };
