/**
 * Refume: traces for finding linked accounts (moderation only).
 *
 * When a signed-in user opens the site, the browser calls POST /api/slad once per session.
 * The server records two keyed hashes in the user's privateData.refumeSlady:
 *   - the network address (IPv4 as is, IPv6 cut to its /64 network),
 *   - a random device id kept in an httpOnly cookie (refume_urz).
 * Raw addresses are never stored: only HMAC hashes, so the same address gives the same
 * hash, but the hash can't be turned back into an address. Entries older than 90 days
 * are dropped.
 *
 *   privateData.refumeSlady = { ip: [{ h, od, do }], urz: [{ h, od, do }] }
 *
 * The moderator user card compares these hashes between accounts (linkedAccounts).
 */
const crypto = require('crypto');
const { getSdk, handleError } = require('../api-util/sdk');
const { isIntegrationApiConfigured, updateUserProfile } = require('../api-util/refumeIntegrationApi');
const { isDbConfigured, query } = require('../api-util/refumeDb');

const TRACES_KEY = 'refumeSlady';
const DEVICE_COOKIE = 'refume_urz';
const KEEP_DAYS = 90;
const MAX_PER_KIND = 20;
const REFRESH_MS = 6 * 60 * 60 * 1000; // same user, same traces: write at most every 6 h
// An address shared by this many accounts is most likely a mobile network, school, office…
const SHARED_NETWORK_ACCOUNTS = 6;

const DAY_MS = 24 * 60 * 60 * 1000;
const DEVICE_RE = /^[0-9a-f]{32}$/;

const secret = () =>
  process.env.REFUME_TRACES_SECRET ||
  process.env.SHARETRIBE_INTEGRATION_CLIENT_SECRET ||
  process.env.SHARETRIBE_SDK_CLIENT_SECRET ||
  'refume';

const keyedHash = (kind, value) =>
  crypto
    .createHmac('sha256', secret())
    .update(`${kind}|${value}`)
    .digest('hex')
    .slice(0, 20);

// Render runs behind Cloudflare, which passes the visitor's address in its own header.
// Otherwise: req.ip when 'trust proxy' is on (server/index.js), else the first
// X-Forwarded-For address. An address used by very many accounts (e.g. a proxy) is
// marked as a shared network in linkedAccounts, so a wrong guess here stays harmless.
const firstHeader = (req, name) => {
  const v = req.headers?.[name];
  return typeof v === 'string' && v.trim() ? v.split(',')[0].trim() : null;
};
const clientNetwork = req => {
  let ip = (
    firstHeader(req, 'cf-connecting-ip') ||
    firstHeader(req, 'true-client-ip') ||
    (req.app?.get('trust proxy') ? req.ip : null) ||
    firstHeader(req, 'x-forwarded-for') ||
    req.ip ||
    req.socket?.remoteAddress ||
    ''
  ).trim();
  if (!ip) return null;
  ip = ip.replace(/^::ffff:/i, '');
  if (ip.includes(':')) {
    // IPv6: one household / phone gets a whole /64, so compare networks
    const parts = ip.split('::');
    const head = parts[0].split(':').filter(Boolean);
    const tail = parts.length > 1 ? parts[1].split(':').filter(Boolean) : [];
    const full = [...head, ...Array(Math.max(0, 8 - head.length - tail.length)).fill('0'), ...tail];
    return full
      .slice(0, 4)
      .map(p => parseInt(p, 16).toString(16))
      .join(':');
  }
  return ip;
};

const deviceId = (req, res) => {
  const current = req.cookies?.[DEVICE_COOKIE];
  if (typeof current === 'string' && DEVICE_RE.test(current)) return current;
  const created = crypto.randomBytes(16).toString('hex');
  res.cookie(DEVICE_COOKIE, created, {
    maxAge: 2 * 365 * DAY_MS,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.REACT_APP_SHARETRIBE_USING_SSL === 'true',
  });
  return created;
};

const freshEntries = list => {
  const limit = Date.now() - KEEP_DAYS * DAY_MS;
  return (Array.isArray(list) ? list : []).filter(
    e => e && typeof e.h === 'string' && new Date(e.do || e.od || 0).getTime() >= limit
  );
};

const addEntry = (list, h, now) => {
  const entries = freshEntries(list);
  const found = entries.find(e => e.h === h);
  if (found) {
    found.do = now;
  } else {
    entries.push({ h, od: now, do: now });
  }
  return entries
    .sort((a, b) => (b.do || '').localeCompare(a.do || ''))
    .slice(0, MAX_PER_KIND);
};

const lastWrite = new Map(); // userId -> { key, at }

/** POST /api/slad – record the traces of the signed-in user. */
const recordTrace = (req, res) => {
  const sdk = getSdk(req, res);
  const device = deviceId(req, res);
  const network = clientNetwork(req);
  Promise.resolve()
    .then(async () => {
      if (!isIntegrationApiConfigured()) return;
      // An operator using "log in as" must not leave their own traces on the account
      const info = await sdk.authInfo().catch(() => null);
      if (info?.isLoggedInAs) return;
      const me = (await sdk.currentUser.show()).data.data;
      const userId = me.id.uuid;
      const ipHash = network ? keyedHash('ip', network) : null;
      const deviceHash = keyedHash('urz', device);
      const key = `${ipHash}|${deviceHash}`;
      const previous = lastWrite.get(userId);
      if (previous && previous.key === key && Date.now() - previous.at < REFRESH_MS) return;

      if (isDbConfigured()) {
        const rows = [['ip', ipHash], ['urz', deviceHash]].filter(([, h]) => h);
        for (const [kind, h] of rows) {
          await query(
            `INSERT INTO refume_traces (user_id, kind, hash) VALUES ($1, $2, $3)
             ON CONFLICT (user_id, kind, hash) DO UPDATE SET last_seen = now()`,
            [userId, kind, h]
          );
        }
        lastWrite.set(userId, { key, at: Date.now() });
        return;
      }

      const now = new Date().toISOString();
      const traces = me.attributes?.profile?.privateData?.[TRACES_KEY] || {};
      const next = {
        ip: ipHash ? addEntry(traces.ip, ipHash, now) : freshEntries(traces.ip),
        urz: addEntry(traces.urz, deviceHash, now),
      };
      await updateUserProfile({ id: userId, privateData: { [TRACES_KEY]: next } });
      lastWrite.set(userId, { key, at: Date.now() });
      if (lastWrite.size > 20000) lastWrite.clear();
    })
    .then(() => res.status(204).end())
    .catch(e => {
      // Not signed in: nothing to record
      if (e?.status === 401 || e?.status === 403) return res.status(204).end();
      return handleError(res, e);
    });
};

/**
 * Accounts that share a network address or a device with the given user.
 *
 * @param {string} userId
 * @param {Array} users scanUsers().users, each with `slady`
 * @returns {{ summary: Object, linked: Array }}
 */
const linkedAccounts = (userId, users) => {
  const me = users.find(u => u.id === userId);
  const mine = {
    ip: freshEntries(me?.slady?.ip),
    urz: freshEntries(me?.slady?.urz),
  };
  const summary = {
    sieci: mine.ip.length,
    urzadzenia: mine.urz.length,
    ostatnio: [...mine.ip, ...mine.urz].reduce((m, e) => (e.do > m ? e.do : m), '') || null,
  };
  if (!mine.ip.length && !mine.urz.length) return { summary, linked: [] };

  // How many accounts use each hash (to spot public / mobile networks)
  const accountsPerHash = new Map();
  users.forEach(u => {
    ['ip', 'urz'].forEach(kind =>
      freshEntries(u.slady?.[kind]).forEach(e => {
        const k = `${kind}|${e.h}`;
        accountsPerHash.set(k, (accountsPerHash.get(k) || 0) + 1);
      })
    );
  });

  const linked = [];
  users.forEach(u => {
    if (u.id === userId || !u.slady) return;
    const shared = [];
    ['urz', 'ip'].forEach(kind => {
      const theirs = freshEntries(u.slady[kind]);
      mine[kind].forEach(e => {
        const other = theirs.find(t => t.h === e.h);
        if (!other) return;
        const accounts = accountsPerHash.get(`${kind}|${e.h}`) || 2;
        shared.push({
          typ: kind === 'urz' ? 'urzadzenie' : 'siec',
          // when each account was seen there
          ja: { od: e.od, do: e.do },
          oni: { od: other.od, do: other.do },
          kont: accounts,
          wspolnaSiec: kind === 'ip' && accounts >= SHARED_NETWORK_ACCOUNTS,
        });
      });
    });
    if (!shared.length) return;
    const device = shared.some(s => s.typ === 'urzadzenie');
    const strongNetworks = shared.filter(s => s.typ === 'siec' && !s.wspolnaSiec).length;
    linked.push({
      id: u.id,
      name: u.name,
      email: u.email,
      createdAt: u.createdAt,
      banned: u.banned,
      deleted: u.deleted,
      blocked: u.blocked,
      sila: device ? 'wysoka' : strongNetworks >= 2 ? 'srednia' : strongNetworks ? 'niska' : 'slaba',
      wspolne: shared,
    });
  });
  const order = { wysoka: 0, srednia: 1, niska: 2, slaba: 3 };
  linked.sort((a, b) => order[a.sila] - order[b.sila] || b.wspolne.length - a.wspolne.length);
  return { summary, linked: linked.slice(0, 50) };
};

/**
 * Same as linkedAccounts, from the database when there is one. Traces saved earlier in
 * privateData are added too, so nothing recorded before the database is lost.
 */
const linkedAccountsFor = async (userId, users) => {
  if (!isDbConfigured()) return linkedAccounts(userId, users);
  const since = `${KEEP_DAYS} days`;
  const mine = await query(
    `SELECT kind, hash FROM refume_traces WHERE user_id = $1 AND last_seen > now() - $2::interval`,
    [userId, since]
  );
  const hashes = mine.rows.map(r => r.hash);
  const related = hashes.length
    ? await query(
        `SELECT user_id, kind, hash, first_seen, last_seen FROM refume_traces
         WHERE hash = ANY($1) AND last_seen > now() - $2::interval`,
        [hashes, since]
      )
    : { rows: [] };
  // Rows → the privateData shape, merged with what privateData still holds
  const byUser = new Map(users.map(u => [u.id, { ...u, slady: { ip: [...(u.slady?.ip || [])], urz: [...(u.slady?.urz || [])] } }]));
  related.rows.forEach(r => {
    const u = byUser.get(r.user_id);
    if (!u) return;
    const list = u.slady[r.kind] || (u.slady[r.kind] = []);
    if (!list.some(e => e.h === r.hash)) {
      list.push({ h: r.hash, od: new Date(r.first_seen).toISOString(), do: new Date(r.last_seen).toISOString() });
    }
  });
  // Count of accounts per address needs every account with that hash, which `related` has
  return linkedAccounts(userId, Array.from(byUser.values()));
};

/** Removes traces older than KEEP_DAYS (database only; privateData entries expire on read). */
const purgeOldTraces = () =>
  isDbConfigured()
    ? query(`DELETE FROM refume_traces WHERE last_seen < now() - $1::interval`, [`${KEEP_DAYS} days`])
    : Promise.resolve();

module.exports = { recordTrace, linkedAccounts, linkedAccountsFor, purgeOldTraces, TRACES_KEY, clientNetwork };
