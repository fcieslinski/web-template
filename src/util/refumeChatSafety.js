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
const PHONE_RE = /(?:\+|00)?(?:48)?[\s-]?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{3}\b/;
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

/**
 * @returns {{ contact: boolean, payment: boolean, links: string[], any: boolean }}
 *   contact: phone number or e-mail; payment: account number, BLIK, transfer, other apps
 */
export const detectChatRisks = text => {
  const t = String(text || '');
  const contact = EMAIL_RE.test(t) || PHONE_RE.test(t.replace(ACCOUNT_RE, ''));
  const payment = ACCOUNT_RE.test(t) || OFF_PLATFORM_RE.test(t);
  const links = untrustedLinks(t);
  return { contact, payment, links, any: contact || payment || links.length > 0 };
};
