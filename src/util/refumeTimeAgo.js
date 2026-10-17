/**
 * Refume: "5 minut temu", "2 godziny temu", "3 dni temu", "1 miesiąc temu" (Polish plurals).
 */
const plural = (n, one, few, many) => {
  if (n === 1) return one;
  const lastTwo = n % 100;
  const last = n % 10;
  return last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14) ? few : many;
};

export const timeAgoPl = (date, now = new Date()) => {
  const then = date instanceof Date ? date : new Date(date);
  const seconds = Math.max(0, Math.floor((now.getTime() - then.getTime()) / 1000));
  if (Number.isNaN(seconds)) return '';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 1) return 'przed chwilą';
  if (minutes < 60) return `${minutes} ${plural(minutes, 'minutę', 'minuty', 'minut')} temu`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${plural(hours, 'godzinę', 'godziny', 'godzin')} temu`;

  const days = Math.floor(hours / 24);
  if (days === 1) return 'wczoraj';
  if (days < 30) return `${days} ${plural(days, 'dzień', 'dni', 'dni')} temu`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months} ${plural(months, 'miesiąc', 'miesiące', 'miesięcy')} temu`;

  const years = Math.floor(days / 365);
  return `${years} ${plural(years, 'rok', 'lata', 'lat')} temu`;
};
