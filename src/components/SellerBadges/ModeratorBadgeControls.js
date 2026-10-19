import React, { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';

import { fetchUserForModeration, setUserBadgesAsModerator } from '../../util/api';
import { useModerationStatus } from '../../util/refumeModeration';
import { SELLER_BADGES } from '../../util/refumeBadges';
import { refreshSellerBadges } from './SellerBadges';

import css from './ModeratorBadgeControls.module.css';

/**
 * Refume: on a profile, moderators can correct the seller's badges by hand
 * (automatic / given / taken away), with a reason the seller will see.
 */
const ModeratorBadgeControls = ({ userId }) => {
  const viewerId = useSelector(state => state.user?.currentUser?.id?.uuid);
  const { isModerator } = useModerationStatus(viewerId);
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [values, setValues] = useState({});
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const load = () =>
    fetchUserForModeration(userId)
      .then(r => {
        const d = r?.data || null;
        setData(d);
        setValues(
          SELLER_BADGES.reduce((acc, b) => ({ ...acc, [b.key]: d?.override?.[b.key] || 'auto' }), {})
        );
      })
      .catch(() => setMessage({ ok: false, text: 'Nie udało się wczytać odznak.' }));

  useEffect(() => {
    if (open && !data) load();
  }, [open]);

  if (!isModerator || !userId) return null;

  const save = () => {
    setBusy(true);
    setMessage(null);
    setUserBadgesAsModerator({ userId, values, reason: reason.trim() })
      .then(r => {
        const changes = r?.data?.changes || [];
        setMessage({
          ok: true,
          text: changes.length ? `Zapisano: ${changes.join('; ')}.` : 'Nic się nie zmieniło.',
        });
        setReason('');
        refreshSellerBadges(userId);
        load();
      })
      .catch(() => setMessage({ ok: false, text: 'Nie udało się zapisać. Podaj powód zmiany.' }))
      .finally(() => setBusy(false));
  };

  return (
    <div className={css.root}>
      <button type="button" className={css.toggle} onClick={() => setOpen(v => !v)} aria-expanded={open}>
        {open ? 'Zamknij' : 'Moderator: popraw odznaki'}
      </button>
      {open ? (
        <div className={css.panel}>
          {!data ? (
            <p className={css.muted}>Ładowanie…</p>
          ) : (
            <>
              {SELLER_BADGES.map(b => {
                const automatic = !!data.automatic?.[b.key];
                return (
                  <div key={b.key} className={css.row}>
                    <label className={css.label} htmlFor={`mod-badge-${b.key}`}>
                      {b.label}
                      <span className={css.hint}>
                        Automatycznie: {automatic ? 'tak' : 'nie'}
                      </span>
                    </label>
                    <select
                      id={`mod-badge-${b.key}`}
                      className={css.select}
                      value={values[b.key] || 'auto'}
                      onChange={e => setValues(v => ({ ...v, [b.key]: e.target.value }))}
                    >
                      <option value="auto">Automatycznie</option>
                      <option value="tak">Przyznana ręcznie</option>
                      <option value="nie">Odebrana ręcznie</option>
                    </select>
                  </div>
                );
              })}
              {data.override?.powod ? (
                <p className={css.muted}>Ostatnia ręczna zmiana: {data.override.powod}</p>
              ) : null}
              <label className={css.label} htmlFor="mod-badge-reason">
                Powód (zobaczy go użytkownik)
              </label>
              <input
                id="mod-badge-reason"
                className={css.input}
                value={reason}
                maxLength={300}
                onChange={e => setReason(e.target.value)}
                placeholder="Np. Błąd w liczeniu zamówień, poprawka ręczna."
              />
              <button type="button" className={css.save} disabled={busy || !reason.trim()} onClick={save}>
                Zapisz odznaki
              </button>
            </>
          )}
          {message ? (
            <p className={message.ok ? css.success : css.error} role="status">
              {message.text}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

export default ModeratorBadgeControls;
