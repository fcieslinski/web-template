import React, { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';

import { ListingCard, NamedLink } from '../../components';
import RefumeCategoryBar from '../../components/RefumeCategoryBar/RefumeCategoryBar';
import RecentlyViewed from '../../components/RecentlyViewed/RecentlyViewed';
import { fetchScentRequests } from '../../util/api';

import css from './CatalogHome.module.css';

// Quick filters shown as pills. Values match the "stan" listing field and the
// "Odlewka" listing type set up in Sharetribe Console. Price is in whole złoty.
const QUICK_FILTERS = [
  { key: 'folia', label: 'Nowe w folii', search: '?pub_stan=nowe-folia' },
  { key: '90', label: '90–100%', search: '?pub_stan=90-100' },
  { key: '70', label: '70–90%', search: '?pub_stan=70-90' },
  { key: 'odlewki', label: 'Odlewki', listingType: 'sell-used-products' },
  { key: 'do100', label: 'Do 100 zł', search: '?price=0,100' },
  { key: 'pudelko', label: 'Z pudełkiem', search: '?pub_pudelko=tak' },
];

const QuickFilterLink = ({ filter }) =>
  filter.listingType ? (
    <NamedLink
      className={css.pill}
      name="SearchPageWithListingType"
      params={{ listingType: filter.listingType }}
    >
      {filter.label}
    </NamedLink>
  ) : (
    <NamedLink className={css.pill} name="SearchPage" to={{ search: filter.search }}>
      {filter.label}
    </NamedLink>
  );

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

const offersLabel = n =>
  n === 1
    ? 'oferta'
    : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)
    ? 'oferty'
    : 'ofert';

// One flask for the banner drawing (viewBox units)
const Flask = ({ x, y, w, h, body, cap, liquid, shape }) => {
  const capW = w * 0.42;
  const capH = h * 0.2;
  const neckW = w * 0.2;
  const neckH = h * 0.1;
  const top = y + capH + neckH;
  const bodyH = h - capH - neckH;
  const r = Math.min(w, h) * 0.16;
  return (
    <g>
      <rect x={x + (w - neckW) / 2} y={y + capH} width={neckW} height={neckH + 2} fill="#a8a29e" />
      <rect x={x + (w - capW) / 2} y={y} width={capW} height={capH} rx={capW * 0.12} fill={cap} />
      {shape === 'round' ? (
        <ellipse cx={x + w / 2} cy={top + bodyH / 2} rx={w / 2} ry={bodyH / 2} fill={body} />
      ) : shape === 'tall' ? (
        <rect x={x + w * 0.12} y={top} width={w * 0.76} height={bodyH} rx={r * 0.6} fill={body} />
      ) : (
        <rect x={x} y={top} width={w} height={bodyH} rx={r} fill={body} />
      )}
      <rect x={x + w * 0.14} y={top + bodyH * 0.38} width={w * 0.72} height={bodyH * 0.5} rx={r * 0.6} fill={liquid} opacity="0.55" />
      <rect x={x + w * 0.16} y={top + bodyH * 0.14} width={w * 0.08} height={bodyH * 0.55} rx={w * 0.04} fill="#fff" opacity="0.45" />
    </g>
  );
};

/** Refume: light band at the top of the home page — tagline, real numbers, two actions. */
const HomeBanner = ({ totalListings }) => (
  <section className={css.banner} aria-labelledby="refume-banner-title">
    <div className={css.bannerInner}>
      <div className={css.bannerText}>
        <h1 id="refume-banner-title" className={css.bannerTitle}>
          Perfumy z drugiej ręki.
          <span className={css.bannerAccent}> Sprawdzone, tańsze, od ludzi.</span>
        </h1>
        <p className={css.bannerFacts}>
          {totalListings > 0 ? (
            <span>
              <strong>{totalListings}</strong> {offersLabel(totalListings)}
            </span>
          ) : null}
          <span>Ochrona Kupującego przy każdym zakupie</span>
        </p>
        <div className={css.bannerActions}>
          <NamedLink name="NewListingPage" className={css.sellButton}>
            Sprzedaj swoje perfumy
          </NamedLink>
          <NamedLink
            name="SearchPageWithListingType"
            params={{ listingType: 'sell-used-products' }}
            className={css.bannerSecondary}
          >
            Zobacz odlewki
          </NamedLink>
        </div>
      </div>
      <svg className={css.bannerArt} viewBox="0 0 420 200" aria-hidden="true">
        <Flask x={30} y={20} w={80} h={170} body="#efe1ea" cap="#6b2d5c" liquid="#8e4a7c" />
        <Flask x={130} y={60} w={66} h={130} body="#f3e7d6" cap="#c8a96a" liquid="#d9b779" shape="round" />
        <Flask x={216} y={4} w={58} h={186} body="#e6dff0" cap="#1c1917" liquid="#9d86c4" shape="tall" />
        <Flask x={294} y={50} w={84} h={140} body="#dfe7ee" cap="#1c1917" liquid="#8fa9bf" />
        <rect x="0" y="190" width="420" height="8" rx="2" fill="#e3d2de" />
      </svg>
    </div>
  </section>
);

/**
 * Refume: catalog-style top of the landing page — category bar, a light banner, quick
 * filters, newest listings, popular brands, "Poszukiwane" and recently viewed.
 * Content from the Console landing page asset is rendered below this.
 *
 * @param {Object} props
 * @param {Array<Object>} props.listings denormalised listing entities
 * @param {boolean} props.inProgress whether the newest listings are loading
 */
const CatalogHome = props => {
  const { listings = [], inProgress, totalListings } = props;
  const renderSizes = [
    '(max-width: 549px) 50vw',
    '(max-width: 1023px) 33vw',
    '(max-width: 1279px) 25vw',
    '17vw',
  ].join(', ');

  return (
    <div className={css.root}>
      <RefumeCategoryBar />
      <HomeBanner totalListings={totalListings} />

      <div className={css.content}>
        <div className={css.filtersRow}>
          <span className={css.filtersLabel}>Szybkie filtry:</span>
          <ul className={css.pills} aria-label="Szybkie filtry">
            {QUICK_FILTERS.map(filter => (
              <li key={filter.key}>
                <QuickFilterLink filter={filter} />
              </li>
            ))}
          </ul>
        </div>

        <section className={css.card} aria-labelledby="refume-latest-title">
          <div className={css.sectionHeader}>
            <h2 id="refume-latest-title" className={css.sectionTitle}>
              Nowe ogłoszenia
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
