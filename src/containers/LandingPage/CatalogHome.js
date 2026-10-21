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

const SELL_STEPS = [
  { title: 'Wybierz markę i stan', text: 'Nuty i opis uzupełnią się same.' },
  { title: 'Zrób zdjęcie pod światło', text: 'Żeby było widać poziom płynu.' },
  { title: 'Wyślij paczkomatem', text: 'Pieniądze po odbiorze przez kupującego.' },
];

const TRUST = [
  {
    key: 'proof',
    title: 'Zweryfikowane dowodem zakupu',
    text: 'Sprawdzamy paragony i faktury.',
    icon: <path d="M5 12l5 5 9-10" />,
  },
  {
    key: 'ship',
    title: 'Paczkomaty i kurierzy',
    text: 'InPost, Orlen Paczka, DPD, Pocztex.',
    icon: (
      <>
        <path d="M3 7h13v10H3z" />
        <path d="M16 10h4l1 3v4h-5" />
        <circle cx="7" cy="18" r="1.6" />
        <circle cx="18" cy="18" r="1.6" />
      </>
    ),
  },
  {
    key: 'help',
    title: 'Pomoc przy sporze',
    text: 'Zespół Refume rozstrzyga problemy.',
    icon: <path d="M4 5h16v11H8l-4 4z" />,
  },
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

/**
 * Refume: catalog-style top of the landing page — category bar, a "sell" card next to a
 * "Ochrona Kupującego" card, quick filters, newest listings, popular brands, "Poszukiwane"
 * and recently viewed, each in its own bordered card.
 * Content from the Console landing page asset is rendered below this.
 *
 * @param {Object} props
 * @param {Array<Object>} props.listings denormalised listing entities
 * @param {boolean} props.inProgress whether the newest listings are loading
 */
const CatalogHome = props => {
  const { listings = [], inProgress } = props;
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
        <div className={css.heroRow}>
          <section className={css.sellCard} aria-labelledby="refume-sell-title">
            <div className={css.sellIntro}>
              <span className={css.badge}>Sprzedaj w 2 minuty</span>
              <h1 id="refume-sell-title" className={css.sellTitle}>
                Masz flakon, który tylko stoi?
              </h1>
              <p className={css.sellLead}>Wystaw go na Refume. Ktoś właśnie szuka tego zapachu.</p>
            </div>
            <ol className={css.sellSteps}>
              {SELL_STEPS.map((step, i) => (
                <li key={step.title} className={css.sellStep}>
                  <span className={css.sellStepNumber} aria-hidden="true">
                    {i + 1}
                  </span>
                  <span className={css.sellStepTitle}>{step.title}</span>
                  <span className={css.sellStepText}>{step.text}</span>
                </li>
              ))}
            </ol>
            <div className={css.sellActions}>
              <NamedLink name="NewListingPage" className={css.sellButton}>
                Sprzedaj teraz
              </NamedLink>
            </div>
          </section>

          <section className={css.trustCard} aria-labelledby="refume-trust-title">
            <div className={css.trustHead}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z" />
                <path d="M8.5 12l2.5 2.5 4.5-5" />
              </svg>
              <h2 id="refume-trust-title" className={css.trustTitle}>
                Ochrona Kupującego
              </h2>
            </div>
            <p className={css.trustLead}>
              Płacisz przez Refume – sprzedawca dostaje pieniądze dopiero, gdy potwierdzisz odbiór.
            </p>
            <ul className={css.trustList}>
              {TRUST.map(t => (
                <li key={t.key} className={css.trustItem}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    {t.icon}
                  </svg>
                  <span>
                    <strong>{t.title}</strong>
                    <span className={css.trustText}>{t.text}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>

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
