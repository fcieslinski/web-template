import { getStanInfo, getMillilitres, formatPricePerMl } from './ListingCard.refume';

const intl = {
  formatNumber: (value, opts) =>
    new Intl.NumberFormat('pl-PL', opts).format(value),
};

describe('Refume listing card helpers', () => {
  it('maps "stan" option values to a fill level and label', () => {
    expect(getStanInfo({ stan: '70-90' })).toEqual({ fill: 0.8, label: '70–90%' });
    expect(getStanInfo({ stan: 'nowe-folia' }).fill).toBe(1);
    expect(getStanInfo({ stan: 'nieznane' })).toBeNull();
    expect(getStanInfo(undefined)).toBeNull();
  });

  it('labels decants by size when there is no "stan"', () => {
    expect(getStanInfo({ pojemnosc_odlewki: '5ml' }).label).toBe('Odlewka 5 ml');
  });

  it('uses decant size before bottle capacity', () => {
    expect(getMillilitres({ pojemnosc_odlewki: '10ml', pojemnosc_ml: 100 })).toBe(10);
    expect(getMillilitres({ pojemnosc_ml: 50 })).toBe(50);
    expect(getMillilitres({ pojemnosc_ml: 0 })).toBeNull();
    expect(getMillilitres({})).toBeNull();
  });

  it('formats price per millilitre from minor units', () => {
    const price = { amount: 38900, currency: 'PLN' };
    const result = formatPricePerMl(price, { pojemnosc_ml: 100 }, intl, 'PLN');
    expect(result.replace(/\s/g, ' ')).toBe('3,89 zł/ml');
  });

  it('returns null when price per ml cannot be computed', () => {
    const price = { amount: 38900, currency: 'PLN' };
    expect(formatPricePerMl(price, {}, intl, 'PLN')).toBeNull();
    expect(formatPricePerMl(price, { pojemnosc_ml: 100 }, intl, 'EUR')).toBeNull();
    expect(formatPricePerMl(null, { pojemnosc_ml: 100 }, intl, 'PLN')).toBeNull();
  });
});
