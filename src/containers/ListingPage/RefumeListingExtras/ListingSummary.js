import React, { useEffect, useState } from 'react';

import { isFieldForListingType } from '../../../util/fieldHelpers';
import { NamedLink } from '../../../components';
import FavoriteButton from '../../../components/FavoriteButton/FavoriteButton';
import { timeAgoPl } from '../../../util/refumeTimeAgo';

import css from './RefumeListingExtras.module.css';

// Free-text / technical fields that don't belong in the short summary
const SKIP_KEYS = ['kod_batch', 'batch', 'opis'];

const findCategoryNames = (publicData, categoryConfiguration) => {
  const { key: prefix = 'categoryLevel', categories = [] } = categoryConfiguration || {};
  const names = [];
  let options = categories;
  for (let level = 1; level <= 3; level++) {
    const value = publicData?.[`${prefix}${level}`];
    const found = value ? options.find(c => c.id === value) : null;
    if (!found) break;
    names.push(found.name);
    options = found.subcategories || [];
  }
  return names;
};

/**
 * Refume: short summary under the listing title — brand, category and the listing's
 * select-type fields from Console (e.g. Uniseks, Designerskie, Nowe w folii, 100 ml).
 */
export const getSummaryItems = (listing, config) => {
  const publicData = listing?.attributes?.publicData || {};
  const listingType = publicData.listingType;
  const fieldConfigs = config?.listing?.listingFields || [];
  const items = [];

  if (publicData.marka) {
    items.push({ key: 'marka', label: String(publicData.marka), strong: true });
  }

  findCategoryNames(publicData, config?.categoryConfiguration).forEach((name, i) =>
    items.push({ key: `cat-${i}`, label: name })
  );

  fieldConfigs.forEach(fc => {
    const { key, scope = 'public', schemaType, enumOptions = [] } = fc;
    if (scope !== 'public' || key === 'marka' || SKIP_KEYS.includes(key)) return;
    if (!isFieldForListingType(listingType, fc)) return;
    const value = publicData[key];
    if (value == null || value === '') return;

    if (schemaType === 'enum') {
      const opt = enumOptions.find(o => `${o.option}` === `${value}`);
      if (opt) items.push({ key, label: opt.label });
    } else if (schemaType === 'multi-enum' && Array.isArray(value)) {
      value
        .map(v => enumOptions.find(o => `${o.option}` === `${v}`))
        .filter(Boolean)
        .forEach(opt => items.push({ key: `${key}-${opt.option}`, label: opt.label }));
    } else if (schemaType === 'long' && /pojemnosc/.test(key)) {
      items.push({ key, label: `${value} ml` });
    }
  });

  // Unique labels, keep order
  const seen = new Set();
  return items.filter(i => (seen.has(i.label) ? false : seen.add(i.label)));
};

const ListingSummary = props => {
  const { listing, config, showFavorite = true } = props;
  const items = getSummaryItems(listing, config);
  const brand = items.find(i => i.strong);
  const rest = items.filter(i => !i.strong);

  // Relative time is computed in the browser only, so server and client render the same HTML
  const createdAt = listing?.attributes?.createdAt;
  const [addedText, setAddedText] = useState(null);
  useEffect(() => {
    if (!createdAt) return;
    const update = () => setAddedText(timeAgoPl(createdAt));
    update();
    const timer = setInterval(update, 60 * 1000);
    return () => clearInterval(timer);
  }, [createdAt ? new Date(createdAt).getTime() : null]);

  return (
    <div className={css.summary}>
      <div className={css.summaryText}>
      <p className={css.summaryLine}>
        {brand ? (
          <NamedLink
            name="SearchPage"
            to={{ search: `?keywords=${encodeURIComponent(brand.label)}` }}
            className={css.summaryBrand}
            title={`Więcej perfum marki ${brand.label}`}
          >
            {brand.label}
          </NamedLink>
        ) : null}
        {rest.map((item, i) => (
          <React.Fragment key={item.key}>
            {brand || i > 0 ? (
              <span className={css.summaryDot} aria-hidden="true">
                ·
              </span>
            ) : null}
            <span className={css.summaryItem}>{item.label}</span>
          </React.Fragment>
        ))}
      </p>
      {addedText ? (
        <p className={css.addedAt}>
          <time dateTime={new Date(createdAt).toISOString()}>Dodano {addedText}</time>
        </p>
      ) : null}
      </div>
      {showFavorite ? (
        <FavoriteButton
          listingUuid={listing?.id?.uuid}
          title={listing?.attributes?.title}
          className={css.summaryFavorite}
        />
      ) : null}
    </div>
  );
};

export default ListingSummary;
