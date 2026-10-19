/**
 * Refume: chat safety — spots contact details, payment outside Refume and links in a
 * message, so the sender and the recipient can be warned. Runs in the browser only; it
 * warns, it doesn't block.
 */

// Links to these sites (and their subdomains) are shown as normal links
const TRUSTED_HOSTS = [
  'refume.pl',
  'localhost',
  'inpost.pl',
  'dpd.com.pl',
  'pocztex.pl',
  'poczta-polska.pl',
  'orlenpaczka.pl',
  'fragrantica.com',
  'fragrantica.pl',
];

const URL_RE = /\b((?:https?:\/\/|www\.)[^\s<>"')]+|[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:pl|com|net|org|info|xyz|top|shop|online|site|link|app|io|me|eu|biz|cc|ru)(?:\/[^\s<>"')]*)?)/gi;
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
// Polish phone numbers: +48 123 456 789, 123-456-789, 123456789
const PHONE_RE = /(?<!\d)(?:(?:\+|00)48[\s-]?)?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{3}(?!\d)/;
// Bank account (26 digits, optionally "PL", spaces)
const ACCOUNT_RE = /\b(?:PL)?\s?\d{2}(?:[\s-]?\d{4}){6}\b/i;
const OFF_PLATFORM_RE = /\b(blik\w*|przelew\w*|na\s+konto|numer\s+konta|whats\s?app|telegram\w*|signal\w*|messenger\w*|viber|revolut\w*|paypal\w*|poza\s+(?:refume|serwisem|portalem|aplikacj\w*|stron\w*)|bez\s+(?:refume|pośrednictwa|posrednictwa)|napisz\s+(?:sms|na\s+priv)|kod\s+(?:odbioru|weryfikacyjny)|(?:odbierz|odebrać|odebrac|odbiór|odbior)\s+(?:pieniądze|pieniadze|pieniędzy|pieniedzy|płatność|platnosc|płatności|platnosci|środki|srodki|środków|srodkow))(?![a-z0-9ąćęłńóśźż])/i;

const hostOf = raw => {
  try {
    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    return new URL(withProtocol).hostname.toLowerCase().replace(/^www\./, '');
  } catch (e) {
    return null;
  }
};

const isTrustedHost = host =>
  !!host && TRUSTED_HOSTS.some(t => host === t || host.endsWith(`.${t}`));

/** Hosts of links in the text that are not on the trusted list. */
export const untrustedLinks = text => {
  const hosts = new Set();
  String(text || '').replace(URL_RE, match => {
    // Skip e-mail addresses ("jan@gmail.com")
    const host = hostOf(match.replace(/[.,;:!?]+$/, ''));
    if (host && !isTrustedHost(host)) hosts.add(host);
    return match;
  });
  // Remove hosts that only appear as part of an e-mail address
  const emailHosts = (String(text || '').match(new RegExp(EMAIL_RE.source, 'gi')) || []).map(e =>
    e.split('@')[1].toLowerCase()
  );
  emailHosts.forEach(h => hosts.delete(h));
  return Array.from(hosts);
};

// ---------- Hidden phone numbers ("5..0.0 2-3 %4", "pięć zero zero", split messages) ----------

const L = 'a-ząćęłńóśźż';
const word = w => new RegExp(`(?<![${L}])(?:${w})(?![${L}])`, 'g');
const DIGIT_WORDS = [
  [word('zero'), '0'],
  [word('jeden|jedna|jedno|jedynka'), '1'],
  [word('dwa|dwie|dwójka|dwojka'), '2'],
  [word('trzy|trójka|trojka'), '3'],
  [word('cztery|czwórka|czworka'), '4'],
  [word('pięć|piec|piątka|piatka'), '5'],
  [word('sześć|szesc|szóstka|szostka'), '6'],
  [word('siedem|siódemka|siodemka'), '7'],
  [word('osiem|ósemka|osemka'), '8'],
  [word('dziewięć|dziewiec|dziewiątka|dziewiatka'), '9'],
];

// Amounts, sizes, dates and percentages are not phone numbers
const NOT_PHONE_RE = /\d+(?:[.,]\d+)?\s*(?:zł|zl|pln|ml|l\b|g\b|%|szt|sztuk|x\b|cm|mm|lat|rok|roku|r\.)/gi;
const DATE_RE = /\b\d{1,2}[./-]\d{1,2}[./-](?:19|20)?\d{2}\b/g;

/**
 * True when the text hides at least 9 digits in a short stretch, e.g. "5..0.0 2-3 %4 5 6 7 8"
 * or digits written as words. Normal prices ("250 zł za 100 ml") don't count.
 */
export const hasHiddenPhone = text => {
  let t = String(text || '').toLowerCase();
  t = t.replace(NOT_PHONE_RE, ' ').replace(DATE_RE, ' ');
  DIGIT_WORDS.forEach(([re, d]) => {
    t = t.replace(re, ` ${d} `);
  });
  // Letters used instead of digits right after a digit ("5oo" → "500", "1l" stays)
  let previous;
  do {
    previous = t;
    t = t.replace(/(\d[^a-ząćęłńóśźż\d]{0,3})o/g, '$10');
  } while (t !== previous);
  // Look for 9+ digits where the gaps between digits are short and contain no letters
  const re = /\d(?:[^a-ząćęłńóśźż\d]{0,12}\d){8,}/g;
  const matches = t.match(re) || [];
  return matches.some(m => {
    let digits = m.replace(/\D/g, '');
    if (digits.length < 9) return false;
    // Long plain numbers like order or tracking numbers (no separators, 12+ digits) are fine
    if (/^\d{12,}$/.test(m)) return false;
    // A list like "150, 220, 380" is not a phone number
    if (/\d{2,},\s/.test(m) && m.split(/,\s*/).every(part => /^\d{2,4}$/.test(part.trim()))) {
      return false;
    }
    if (digits.length >= 11 && digits.startsWith('48')) digits = digits.slice(2);
    if (digits.length >= 13 && digits.startsWith('0048')) digits = digits.slice(4);
    // Polish mobile numbers start with 4–8
    return /^[4-8]/.test(digits);
  });
};

/**
 * @returns {{ contact: boolean, payment: boolean, links: string[], any: boolean }}
 *   contact: phone number or e-mail; payment: account number, BLIK, transfer, other apps
 */
export const detectChatRisks = text => {
  const t = String(text || '');
  const withoutAccount = t.replace(ACCOUNT_RE, '');
  const contact =
    EMAIL_RE.test(t) || PHONE_RE.test(withoutAccount) || hasHiddenPhone(withoutAccount);
  const payment = ACCOUNT_RE.test(t) || OFF_PLATFORM_RE.test(t);
  const links = untrustedLinks(t);
  return { contact, payment, links, any: contact || payment || links.length > 0 };
};
