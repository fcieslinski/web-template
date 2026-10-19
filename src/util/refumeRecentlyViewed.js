/**
 * Refume: "Ostatnio oglądane" — listing uuids kept in this browser only (localStorage).
 * Storage may be unavailable (private mode, blocked site data), so every access is guarded.
 */
const STORAGE_KEY = 'refume:ostatnioOgladane';
const MAX_ITEMS = 20;
const EVENT = 'refume:recently-viewed';

export const getRecentlyViewed = () => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const ids = raw ? JSON.parse(raw) : [];
    return Array.isArray(ids) ? ids.filter(id => typeof id === 'string') : [];
  } catch (e) {
    return [];
  }
};

const save = ids => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
    window.dispatchEvent(new Event(EVENT));
  } catch (e) {
    // ignore
  }
};

export const addRecentlyViewed = uuid => {
  if (!uuid) return;
  save([uuid, ...getRecentlyViewed().filter(id => id !== uuid)].slice(0, MAX_ITEMS));
};

export const clearRecentlyViewed = () => save([]);

export const RECENTLY_VIEWED_EVENT = EVENT;
