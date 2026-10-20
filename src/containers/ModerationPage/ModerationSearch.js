import React, { useEffect, useRef, useState } from 'react';

import { searchModeration } from '../../util/api';
import { NamedLink } from '../../components';

import css from './ModerationPage.module.css';

const formatPrice = price =>
  price?.amount != null
    ? `${(price.amount / 100).toFixed(2).replace('.', ',')} ${price.currency === 'PLN' ? 'zł' : price.currency}`
    : '';

/** Refume: search users (name, e-mail, id) and listings (title, brand, id) for moderators. */
const ModerationSearch = () => {
  const [q, setQ] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const latest = useRef('');

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      setResult(null);
      return undefined;
    }
    const t = setTimeout(() => {
      latest.current = query;
      setLoading(true);
      searchModeration(query)
        .then(r => {
          if (latest.current === query) setResult(r?.data || { users: [], listings: [] });
        })
        .catch(() => {
          if (latest.current === query) setResult({ users: [], listings: [], error: true });
        })
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const onDown = e => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const showBox = open && q.trim().length >= 2;
  const nothing = result && !result.users.length && !result.listings.length;

  return (
    <div className={css.search} ref={rootRef}>
      <label htmlFor="moderation-search" className={css.srOnly}>
        Szukaj użytkownika lub oferty
      </label>
      <input
        id="moderation-search"
        type="search"
        className={css.searchInput}
        placeholder="Szukaj użytkownika (imię, e-mail, ID) albo oferty (tytuł, marka, ID)…"
        value={q}
        autoComplete="off"
        onChange={e => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={e => {
          if (e.key === 'Escape') setOpen(false);
        }}
      />
      {showBox ? (
        <div className={css.searchResults}>
          {!result ? (
            <p className={css.muted}>{loading ? 'Szukam…' : ' '}</p>
          ) : result.error ? (
            <p className={css.error}>Nie udało się wyszukać.</p>
          ) : nothing ? (
            <p className={css.muted}>Nic nie znaleziono.</p>
          ) : (
            <>
              {result.users.length ? <p className={css.searchGroup}>Użytkownicy</p> : null}
              {result.users.map(u => (
                <NamedLink
                  key={u.id}
                  name="ModeratorUserPage"
                  params={{ id: u.id }}
                  className={css.searchItem}
                >
                  <span className={css.searchAvatar} aria-hidden="true">
                    {(u.name || '?').slice(0, 1).toUpperCase()}
                  </span>
                  <span className={css.searchText}>
                    <strong>
                      {u.name || '—'}
                      {u.blocked ? <span className={css.pillDanger}>zablokowany</span> : null}
                      {u.isModerator ? <span className={css.pill}>moderator</span> : null}
                    </strong>
                    <span>{[u.email, `${u.firstName} ${u.lastName}`.trim()].filter(Boolean).join(' · ')}</span>
                  </span>
                </NamedLink>
              ))}
              {result.listings.length ? <p className={css.searchGroup}>Oferty</p> : null}
              {result.listings.map(l => (
                <NamedLink
                  key={l.id}
                  name="ModeratorListingEditPage"
                  params={{ id: l.id }}
                  className={css.searchItem}
                >
                  {l.image ? (
                    <img src={l.image} alt="" className={css.searchThumb} loading="lazy" />
                  ) : (
                    <span className={css.searchThumb} aria-hidden="true" />
                  )}
                  <span className={css.searchText}>
                    <strong>
                      {l.title}
                      {l.ukryta ? <span className={css.pillWarning}>ukryta</span> : null}
                    </strong>
                    <span>
                      {[l.brand, formatPrice(l.price), l.author?.name].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                </NamedLink>
              ))}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
};

export default ModerationSearch;
