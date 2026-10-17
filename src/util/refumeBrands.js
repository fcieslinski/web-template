/**
 * Refume: perfume brand list for autocomplete, so the same brand is always saved the same
 * way ("Dior", not "dior" or "Doir"). Sellers can still type a brand that isn't listed.
 * Add brands here when you see new ones in listings.
 */
export const PERFUME_BRANDS = [
  // Designer
  'Acqua di Parma', 'Alexander McQueen', 'Armani', 'Azzaro', 'Balenciaga', 'Balmain',
  'Banana Republic', 'Bentley', 'Boucheron', 'Bottega Veneta', 'Burberry', 'Bvlgari',
  'Cacharel', 'Calvin Klein', 'Carolina Herrera', 'Cartier', 'Celine', 'Cerruti', 'Chanel',
  'Chloé', 'Chopard', 'Christian Louboutin', 'Coach', 'Davidoff', 'Diesel', 'Dior',
  'DKNY', 'Dolce & Gabbana', 'Dsquared2', 'Dunhill', 'Elie Saab', 'Elizabeth Arden',
  'Emporio Armani', 'Ermenegildo Zegna', 'Escada', 'Estée Lauder', 'Fendi', 'Ferragamo',
  'Giorgio Armani', 'Givenchy', 'Gucci', 'Guerlain', 'Guess', 'Hermès', 'Hugo Boss',
  'Issey Miyake', 'Jean Paul Gaultier', 'Jimmy Choo', 'Joop!', 'Kenzo', 'Lacoste',
  'Lalique', 'Lancôme', 'Lanvin', 'Loewe', 'Marc Jacobs', 'Michael Kors', 'Missoni',
  'Montblanc', 'Moschino', 'Mugler', 'Narciso Rodriguez', 'Nina Ricci',
  'Rabanne', 'Prada', 'Ralph Lauren', 'Roberto Cavalli', 'Salvatore Ferragamo',
  'Valentino', 'Van Cleef & Arpels', 'Versace', 'Viktor & Rolf', 'Yves Saint Laurent',
  'Zadig & Voltaire', 'Tommy Hilfiger', 'Trussardi', 'Bruno Banani', 'Police', 'Replay',
  'Lolita Lempicka', 'Chopard', 'Comme des Garçons', 'Maison Margiela',
  'Miu Miu', 'Oscar de la Renta', 'Paul Smith', 'Reebok', 'Adidas', 'Nike', 'Puma',
  'Mexx', 'Hollister', 'Abercrombie & Fitch', 'Victoria\'s Secret', 'Ariana Grande',
  'Britney Spears', 'Billie Eilish', 'Jennifer Lopez', 'Paris Hilton', 'Lady Gaga',
  'Rihanna', 'Taylor Swift', 'Kylie Jenner',
  // Niche & luxury
  'Amouage', 'Atelier Cologne', 'Atelier des Ors', 'BDK Parfums', 'Bond No. 9',
  'Boadicea the Victorious', 'Byredo', 'Clive Christian', 'Creed', 'Diptyque',
  'Electimuss', 'Escentric Molecules', 'Ex Nihilo', 'Floris', 'Frederic Malle',
  'Goldfield & Banks', 'Histoires de Parfums', 'Initio', 'Jo Malone', 'Juliette Has a Gun',
  'Kajal', 'Kilian', 'L\'Artisan Parfumeur', 'Le Labo', 'Les Indémodables', 'Liquides Imaginaires',
  'Louis Vuitton', 'Maison Crivelli', 'Maison Francis Kurkdjian', 'Mancera', 'Memo Paris',
  'Montale', 'Nasomatto', 'Nishane', 'Orto Parisi', 'Parfums de Marly', 'Penhaligon\'s',
  'Roja Parfums', 'Serge Lutens', 'Sospiro', 'Tiziana Terenzi', 'Tom Ford', 'Vilhelm Parfumerie',
  'Xerjoff', 'Zoologist', 'Essential Parfums', 'Etat Libre d\'Orange', 'Frapin',
  'Imaginary Authors', 'Mind Games', 'Nicolai', 'Ormonde Jayne', 'Profumum Roma',
  'Room 1015', 'Simone Andreoli', 'The Merchant of Venice', 'Thameen', 'Unique\'e Luxury',
  'Widian', 'Zarkoperfume', 'Acqua dell\'Elba', 'Annick Goutal', 'Arquiste',
  'Astier de Villatte', 'Bohoboco', 'Carner Barcelona', 'D.S. & Durga', 'Dusita',
  'Eight & Bob', 'Filippo Sorcinelli', 'Fueguia 1833', 'Hiram Green', 'Jovoy',
  'Lorenzo Villoresi', 'Marc-Antoine Barrois', 'Masque Milano', 'MiN New York',
  'Nobile 1942', 'Olfactive Studio', 'Parfum d\'Empire', 'Puredistance', 'Rance 1795',
  'Sylvaine Delacourte', 'Trudon', 'Arquiste', 'Kayali', 'Ellis Brooklyn', 'Phlur',
  'Henry Rose', 'Commodity', 'Glossier', 'Sol de Janeiro',   'Officine Universelle Buly', 'Aesop', 'Mizensir',
  'Akro', 'Atkinsons', 'Berdoues', 'Caron', 'Houbigant', 'Jacques Fath', 'Lubin',
  'Ninel Perfume', 'Perris Monte Carlo', 'Stéphane Humbert Lucas 777', 'Spiritum',
  // Middle East & inspired
  'Afnan', 'Ajmal', 'Al Haramain', 'Al Rehab', 'Ard Al Zaafaran', 'Armaf', 'Arabian Oud',
  'Fragrance World', 'French Avenue', 'Lattafa', 'Maison Alhambra', 'Nabeel', 'Paris Corner',
  'Rasasi', 'Swiss Arabian', 'Rayhaan', 'Zimaya', 'Emper', 'Khadlaj', 'Orientica',
  'Ahmed Al Maghribi', 'Abdul Samad Al Qurashi', 'Bait Al Bakhoor',
  'Riiffs', 'Sterling Parfums',   // Mass market & high street
  'Zara', 'H&M', 'Mango', 'Massimo Dutti', 'Bershka', 'Pull&Bear', 'Stradivarius',
  'Reserved', 'Avon', 'Oriflame', 'Yves Rocher', 'The Body Shop', 'Bath & Body Works',
  'Rituals', 'Adidas', 'Playboy', 'Antonio Banderas', 'Adam Levine', 'Beyoncé',
  'Bourjois', 'Jeanne Arthes', 'Laura Biagiotti', 'Salvador Dalí', 'Iceberg', 'Byblos',
  'Benetton', 'United Colors of Benetton', 'Pepe Jeans', 'Tous', 'Desigual', 'Aigner',
  'Bugatti', 'Ferrari', 'Mercedes-Benz', 'Porsche Design', 'Jaguar', 'Lamborghini',
  'Paris Bleu', 'Next', 'Primark',
  // Polish
  'Bruno Banani', 'Bi-es', 'Chat d\'Or', 'Federico Mahora', 'FM World', 'Inglot',
  'Pani Walewska', 'Perfumy Być Może', 'Wars', 'Ziaja', 'Vittorio Bellucci', 
  'Mohito', 'Sinsay', 'Cropp', 'House', 'Madaliński',
];

const normalize = s =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '');

// Unique, sorted list (duplicates above are harmless)
export const BRANDS = Array.from(new Set(PERFUME_BRANDS)).sort((a, b) =>
  a.localeCompare(b, 'pl')
);

// Common short names and old names → brand
const ALIASES = {
  ysl: 'Yves Saint Laurent',
  'saint laurent': 'Yves Saint Laurent',
  'd&g': 'Dolce & Gabbana',
  dg: 'Dolce & Gabbana',
  jpg: 'Jean Paul Gaultier',
  mfk: 'Maison Francis Kurkdjian',
  pdm: 'Parfums de Marly',
  'de marly': 'Parfums de Marly',
  ck: 'Calvin Klein',
  ch: 'Carolina Herrera',
  'mont blanc': 'Montblanc',
  'thierry mugler': 'Mugler',
  'paco rabanne': 'Rabanne',
  'maison martin margiela': 'Maison Margiela',
  'by kilian': 'Kilian',
  'kilian paris': 'Kilian',
  'tiziana terenzi': 'Tiziana Terenzi',
  
  alhambra: 'Maison Alhambra',
  'hugo': 'Hugo Boss',
  boss: 'Hugo Boss',
  'jo malone london': 'Jo Malone',
};

const BY_KEY = new Map([
  ...BRANDS.map(b => [normalize(b), b]),
  ...Object.entries(ALIASES).map(([alias, brand]) => [normalize(alias), brand]),
]);

/** Exact brand ignoring case, accents, spaces and punctuation ("dolce gabbana" → "Dolce & Gabbana"). */
export const canonicalBrand = value => {
  const trimmed = String(value || '').trim().replace(/\s+/g, ' ');
  return BY_KEY.get(normalize(trimmed)) || trimmed;
};

export const isKnownBrand = value => BY_KEY.has(normalize(value));

/** Suggestions for what the seller is typing: prefix matches first, then word / substring matches. */
export const suggestBrands = (query, limit = 8) => {
  const q = normalize(query);
  if (!q) return [];
  const aliasHits = Object.entries(ALIASES)
    .filter(([alias]) => normalize(alias) === q || (q.length >= 3 && normalize(alias).startsWith(q)))
    .map(([, brand]) => brand);
  const prefix = [...new Set(aliasHits)];
  const wordPrefix = [];
  const contains = [];
  BRANDS.forEach(b => {
    const n = normalize(b);
    if (prefix.includes(b)) return;
    if (n.startsWith(q)) prefix.push(b);
    else if (
      b
        .toLowerCase()
        .split(/[\s&.'-]+/)
        .some(w => normalize(w).startsWith(q))
    )
      wordPrefix.push(b);
    else if (q.length >= 3 && n.includes(q)) contains.push(b);
  });
  return [...prefix, ...wordPrefix, ...contains].slice(0, limit);
};

const levenshtein = (a, b) => {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
};

/** Closest known brand for a likely typo ("Doir" → "Dior"), or null. */
export const didYouMeanBrand = value => {
  const q = normalize(value);
  if (q.length < 3 || BY_KEY.has(q)) return null;
  const maxDistance = q.length <= 5 ? 1 : 2;
  let best = null;
  let bestDistance = Infinity;
  BRANDS.forEach(b => {
    const n = normalize(b);
    if (Math.abs(n.length - q.length) > maxDistance) return;
    const d = levenshtein(q, n);
    if (d < bestDistance) {
      best = b;
      bestDistance = d;
    }
  });
  // Swapped letters ("doir") count as distance 2; allow that for short names too
  return bestDistance <= Math.max(maxDistance, 2) && bestDistance > 0 ? best : null;
};
