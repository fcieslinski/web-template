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

const TRUST_POINTS = [
  'Pieniądze czekają, aż potwierdzisz odbiór paczki',
  'Coś nie tak z przesyłką? Zgłaszasz problem w zamówieniu',
  'Każda paczka z numerem śledzenia',
];

/**
 * Refume: top of the home page — a plum banner (what Refume is + two actions) next to a
 * short "Ochrona Kupującego" card.
 */
const HomeBanner = ({ totalListings }) => (
  <div className={css.bannerRow}>
    <section className={css.banner} aria-labelledby="refume-banner-title">
      <svg className={css.bannerArt} viewBox="40 -20 320 290" preserveAspectRatio="xMaxYMax meet" aria-hidden="true">
        <circle cx="190" cy="125" r="140" fill="#5e2550" />
        <Flask x={92} y={104} w={70} h={116} body="#dfc7d7" cap="#d7a3c9" liquid="#b36d9f" shape="round" />
        <Flask x={172} y={48} w={86} h={172} body="#f1e4ee" cap="#d7a3c9" liquid="#b36d9f" />
        <Flask x={274} y={86} w={66} h={134} body="#e9d3e2" cap="#ffffff" liquid="#8e4a7c" shape="tall" />
      </svg>
      <div className={css.bannerText}>
        <span className={css.bannerEyebrow}>
          Marketplace perfum
          {totalListings > 0 ? ` · ${totalListings} ${offersLabel(totalListings)}` : ''}
        </span>
        <h1 id="refume-banner-title" className={css.bannerTitle}>
          Kupuj i sprzedawaj perfumy, odlewki i flakony
        </h1>
        <div className={css.bannerActions}>
          <NamedLink name="NewListingPage" className={css.bannerPrimary}>
            Sprzedaj perfumy
          </NamedLink>
          <NamedLink name="SearchPage" className={css.bannerSecondary}>
            Przeglądaj oferty
          </NamedLink>
        </div>
      </div>
    </section>

    <section className={css.trustCard} aria-labelledby="refume-trust-title">
      <span className={css.trustEyebrow}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z" />
          <path d="M8.5 12l2.5 2.5 4.5-5" />
        </svg>
        Ochrona Kupującego
      </span>
      <h2 id="refume-trust-title" className={css.trustTitle}>
        Płacisz bezpiecznie, sprzedający dostaje pieniądze po odbiorze
      </h2>
      <ul className={css.trustList}>
        {TRUST_POINTS.map(t => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </section>
  </div>
);

/**
 * Refume: catalog-style top of the landing page — category bar, banner + protection card, quick
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

      <div className={css.content}>
        <HomeBanner totalListings={totalListings} />

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
