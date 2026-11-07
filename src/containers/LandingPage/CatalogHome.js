import React, { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { useHistory } from 'react-router-dom';

import { ListingCard, NamedLink } from '../../components';
import RecentlyViewed from '../../components/RecentlyViewed/RecentlyViewed';
import { fetchScentRequests } from '../../util/api';
import { HOME_CATEGORIES } from './LandingPage.duck';

import css from './CatalogHome.module.css';

const pluralOffers = n =>
  n === 1
    ? 'oferta'
    : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)
    ? 'oferty'
    : 'ofert';

// Brands with the most published listings (from up to 100 newest listings)
const fetchTopBrands = () => (dispatch, getState, sdk) =>
  sdk.listings
    .query({ perPage: 100, 'fields.listing': ['publicData.marka'], minStock: 1, stockMode: 'match-undefined' })
    .then(response => {
      const counts = new Map();
      (response.data.data || []).forEach(l => {
        const brand = String(l.attributes?.publicData?.marka || '').trim();
        if (brand) counts.set(brand, (counts.get(brand) || 0) + 1);
      });
      return [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([name, count]) => ({ name, count }));
    });

const PopularBrands = () => {
  const dispatch = useDispatch();
  const [brands, setBrands] = useState(null);
  useEffect(() => {
    dispatch(fetchTopBrands())
      .then(setBrands)
      .catch(() => setBrands([]));
  }, []);
  if (!brands?.length) return null;
  return (
    <section className={css.card} aria-labelledby="refume-brands-title">
      <div className={css.sectionHeader}>
        <h2 id="refume-brands-title" className={css.sectionTitleSmall}>
          Popularne marki
        </h2>
        <NamedLink name="SearchPage" className={css.seeAll}>
          Wszystkie oferty →
        </NamedLink>
      </div>
      <ul className={css.brands}>
        {brands.map(b => (
          <li key={b.name}>
            <NamedLink
              name="SearchPage"
              to={{ search: `?keywords=${encodeURIComponent(b.name)}` }}
              className={css.brand}
            >
              <span className={css.brandName}>{b.name}</span>
              <span className={css.brandCount}>
                {b.count} {pluralOffers(b.count)}
              </span>
            </NamedLink>
          </li>
        ))}
      </ul>
    </section>
  );
};

const WantedTeaser = () => {
  const [top, setTop] = useState([]);
  useEffect(() => {
    fetchScentRequests()
      .then(r =>
        setTop(
          (Array.isArray(r?.data) ? r.data : [])
            .filter(g => g.count > 0)
            .sort((a, b) => b.count - a.count)
            .slice(0, 3)
        )
      )
      .catch(() => setTop([]));
  }, []);
  return (
    <section className={css.wanted} aria-labelledby="refume-wanted-title">
      <div className={css.wantedText}>
        <h2 id="refume-wanted-title" className={css.sectionTitleSmall}>
          Nie ma Twojego zapachu?
        </h2>
        <p className={css.wantedLead}>
          Dodaj go do Poszukiwanych – damy Ci znać, gdy ktoś go wystawi. Sprzedający widzą, czego
          szukacie.
        </p>
      </div>
      {top.length ? (
        <ul className={css.wantedList}>
          {top.map(g => (
            <li key={g.key} className={css.wantedChip}>
              {[g.brand, g.name].filter(Boolean).join(' ')} · {g.count}{' '}
              {g.count === 1 ? 'osoba' : g.count % 10 >= 2 && g.count % 10 <= 4 && (g.count % 100 < 10 || g.count % 100 >= 20) ? 'osoby' : 'osób'}
            </li>
          ))}
        </ul>
      ) : null}
      <NamedLink name="ScentRequestsPage" className={css.outlineButton}>
        Dodaj do Poszukiwanych
      </NamedLink>
    </section>
  );
};

// Colours of the round picture on each category tile
const TILE_COLORS = {
  damskie: ['#efe1ea', '#d9bfd0'],
  meskie: ['#e3e8ee', '#c5d0da'],
  unisex: ['#ece6f1', '#d3c6de'],
  odlewki: ['#f3eadf', '#e0cfb9'],
  flakony: ['#e6ece6', '#cbd8cc'],
  folia: ['#f1e6e3', '#ddc6bf'],
  do100: ['#eee9e2', '#d8cebf'],
  pudelko: ['#e9e6ef', '#cfc9dc'],
};

const TileBottle = ({ color }) => (
  <svg width="30" height="40" viewBox="0 0 34 44" aria-hidden="true">
    <rect x="12" y="2" width="10" height="8" rx="1.5" fill="#1c1917" opacity="0.75" />
    <rect x="14.5" y="10" width="5" height="4" fill="#a8a29e" />
    <rect x="4" y="14" width="26" height="28" rx="5" fill="#ffffff" opacity="0.85" />
    <rect x="7" y="25" width="20" height="14" rx="3" fill={color} />
  </svg>
);

/**
 * Refume: top of the home page in the style of classifieds sites — category tiles with the
 * number of listings in each on a beige band. Phones and tablets also get a search box here
 * (on desktop it's in the top bar).
 */
const SearchHero = ({ categoryCounts = {} }) => {
  const history = useHistory();
  const [phrase, setPhrase] = useState('');
  const onSubmit = e => {
    e.preventDefault();
    const q = phrase.trim();
    history.push(q ? `/s?keywords=${encodeURIComponent(q)}` : '/s');
  };
  return (
    <section className={css.hero} aria-label="Szukaj perfum">
      <div className={css.heroInner}>
        <form className={css.heroSearch} onSubmit={onSubmit} role="search">
          <label className={css.heroField} htmlFor="refume-home-search">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
            <input
              id="refume-home-search"
              className={css.heroInput}
              type="search"
              value={phrase}
              onChange={e => setPhrase(e.target.value)}
              placeholder="Czego szukasz? np. Sauvage, wanilia"
              aria-label="Czego szukasz?"
              autoComplete="off"
            />
          </label>
          <button type="submit" className={css.heroButton}>
            Szukaj
          </button>
        </form>

        <ul className={css.tiles} aria-label="Kategorie">
          {HOME_CATEGORIES.map(c => {
            const [from, to] = TILE_COLORS[c.key] || ['#eee', '#ddd'];
            const count = categoryCounts[c.key];
            const linkProps = c.listingType
              ? { name: 'SearchPageWithListingType', params: { listingType: c.listingType } }
              : { name: 'SearchPage', to: c.to };
            return (
              <li key={c.key}>
                <NamedLink className={css.tile} {...linkProps}>
                  <span
                    className={css.tilePicture}
                    style={{ background: `linear-gradient(160deg, ${from}, ${to})` }}
                  >
                    <TileBottle color={to} />
                  </span>
                  <span className={css.tileLabel}>{c.label}</span>
                  {typeof count === 'number' ? (
                    <span className={css.tileCount}>
                      {count} {pluralOffers(count)}
                    </span>
                  ) : null}
                </NamedLink>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
};

/**
 * Refume: catalog-style landing page — search box with category tiles, newest listings,
 * popular brands, "Poszukiwane" and recently viewed.
 * Content from the Console landing page asset is rendered below this.
 *
 * @param {Object} props
 * @param {Array<Object>} props.listings denormalised listing entities
 * @param {boolean} props.inProgress whether the newest listings are loading
 */
const CatalogHome = props => {
  const { listings = [], inProgress, categoryCounts, totalListings } = props;
  const renderSizes = [
    '(max-width: 549px) 50vw',
    '(max-width: 1023px) 33vw',
    '(max-width: 1279px) 25vw',
    '17vw',
  ].join(', ');

  return (
    <div className={css.root}>
      <SearchHero categoryCounts={categoryCounts} />

      <div className={css.content}>
        <section className={css.latest} aria-labelledby="refume-latest-title">
          <div className={css.sectionHeader}>
            <h2 id="refume-latest-title" className={css.sectionTitle}>
              Ostatnio dodane
              {totalListings > 0 ? (
                <span className={css.sectionCount}>
                  {totalListings} {pluralOffers(totalListings)}
                </span>
              ) : null}
            </h2>
            <NamedLink name="SearchPage" className={css.seeAll}>
              Zobacz wszystkie →
            </NamedLink>
          </div>

          {listings.length > 0 ? (
            <div className={css.grid}>
              {listings.map(listing => (
                <ListingCard
                  key={listing.id.uuid}
                  listing={listing}
                  renderSizes={renderSizes}
                  framed
                />
              ))}
            </div>
          ) : (
            <p className={css.empty}>
              {inProgress ? 'Ładowanie ogłoszeń…' : 'Nie ma jeszcze ogłoszeń. Dodaj pierwsze!'}
            </p>
          )}
        </section>

        <div className={css.twoCol}>
          <PopularBrands />
          <WantedTeaser />
        </div>

        <RecentlyViewed className={css.recentlyViewed} titleClassName={css.sectionTitleSmall} />
      </div>
    </div>
  );
};

export default CatalogHome;
