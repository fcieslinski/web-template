/**
 * Refume: is the current user a moderator, and how much is waiting in the panel.
 * Asked from the server (REFUME_MODERATOR_USER_IDS) at most once a minute per user.
 */
import { useEffect, useState } from 'react';
import { fetchModerationStatus } from './api';

const REFRESH_MS = 60 * 1000;
let cache = { userId: null, at: 0, promise: null, value: null };

const load = userId => {
  const fresh = cache.userId === userId && Date.now() - cache.at < REFRESH_MS;
  if (fresh && (cache.value || cache.promise)) {
    return cache.value ? Promise.resolve(cache.value) : cache.promise;
  }
  const promise = fetchModerationStatus()
    .then(r => r?.data || { isModerator: false })
    .catch(() => ({ isModerator: false }))
    .then(value => {
      if (cache.promise === promise) cache = { ...cache, value, promise: null };
      return value;
    });
  cache = { userId, at: Date.now(), promise, value: null };
  return promise;
};

/** @returns {{ isModerator: boolean, total: number }} */
export const useModerationStatus = userId => {
  const [status, setStatus] = useState({ isModerator: false, total: 0 });
  useEffect(() => {
    if (!userId) {
      setStatus({ isModerator: false, total: 0 });
      return;
    }
    let cancelled = false;
    load(userId).then(value => {
      if (cancelled) return;
      const counts = value?.counts || {};
      setStatus({
        isModerator: !!value?.isModerator,
        total:
          (counts.dowody || 0) +
          (counts.oferty || 0) +
          (counts.zgloszenia || 0) +
          (counts.odwolania || 0),
      });
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);
  return status;
};
