/**
 * Refume: how long moderation data is kept (RODO).
 *
 *   - account traces (IP / device): 90 days (refume-traces),
 *   - handled chat flags: 1 year, open ones until handled,
 *   - moderator notes: 3 years,
 *   - deleted accounts: their traces, notes and chat flags are removed
 *     (right away when deleted on Refume, at the next daily run when deleted in Console).
 * Private dispute messages belong to the order record and are kept like the order.
 */
const { withList } = require('./refumeStore');
const { isDbConfigured, query } = require('./refumeDb');

const DAY_MS = 24 * 60 * 60 * 1000;
const FLAG_KEEP_MS = 365 * DAY_MS;
const NOTE_KEEP_MS = 3 * 365 * DAY_MS;
const NOTES_KEY = 'refumeNotatki';
const FLAGS_KEY = 'refumeFlagiCzatu';

const hasModerator = () => !!(process.env.REFUME_MODERATOR_USER_IDS || '').trim();
const olderThan = (iso, ms) => !!iso && Date.now() - new Date(iso).getTime() > ms;

// Only save when something was removed
const filterList = (key, keep) =>
  withList(key, list => {
    const next = list.filter(keep);
    return next.length === list.length ? list : next;
  });

/** Removes moderation data about the given accounts. */
const purgeUsers = async userIds => {
  const ids = new Set(userIds.filter(Boolean));
  if (!ids.size) return;
  if (isDbConfigured()) {
    await query('DELETE FROM refume_traces WHERE user_id = ANY($1)', [Array.from(ids)]);
  }
  if (!hasModerator()) return;
  await filterList(NOTES_KEY, n => !ids.has(n.userId));
  await filterList(FLAGS_KEY, f => !ids.has(f.senderId));
};

const dailyCleanup = async () => {
  // eslint-disable-next-line global-require
  const { purgeOldTraces } = require('../api/refume-traces');
  await purgeOldTraces();
  if (!hasModerator()) return;
  await filterList(FLAGS_KEY, f => f.status === 'nowe' || !olderThan(f.utworzono, FLAG_KEEP_MS));
  await filterList(NOTES_KEY, n => !olderThan(n.utworzono, NOTE_KEEP_MS));
  // Accounts deleted in Console (or before this ran)
  // eslint-disable-next-line global-require
  const { scanUsers } = require('../api/refume-moderation-panel');
  const { users } = await scanUsers();
  // The scan stops at 5000 accounts; with more, "not found" wouldn't mean "deleted"
  if (!users.length || users.length >= 4900) return;
  const existing = new Set(users.filter(u => !u.deleted).map(u => u.id));
  // eslint-disable-next-line global-require
  const { readList } = require('./refumeStore');
  const mentioned = new Set([
    ...(await readList(NOTES_KEY)).map(n => n.userId),
    ...(await readList(FLAGS_KEY)).map(f => f.senderId),
  ]);
  if (isDbConfigured()) {
    (await query('SELECT DISTINCT user_id FROM refume_traces')).rows.forEach(r => mentioned.add(r.user_id));
  }
  await purgeUsers(Array.from(mentioned).filter(id => id && !existing.has(id)));
};

let started = false;
const startRetention = () => {
  if (started) return;
  started = true;
  const run = () =>
    dailyCleanup().catch(e => console.error('[refume-retention] cleanup failed:', e.message));
  setTimeout(run, 60 * 1000).unref?.();
  setInterval(run, DAY_MS).unref?.();
};

module.exports = { purgeUsers, dailyCleanup, startRetention };
