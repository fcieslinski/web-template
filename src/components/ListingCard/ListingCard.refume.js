import React from 'react';

import css from './ListingCard.module.css';

/**
 * Refume-specific helpers for the listing card:
 * - how full a bottle is, based on the "stan" listing field
 * - price per millilitre, based on "pojemnosc_ml" (bottle) or "pojemnosc_odlewki" (decant)
 *
 * Field ids and option values come from the listing fields set up in Sharetribe Console.
 */

// Option value of the "stan" field → { fill level 0–1, short label shown on the card }
const STAN_LEVELS = {
  'nowe-folia': { fill: 1, label: 'Nowe w folii' },
  'nowe-bez-folii': { fill: 1, label: 'Nowe' },
  testowane: { fill: 0.98, label: 'Testowane' },
  '90-100': { fill: 0.95, label: '90–100%' },
  '70-90': { fill: 0.8, label: '70–90%' },
  '50-70': { fill: 0.6, label: '50–70%' },
  'ponizej-50': { fill: 0.35, label: '<50%' },
};

// Option value of the "pojemnosc_odlewki" field → millilitres
const DECANT_SIZES = { '2ml': 2, '5ml': 5, '10ml': 10 };

/**
 * Fill level and label for the badge. Bottles use the "stan" field; decants
 * have no "stan", so they show their size instead (e.g. "Odlewka 5 ml").
 */
export const getStanInfo = publicData => {
  const stan = STAN_LEVELS[publicData?.stan];
  if (stan) {
    return stan;
  }
  const decant = DECANT_SIZES[publicData?.pojemnosc_odlewki];
  return decant ? { fill: 0.85, label: `Odlewka ${decant} ml` } : null;
};

/**
 * Millilitres the price is for: the decant size for decants, otherwise the
 * bottle capacity. Returns null when the listing has neither.
 */
export const getMillilitres = publicData => {
  const decant = DECANT_SIZES[publicData?.pojemnosc_odlewki];
  if (decant) {
    return decant;
  }
  const ml = Number(publicData?.pojemnosc_ml);
  return Number.isFinite(ml) && ml > 0 ? ml : null;
};

/**
 * Formatted price per millilitre, e.g. "3,89 zł/ml", or null.
 * Price amount is in minor units (grosze), as in the Sharetribe API.
 */
export const formatPricePerMl = (price, publicData, intl, currency) => {
  const ml = getMillilitres(publicData);
  if (!ml || !price || price.currency !== currency || !(price.amount > 0)) {
    return null;
  }
  const perMl = price.amount / 100 / ml;
  const formatted = intl.formatNumber(perMl, {
    style: 'currency',
    currency: price.currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${formatted}/ml`;
};

/**
 * Small badge drawn over the card image: a bottle outline filled to the
 * level of the "stan" field (or the decant size), plus its label. Renders
 * nothing for listings without either field.
 */
export const BottleLevelBadge = props => {
  const { publicData } = props;
  const stan = getStanInfo(publicData);
  if (!stan) {
    return null;
  }

  // Bottle body spans y = 9..31 in the 24x32 viewBox.
  const bodyTop = 9;
  const bodyHeight = 22;
  const liquidHeight = bodyHeight * stan.fill;
  const liquidY = bodyTop + bodyHeight - liquidHeight;
  const clipId = `refume-bottle-${props.id || 'card'}`;

  return (
    <div className={css.bottleBadge}>
      <svg
        className={css.bottleIcon}
        viewBox="0 0 24 32"
        width="14"
        height="19"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <clipPath id={clipId}>
            <rect x="3" y={bodyTop} width="18" height={bodyHeight} rx="4" />
          </clipPath>
        </defs>
        <rect x="9" y="1" width="6" height="5" rx="1" fill="currentColor" />
        <rect x="10.5" y="6" width="3" height="3" fill="currentColor" />
        <rect
          x="3"
          y={liquidY}
          width="18"
          height={liquidHeight}
          clipPath={`url(#${clipId})`}
          className={css.bottleLiquid}
        />
        <rect
          x="3"
          y={bodyTop}
          width="18"
          height={bodyHeight}
          rx="4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        />
      </svg>
      <span>{stan.label}</span>
    </div>
  );
};
