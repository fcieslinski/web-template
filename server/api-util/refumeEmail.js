/**
 * Refume: transactional emails that Sharetribe doesn't send itself
 * (e.g. proof-of-purchase moderation result), via Resend (https://resend.com).
 *
 * Env:
 * - RESEND_API_KEY   required; without it emails are skipped (logged only)
 * - REFUME_EMAIL_FROM sender, e.g. "Refume <powiadomienia@twojadomena.pl>".
 *   Defaults to Resend's test sender, which only delivers to the Resend account owner.
 */
const RESEND_URL = 'https://api.resend.com/emails';
const DEFAULT_FROM = 'Refume <onboarding@resend.dev>';

const escapeHtml = s =>
  String(s || '').replace(
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );

const isEmailConfigured = () => !!process.env.RESEND_API_KEY;

const sendEmail = async ({ to, subject, text, html }) => {
  if (!isEmailConfigured()) {
    console.log(`[refume-email] RESEND_API_KEY not set, skipping email to ${to}: ${subject}`);
    return { skipped: true };
  }
  const res = await fetch(RESEND_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.REFUME_EMAIL_FROM || DEFAULT_FROM,
      to: [to],
      subject,
      text,
      html,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Resend error ${res.status}: ${body}`);
  }
  return res.json();
};

/**
 * Email the seller about the moderator's decision on their proof of purchase.
 */
const proofDecisionEmail = ({ sellerName, listingTitle, isApproved, reason, editUrl }) => {
  const greeting = sellerName ? `Cześć ${sellerName},` : 'Cześć,';
  const subject = isApproved
    ? `Dowód zakupu zatwierdzony: ${listingTitle}`
    : `Dowód zakupu odrzucony: ${listingTitle}`;
  const lines = isApproved
    ? [
        greeting,
        `moderator sprawdził dowód zakupu do ogłoszenia „${listingTitle}”.`,
        'Ogłoszenie ma teraz znacznik „Zweryfikowano dowodem zakupu”.',
      ]
    : [
        greeting,
        `moderator nie zatwierdził dowodu zakupu do ogłoszenia „${listingTitle}”.`,
        `Powód: ${reason}`,
        'Możesz wysłać nowe zdjęcie w edycji ogłoszenia, w kroku „Zdjęcia”.',
      ];
  const linkLabel = isApproved ? 'Zobacz ogłoszenie' : 'Wyślij nowe zdjęcie';
  const text = [...lines, '', `${linkLabel}: ${editUrl}`, '', 'Zespół Refume'].join('\n');
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#1d1a24">
${lines.map(l => `<p>${escapeHtml(l)}</p>`).join('\n')}
<p><a href="${escapeHtml(editUrl)}" style="display:inline-block;padding:10px 18px;background:#1d1a24;color:#fff;border-radius:8px;text-decoration:none">${linkLabel}</a></p>
<p>Zespół Refume</p></div>`;
  return { subject, text, html };
};

module.exports = { sendEmail, isEmailConfigured, proofDecisionEmail, escapeHtml };
