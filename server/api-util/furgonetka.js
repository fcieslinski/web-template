/**
 * Refume: client of the Furgonetka.pl REST API (one Refume account buys every label).
 *
 * Env (server only):
 *   FURGONETKA_ENV            'sandbox' (default) or 'production'
 *   FURGONETKA_CLIENT_ID      OAuth application of the Refume account
 *   FURGONETKA_CLIENT_SECRET
 *
 * The account is connected once with `node scripts/furgonetka-connect.js` (login and password
 * typed in the terminal, never stored). Only the token is kept, encrypted, in the database
 * (refume_secrets). Refresh tokens are single use and rotate, so a refresh runs under a
 * database lock and the new pair is saved before anything else.
 *
 * Notes from the API (checked by others on the sandbox, 2026-09):
 *   - versions by media type: v2 for packages and tracking, v1 for the rest;
 *   - ordering is a command: PUT /order-commands/{uuid}, then GET it until it's finished;
 *   - GET /packages/{id}/label is 204 while the label isn't ready;
 *   - a successful refresh kills the old access token at once (a request in flight gets 401).
 */
const crypto = require('crypto');
const { isDbConfigured, query, withTransaction } = require('./refumeDb');

const TOKEN_KEY = 'furgonetkaToken';
const SKEW_MS = 5 * 60 * 1000; // refresh a little before the token expires

const env = () => (process.env.FURGONETKA_ENV === 'production' ? 'production' : 'sandbox');
const baseUrl = () =>
  // FURGONETKA_API_URL only for local tests against a fake API
  process.env.FURGONETKA_API_URL ||
  (env() === 'production' ? 'https://api.furgonetka.pl' : 'https://api.sandbox.furgonetka.pl');
const panelUrl = () =>
  env() === 'production' ? 'https://furgonetka.pl' : 'https://sandbox.furgonetka.pl';

const isFurgonetkaConfigured = () =>
  !!process.env.FURGONETKA_CLIENT_ID && !!process.env.FURGONETKA_CLIENT_SECRET && isDbConfigured();

const httpError = (status, message, data) =>
  Object.assign(new Error(message), { status, statusText: message, data: data || {} });

// ---------- Token storage (encrypted with a key derived from the client secret) ----------

const cipherKey = () =>
  crypto
    .createHash('sha256')
    .update(`refume-furgonetka|${process.env.FURGONETKA_CLIENT_SECRET || ''}`)
    .digest();

const seal = obj => {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', cipherKey(), iv);
  const data = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), data].map(b => b.toString('base64')).join('.');
};
const unseal = text => {
  try {
    const [iv, tag, data] = String(text)
      .split('.')
      .map(p => Buffer.from(p, 'base64'));
    const d = crypto.createDecipheriv('aes-256-gcm', cipherKey(), iv);
    d.setAuthTag(tag);
    return JSON.parse(Buffer.concat([d.update(data), d.final()]).toString('utf8'));
  } catch (e) {
    return null; // other secret / other app: treat as not connected
  }
};

const readToken = async (client = { query }) => {
  const r = await client.query('SELECT value FROM refume_secrets WHERE key = $1', [TOKEN_KEY]);
  const token = r.rows.length ? unseal(r.rows[0].value) : null;
  // A token belongs to one environment and one application
  if (!token || token.env !== env() || token.clientId !== process.env.FURGONETKA_CLIENT_ID) return null;
  return token;
};

const saveToken = (client, json) => {
  const token = {
    env: env(),
    clientId: process.env.FURGONETKA_CLIENT_ID,
    access: json.access_token,
    refresh: json.refresh_token || null,
    expiresAt: Date.now() + (Number(json.expires_in) || 3600) * 1000,
    savedAt: new Date().toISOString(),
  };
  return client
    .query(
      `INSERT INTO refume_secrets (key, value, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [TOKEN_KEY, seal(token)]
    )
    .then(() => token);
};

// ---------- OAuth ----------

const tokenRequest = async (path, fields) => {
  const basic = Buffer.from(
    `${process.env.FURGONETKA_CLIENT_ID}:${process.env.FURGONETKA_CLIENT_SECRET}`
  ).toString('base64');
  const res = await fetch(`${baseUrl()}/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams(fields).toString(),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    // Never include what was sent (it may hold a password)
    throw httpError(res.status || 500, json.error_description || json.message || json.error || 'Token request failed', {
      error: json.error,
      hint: json.hint,
    });
  }
  return json;
};

/** First connection (terminal script): password grant, then optionally two-factor. */
const connectWithPassword = async (username, password) => {
  const json = await tokenRequest('oauth/token', {
    grant_type: 'password',
    scope: 'api',
    username,
    password,
  });
  return withTransaction(client => saveToken(client, json));
};
const connectWithTwoFactor = async (hint, username, code) => {
  const json = await tokenRequest('oauth/2fa', { uuid: hint, identifier: username, twoFactorCode: code });
  return withTransaction(client => saveToken(client, json));
};

/**
 * A valid access token. `force` refreshes even when the stored one looks valid (after a 401).
 * The lock makes sure only one refresh happens at a time, also across server instances.
 */
const accessToken = async ({ force = false, failedToken = null } = {}) => {
  const current = await readToken();
  if (!current) throw httpError(503, 'Furgonetka is not connected. Run scripts/furgonetka-connect.js.');
  if (!force && current.expiresAt - SKEW_MS > Date.now()) return current.access;

  return withTransaction(async client => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [TOKEN_KEY]);
    const fresh = await readToken(client);
    if (!fresh) throw httpError(503, 'Furgonetka is not connected.');
    // Someone else refreshed meanwhile
    if (fresh.access !== (failedToken || current.access) && fresh.expiresAt - SKEW_MS > Date.now()) {
      return fresh.access;
    }
    if (!fresh.refresh) throw httpError(503, 'Furgonetka token expired. Run scripts/furgonetka-connect.js again.');
    const json = await tokenRequest('oauth/token', { grant_type: 'refresh_token', refresh_token: fresh.refresh });
    const saved = await saveToken(client, json);
    return saved.access;
  });
};

// ---------- REST ----------

/**
 * One API call. `version` picks the media type (2 for packages and tracking).
 * Answers { status, json, buffer, contentType }.
 */
const call = async (method, path, { body, version = 1, raw = false, retried = false } = {}) => {
  const token = await accessToken();
  const media = `application/vnd.furgonetka.v${version}+json`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: raw ? `application/pdf, text/plain, ${media}` : media,
    'X-Language': 'pl_PL',
  };
  if (body !== undefined) headers['Content-Type'] = media;
  const res = await fetch(`${baseUrl()}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && !retried) {
    await accessToken({ force: true, failedToken: token });
    return call(method, path, { body, version, raw, retried: true });
  }
  const contentType = res.headers.get('content-type') || '';
  if (raw && res.ok && !contentType.includes('json')) {
    return { status: res.status, buffer: Buffer.from(await res.arrayBuffer()), contentType };
  }
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (e) {
    json = null;
  }
  if (!res.ok) {
    const first = Array.isArray(json?.errors) ? json.errors[0] : json;
    const message = first?.message || `Furgonetka error ${res.status}`;
    throw httpError(res.status, message, { errors: json?.errors || (json ? [json] : []) });
  }
  return { status: res.status, json };
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

/** Services (contracts) of the account: [{ id, service, name, ... }] */
const listServices = async () => (await call('GET', '/account/services')).json?.services || [];

const validatePackage = async pkg => {
  const r = await call('POST', '/packages/validate', { body: pkg, version: 2 });
  if (r.status === 204) return [];
  return r.json?.errors || [];
};

const createPackage = async pkg => (await call('POST', '/packages', { body: pkg, version: 2 })).json;
const getPackage = async id => (await call('GET', `/packages/${encodeURIComponent(id)}`, { version: 2 })).json;
const deletePackage = id => call('DELETE', `/packages/${encodeURIComponent(id)}`);

/** Orders the packages and waits (up to ~30 s) for the command to finish. */
const orderPackages = async (packageIds, uuid) => {
  const id = uuid || crypto.randomUUID();
  try {
    await call('PUT', `/order-commands/${id}`, {
      body: { packages: packageIds.map(p => ({ id: String(p) })), label: { file_format: 'pdf', page_format: 'a6' } },
    });
  } catch (e) {
    // Same UUID again (retry after a network error): read the result instead
    const exists = (e.data?.errors || []).some(x => x.code === 'commandExists');
    if (!exists) throw e;
  }
  for (let i = 0; i < 15; i++) {
    const r = (await call('GET', `/order-commands/${id}`)).json || {};
    if (['successful', 'partial_success', 'error', 'cancelled'].includes(r.status)) return { uuid: id, ...r };
    await sleep(2000);
  }
  return { uuid: id, status: 'running' };
};

/** Label file (PDF). null while it isn't ready (204). */
const getLabel = async id => {
  const r = await call('GET', `/packages/${encodeURIComponent(id)}/label?label[page_format]=a6`, { raw: true });
  if (r.status === 204 || !r.buffer?.length) return null;
  return { buffer: r.buffer, contentType: r.contentType || 'application/pdf' };
};

/** Tracking: { parcels: { [waybill]: { tracking: [{ state, status, datetime, branch }], additionalInfoTracking } } } */
const getTracking = async id =>
  (await call('GET', `/packages/${encodeURIComponent(id)}/tracking`, { version: 2 })).json || {};

/** Sandbox only: replaces the history with a simulated state (e.g. 'collected', 'delivered'). */
const simulateTracking = (packageId, waybill, state) => {
  if (env() !== 'sandbox') throw httpError(400, 'Simulation exists only on the sandbox.');
  return call('PUT', '/packages/tracking/simulate', {
    body: { packages_id: Number(packageId), package_no: waybill, tracking_state: state },
  });
};

/** Cancels an ordered package (possible until it's in transit). */
const cancelPackage = async id => {
  const uuid = crypto.randomUUID();
  await call('PUT', `/cancel-command/${uuid}`, { body: { packages: [{ id: String(id) }] } });
  for (let i = 0; i < 10; i++) {
    const r = (await call('GET', `/cancel-command/${uuid}`)).json || {};
    if (['successful', 'partial_success', 'error', 'cancelled'].includes(r.status)) return r;
    await sleep(2000);
  }
  return { status: 'running' };
};

/**
 * Checks a webhook notification. Furgonetka's checksum (not a signature):
 * md5(package_id . package_no . partner_order_id . state . description . datetime . branch . token)
 */
const verifyWebhook = (n, secret) => {
  if (!n || !secret || typeof n.control !== 'string') return false;
  const t = n.tracking || {};
  const expected = crypto
    .createHash('md5')
    .update(
      `${n.package_id ?? ''}${n.package_no ?? ''}${n.partner_order_id ?? ''}${t.state ?? ''}${t.description ?? ''}${
        t.datetime ?? ''
      }${t.branch ?? ''}${secret}`
    )
    .digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(n.control.toLowerCase());
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

module.exports = {
  env,
  panelUrl,
  isFurgonetkaConfigured,
  connectWithPassword,
  connectWithTwoFactor,
  readToken,
  listServices,
  validatePackage,
  createPackage,
  getPackage,
  deletePackage,
  orderPackages,
  getLabel,
  getTracking,
  simulateTracking,
  cancelPackage,
  verifyWebhook,
};
