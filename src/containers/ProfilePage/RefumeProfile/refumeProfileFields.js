/**
 * Refume: extra things a user sets on their own profile (user publicData).
 *   refumeMiasto: string (city, max 60 chars)
 *   refumeWysylka: '24h' | '1-2' | '3-5' (how fast they usually ship)
 */
export const SHIPPING_SPEED_OPTIONS = [
  { key: '24h', label: 'Wysyłam w 24 h' },
  { key: '1-2', label: 'Wysyłam w 1–2 dni' },
  { key: '3-5', label: 'Wysyłam w 3–5 dni' },
];
export const BIO_MAX = 600;
export const CITY_MAX = 60;

export const shippingSpeedLabel = key => SHIPPING_SPEED_OPTIONS.find(o => o.key === key)?.label || null;
export const cleanCity = city => (typeof city === 'string' ? city.trim().slice(0, CITY_MAX) : '');
