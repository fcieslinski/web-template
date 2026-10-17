import React from 'react';

import { ListingCard, NamedLink } from '../../components';
import RefumeCategoryBar from '../../components/RefumeCategoryBar/RefumeCategoryBar';

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
  'Wybierz markę i stan flakonu',
  'Dodaj zdjęcie pod światło',
  'Wyślij po sprzedaży, pieniądze po odbiorze',
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

/**
 * Refume: catalog-style top of the landing page — category bar, a compact
 * "sell" banner, quick filter pills and a dense grid of the newest listings.
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

      <section className={css.sellBanner} aria-labelledby="refume-sell-title">
        <div className={css.sellBannerInner}>
          <div className={css.sellCard}>
            <h1 id="refume-sell-title" className={css.sellTitle}>
              Masz flakon, który tylko stoi?
            </h1>
            <NamedLink name="NewListingPage" className={css.sellButton}>
              Sprzedaj teraz
            </NamedLink>
          </div>
          <ol className={css.sellSteps}>
            {SELL_STEPS.map((step, i) => (
              <li key={step} className={css.sellStep}>
                <span className={css.sellStepNumber} aria-hidden="true">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </div>
      </section>

      <div className={css.content}>
        <ul className={css.pills} aria-label="Szybkie filtry">
          {QUICK_FILTERS.map(filter => (
            <li key={filter.key}>
              <QuickFilterLink filter={filter} />
            </li>
          ))}
        </ul>

        <section aria-labelledby="refume-latest-title">
          <div className={css.sectionHeader}>
            <h2 id="refume-latest-title" className={css.sectionTitle}>
              Nowe ogłoszenia
            </h2>
            <NamedLink name="SearchPage" className={css.seeAll}>
              Zobacz wszystkie
            </NamedLink>
          </div>

          {listings.length > 0 ? (
            <div className={css.grid}>
              {listings.map(listing => (
                <ListingCard
                  key={listing.id.uuid}
                  listing={listing}
                  renderSizes={renderSizes}
                  showAuthorInfo
                  authorAbove
                />
              ))}
            </div>
          ) : (
            <p className={css.empty}>
              {inProgress ? 'Ładowanie ogłoszeń…' : 'Nie ma jeszcze ogłoszeń. Dodaj pierwsze!'}
            </p>
          )}
        </section>
      </div>
    </div>
  );
};

export default CatalogHome;
