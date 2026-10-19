/* eslint-disable */
// GENERATED from src/util/refumeChatSafety.js — do not edit by hand. Regenerate with:
// npx esbuild src/util/refumeChatSafety.js --format=cjs --platform=node --outfile=server/api-util/refumeChatSafety.generated.js
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var refumeChatSafety_exports = {};
__export(refumeChatSafety_exports, {
  detectChatRisks: () => detectChatRisks,
  hasHiddenPhone: () => hasHiddenPhone,
  maskContactDetails: () => maskContactDetails,
  untrustedLinks: () => untrustedLinks
});
module.exports = __toCommonJS(refumeChatSafety_exports);
const TRUSTED_HOSTS = [
  "refume.pl",
  "localhost",
  "inpost.pl",
  "dpd.com.pl",
  "pocztex.pl",
  "poczta-polska.pl",
  "orlenpaczka.pl",
  "fragrantica.com",
  "fragrantica.pl"
];
const URL_RE = /\b((?:https?:\/\/|www\.)[^\s<>"')]+|[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:pl|com|net|org|info|xyz|top|shop|online|site|link|app|io|me|eu|biz|cc|ru)(?:\/[^\s<>"')]*)?)/gi;
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const PHONE_RE = /(?<!\d)(?:(?:\+|00)48[\s-]?)?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{3}(?!\d)/;
const ACCOUNT_RE = /\b(?:PL)?\s?\d{2}(?:[\s-]?\d{4}){6}\b/i;
const OFF_PLATFORM_RE = /\b(blik\w*|przelew\w*|na\s+konto|numer\s+konta|whats\s?app|telegram\w*|signal\w*|messenger\w*|viber|revolut\w*|paypal\w*|poza\s+(?:refume|serwisem|portalem|aplikacj\w*|stron\w*)|bez\s+(?:refume|pośrednictwa|posrednictwa)|napisz\s+(?:sms|na\s+priv)|kod\s+(?:odbioru|weryfikacyjny)|(?:odbierz|odebrać|odebrac|odbiór|odbior)\s+(?:pieniądze|pieniadze|pieniędzy|pieniedzy|płatność|platnosc|płatności|platnosci|środki|srodki|środków|srodkow))(?![a-z0-9ąćęłńóśźż])/i;
const hostOf = (raw) => {
  try {
    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    return new URL(withProtocol).hostname.toLowerCase().replace(/^www\./, "");
  } catch (e) {
    return null;
  }
};
const isTrustedHost = (host) => !!host && TRUSTED_HOSTS.some((t) => host === t || host.endsWith(`.${t}`));
const untrustedLinks = (text) => {
  const hosts = /* @__PURE__ */ new Set();
  String(text || "").replace(URL_RE, (match) => {
    const host = hostOf(match.replace(/[.,;:!?]+$/, ""));
    if (host && !isTrustedHost(host)) hosts.add(host);
    return match;
  });
  const emailHosts = (String(text || "").match(new RegExp(EMAIL_RE.source, "gi")) || []).map(
    (e) => e.split("@")[1].toLowerCase()
  );
  emailHosts.forEach((h) => hosts.delete(h));
  return Array.from(hosts);
};
const L = "a-z\u0105\u0107\u0119\u0142\u0144\xF3\u015B\u017A\u017C";
const word = (w) => new RegExp(`(?<![${L}])(?:${w})(?![${L}])`, "g");
const DIGIT_WORDS = [
  [word("zero"), "0"],
  [word("jeden|jedna|jedno|jedynka"), "1"],
  [word("dwa|dwie|dw\xF3jka|dwojka"), "2"],
  [word("trzy|tr\xF3jka|trojka"), "3"],
  [word("cztery|czw\xF3rka|czworka"), "4"],
  [word("pi\u0119\u0107|piec|pi\u0105tka|piatka"), "5"],
  [word("sze\u015B\u0107|szesc|sz\xF3stka|szostka"), "6"],
  [word("siedem|si\xF3demka|siodemka"), "7"],
  [word("osiem|\xF3semka|osemka"), "8"],
  [word("dziewi\u0119\u0107|dziewiec|dziewi\u0105tka|dziewiatka"), "9"]
];
const NOT_PHONE_RE = /\d+(?:[.,]\d+)?\s*(?:zł|zl|pln|ml|l\b|g\b|%|szt|sztuk|x\b|cm|mm|lat|rok|roku|r\.)/gi;
const DATE_RE = /\b\d{1,2}[./-]\d{1,2}[./-](?:19|20)?\d{2}\b/g;
const hasHiddenPhone = (text) => {
  let t = String(text || "").toLowerCase();
  t = t.replace(NOT_PHONE_RE, " ").replace(DATE_RE, " ");
  DIGIT_WORDS.forEach(([re2, d]) => {
    t = t.replace(re2, ` ${d} `);
  });
  let previous;
  do {
    previous = t;
    t = t.replace(/(\d[^a-ząćęłńóśźż\d]{0,3})o/g, "$10");
  } while (t !== previous);
  const re = /\d(?:[^a-ząćęłńóśźż\d]{0,12}\d){8,}/g;
  const matches = t.match(re) || [];
  return matches.some((m) => {
    let digits = m.replace(/\D/g, "");
    if (digits.length < 9) return false;
    if (/^\d{12,}$/.test(m)) return false;
    if (/\d{2,},\s/.test(m) && m.split(/,\s*/).every((part) => /^\d{2,4}$/.test(part.trim()))) {
      return false;
    }
    if (digits.length >= 11 && digits.startsWith("48")) digits = digits.slice(2);
    if (digits.length >= 13 && digits.startsWith("0048")) digits = digits.slice(4);
    return /^[4-8]/.test(digits);
  });
};
const detectChatRisks = (text) => {
  const t = String(text || "");
  const withoutAccount = t.replace(ACCOUNT_RE, "");
  const contact = EMAIL_RE.test(t) || PHONE_RE.test(withoutAccount) || hasHiddenPhone(withoutAccount);
  const payment = ACCOUNT_RE.test(t) || OFF_PLATFORM_RE.test(t);
  const links = untrustedLinks(t);
  return { contact, payment, links, any: contact || payment || links.length > 0 };
};
const MASK = "\u2022\u2022\u2022";
const DIGIT_WORD_ANY = new RegExp(
  `(?<![${L}])(?:zero|jeden|jedna|jedno|dwa|dwie|trzy|cztery|pi\u0119\u0107|piec|sze\u015B\u0107|szesc|siedem|osiem|dziewi\u0119\u0107|dziewiec)(?![${L}])`,
  "gi"
);
const maskContactDetails = (text, hideAllDigits = false) => {
  const original = String(text || "");
  let t = original.replace(new RegExp(EMAIL_RE.source, "gi"), MASK).replace(new RegExp(ACCOUNT_RE.source, "gi"), MASK).replace(new RegExp(PHONE_RE.source, "g"), MASK);
  if (hideAllDigits || hasHiddenPhone(t)) {
    t = t.replace(/\d/g, "\u2022").replace(DIGIT_WORD_ANY, MASK);
  }
  return { text: t, masked: t !== original };
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  detectChatRisks,
  hasHiddenPhone,
  maskContactDetails,
  untrustedLinks
});
