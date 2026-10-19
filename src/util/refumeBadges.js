/**
 * Refume: seller badges shown on the listing page and the profile.
 * The rules are applied on the server (server/api-util/refumeBadges.js) — keep texts in sync.
 */
export const SELLER_BADGES = [
  {
    key: 'szybkaWysylka',
    label: 'Szybka wysyłka',
    icon: 'bolt',
    description:
      'Wysyła zamówienia w ciągu 24 godzin od zapłaty (co najmniej 80% z ostatnich zamówień, minimum 3).',
  },
  {
    key: 'topSprzedawca',
    label: 'Top sprzedawca',
    icon: 'star',
    description:
      'Ma co najmniej 10 udanych sprzedaży, średnią ocen 4,7 lub wyższą (min. 5 opinii), prawie nie anuluje zamówień i sprzedawał w ostatnich 90 dniach.',
  },
];

/** @returns {Array<Object>} badge definitions the seller has earned */
export const earnedBadges = badges => SELLER_BADGES.filter(b => badges?.[b.key]);
