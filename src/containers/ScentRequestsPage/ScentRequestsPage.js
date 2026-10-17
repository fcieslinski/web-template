import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useHistory } from 'react-router-dom';
import classNames from 'classnames';

import { fetchScentRequests, searchPerfumes } from '../../util/api';
import { useMyRequests, requestKey } from '../../ducks/refumeRequests';
import { canonicalBrand } from '../../util/refumeBrands';
import { createResourceLocatorString } from '../../util/routes';
import { useRouteConfiguration } from '../../context/routeConfigurationContext';
import { Page, LayoutSingleColumn, NamedLink } from '../../components';
import TopbarContainer from '../TopbarContainer/TopbarContainer';
import FooterContainer from '../FooterContainer/FooterContainer';

import css from './ScentRequestsPage.module.css';

const normalize = s =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l');

const formatDate = iso => {
  try {
    return new Date(iso).toLocaleDateString('pl-PL');
  } catch (e) {
    return '';
  }
};

const fullName = (brand, name) =>
  !brand || normalize(name).includes(normalize(brand)) ? name : `${brand} ${name}`;

const BellIcon = ({ filled }) => (
  <svg viewBox="0 0 24 24" className={css.bell} aria-hidden="true" focusable="false">
    <path
      d="M6 16V11a6 6 0 1112 0v5l1.5 2h-15L6 16zM10 20a2 2 0 004 0"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
  </svg>
);

/** "Szukam perfum" — pick from the perfume database or type brand + name by hand. */
const AddRequest = ({ onAdd, onClose }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [manual, setManual] = useState({ brand: '', name: '' });
  const timer = useRef(null);

  useEffect(() => {
    clearTimeout(timer.current);
    const q = query.trim();
    if (q.length < 4) {
      setResults([]);
      return;
    }
    timer.current = setTimeout(() => {
      setLoading(true);
      searchPerfumes(q)
        .then(res => setResults(res?.data || []))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 500);
    return () => clearTimeout(timer.current);
  }, [query]);

  return (
    <div className={css.addBox}>
      <div className={css.addHeader}>
        <h2 className={css.addTitle}>Jakich perfum szukasz?</h2>
        <button type="button" className={css.close} onClick={onClose} aria-label="Zamknij">
          ×
        </button>
      </div>
      <label htmlFor="request-search" className={css.label}>
        Wyszukaj w bazie
      </label>
      <input
        id="request-search"
        className={css.input}
        placeholder="np. Baccarat Rouge 540"
        value={query}
        autoComplete="off"
        onChange={e => setQuery(e.target.value)}
      />
      {loading ? <p className={css.muted}>Szukam…</p> : null}
      {results.length ? (
        <ul className={css.results}>
          {results.map(p => (
            <li key={p.id}>
              <button
                type="button"
                className={css.result}
                onClick={() =>
                  onAdd({
                    name: p.name,
                    brand: canonicalBrand(p.brand),
                    perfumeId: p.source === 'fragella' || p.source === 'refume' ? p.id : undefined,
                  })
                }
              >
                {p.image ? <img src={p.image} alt="" className={css.thumb} loading="lazy" /> : null}
                <span>
                  <strong>{fullName(p.brand, p.name)}</strong>
                  <span className={css.muted}>
                    {' '}
                    {[p.concentration, p.year].filter(Boolean).join(' · ')}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <form
        className={css.manual}
        onSubmit={e => {
          e.preventDefault();
          if (!manual.name.trim()) return;
          onAdd({ name: manual.name.trim(), brand: canonicalBrand(manual.brand) });
        }}
      >
        <p className={css.label}>Nie ma na liście? Wpisz sam</p>
        <div className={css.manualRow}>
          <input
            className={css.input}
            placeholder="Marka"
            value={manual.brand}
            onChange={e => setManual(m => ({ ...m, brand: e.target.value }))}
            aria-label="Marka"
          />
          <input
            className={css.input}
            placeholder="Nazwa perfum"
            value={manual.name}
            onChange={e => setManual(m => ({ ...m, name: e.target.value }))}
            aria-label="Nazwa perfum"
          />
          <button type="submit" className={css.primary} disabled={!manual.name.trim()}>
            Dodaj
          </button>
        </div>
      </form>
    </div>
  );
};

/** Refume: perfumes people are looking for (route /poszukiwane). */
const ScentRequestsPage = () => {
  const history = useHistory();
  const routes = useRouteConfiguration();
  const { isLoggedIn, mine, isWatching, toggle } = useMyRequests();
  const [requests, setRequests] = useState(null);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState('');
  const [sort, setSort] = useState('newest');
  const [adding, setAdding] = useState(false);
  const [busyKey, setBusyKey] = useState(null);
  // Keys the user watched when the list was loaded, to adjust counts after toggling
  const initialMine = useRef(null);

  useEffect(() => {
    fetchScentRequests()
      .then(res => {
        setRequests(res?.data || []);
        initialMine.current = new Set(mine.map(r => r.key));
      })
      .catch(() => setError(true));
  }, []);

  const goLogin = () =>
    history.push(createResourceLocatorString('LoginPage', routes, {}, {}), { from: '/poszukiwane' });

  const handleToggle = request => {
    if (!isLoggedIn) return goLogin();
    setBusyKey(request.key);
    toggle(request)
      .catch(() => null)
      .finally(() => setBusyKey(null));
  };

  const handleAdd = request => {
    const key = requestKey(request);
    if (!isWatching(key)) handleToggle({ ...request, key });
    setAdding(false);
  };

  // Server list + the user's own requests that the server hasn't seen yet
  const list = useMemo(() => {
    const byKey = new Map((requests || []).map(r => [r.key, { ...r }]));
    mine.forEach(r => {
      if (!byKey.has(r.key)) byKey.set(r.key, { ...r, count: 0 });
    });
    const all = Array.from(byKey.values()).map(r => {
      const wasMine = initialMine.current?.has(r.key) || false;
      const isMine = isWatching(r.key);
      return { ...r, count: Math.max(0, (r.count || 0) - (wasMine ? 1 : 0) + (isMine ? 1 : 0)), isMine };
    });
    const q = normalize(filter.trim());
    const filtered = q
      ? all.filter(r => normalize(`${r.brand} ${r.name}`).includes(q))
      : all;
    return filtered
      .filter(r => r.count > 0)
      .sort((a, b) =>
        sort === 'popular'
          ? b.count - a.count || (b.createdAt || '').localeCompare(a.createdAt || '')
          : (b.createdAt || '').localeCompare(a.createdAt || '')
      );
  }, [requests, mine, filter, sort]);

  return (
    <Page title="Poszukiwane perfumy" scrollingDisabled={false}>
      <LayoutSingleColumn topbar={<TopbarContainer />} footer={<FooterContainer />}>
        <div className={css.root}>
          <header className={css.header}>
            <h1 className={css.title}>Poszukiwane</h1>
            <p className={css.lead}>
              Nie możesz znaleźć zapachu? Daj znać, czego szukasz. Sprzedający widzą, na co
              czekają kupujący, a gdy ktoś wystawi ten zapach, dostaniesz maila.
            </p>
          </header>

          <div className={css.toolbar}>
            <input
              className={classNames(css.input, css.filter)}
              placeholder="Szukaj, np. dior"
              value={filter}
              onChange={e => setFilter(e.target.value)}
              aria-label="Filtruj poszukiwane perfumy"
            />
            <select
              className={css.select}
              value={sort}
              onChange={e => setSort(e.target.value)}
              aria-label="Sortowanie"
            >
              <option value="newest">Najnowsze</option>
              <option value="popular">Najbardziej poszukiwane</option>
            </select>
            <button
              type="button"
              className={css.primary}
              onClick={() => (isLoggedIn ? setAdding(true) : goLogin())}
            >
              Szukam perfum
            </button>
          </div>

          {adding ? <AddRequest onAdd={handleAdd} onClose={() => setAdding(false)} /> : null}

          {error ? (
            <p className={css.muted}>Nie udało się wczytać listy. Odśwież stronę.</p>
          ) : requests === null ? (
            <p className={css.muted}>Ładowanie…</p>
          ) : list.length === 0 ? (
            <p className={css.muted}>
              {filter ? 'Nic nie pasuje do wyszukiwania.' : 'Nikt jeszcze niczego nie szuka. Bądź pierwszy!'}
            </p>
          ) : (
            <ul className={css.grid}>
              {list.map(r => (
                <li key={r.key} className={css.card}>
                  <h2 className={css.cardTitle}>{fullName(r.brand, r.name)}</h2>
                  <p className={css.cardMeta}>
                    Poszukiwane od {formatDate(r.createdAt)} ·{' '}
                    {r.count === 1 ? '1 osoba czeka' : `${r.count} osób czeka`}
                  </p>
                  <div className={css.cardActions}>
                    <NamedLink name="NewListingPage" className={css.sellButton}>
                      + Mam, wystawiam
                    </NamedLink>
                    <button
                      type="button"
                      className={classNames(css.notifyButton, { [css.notifyActive]: r.isMine })}
                      aria-pressed={r.isMine}
                      disabled={busyKey === r.key}
                      onClick={() => handleToggle(r)}
                    >
                      <BellIcon filled={r.isMine} />
                      {r.isMine ? 'Powiadomię Cię' : 'Powiadom mnie'} ({r.count})
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </LayoutSingleColumn>
    </Page>
  );
};

export default ScentRequestsPage;
