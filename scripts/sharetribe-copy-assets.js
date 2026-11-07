#!/usr/bin/env node
/**
 * Refume: copies the Console settings (hosted assets) of one marketplace into a folder pulled
 * from another with `flex-cli assets pull`, ready for `flex-cli assets push`.
 *
 * The old settings are read through the public Asset Delivery API, so only the old marketplace's
 * client ID is needed (no login to the old account).
 *
 *   node scripts/sharetribe-copy-assets.js <old client ID> <folder pulled from the new marketplace>
 *
 * Images (logo, favicon, page images) belong to the old marketplace and can't be referenced from
 * the new one: they're left out and listed at the end, to be uploaded again in Console.
 */
const fs = require('fs');
const path = require('path');

const ASSET_PATHS = [
  'general/localization.json',
  'general/access-control.json',
  'content/translations.json',
  'content/email-texts.json',
  'content/footer.json',
  'content/top-bar.json',
  'content/pages/landing-page.json',
  'content/pages/about.json',
  'content/pages/terms-of-service.json',
  'content/pages/privacy-policy.json',
  'content/pages/faq.json',
  'design/branding.json',
  'design/layout.json',
  'users/user-types.json',
  'users/user-fields.json',
  'listings/listing-types.json',
  'listings/listing-categories.json',
  'listings/listing-fields.json',
  'listings/listing-search.json',
  'transactions/minimum-transaction-size.json',
  'transactions/commission.json',
  'integrations/map.json',
  'integrations/analytics.json',
  'integrations/google-search-console.json',
];

const [clientId, dir] = process.argv.slice(2);
if (!/^[0-9a-f-]{36}$/i.test(clientId || '') || !dir || !fs.existsSync(dir)) {
  console.error('Użycie: node scripts/sharetribe-copy-assets.js <stary client ID> <folder z assets pull>');
  process.exit(1);
}

const isImageRef = v =>
  v && typeof v === 'object' && v._ref && typeof v._ref === 'object' && v._ref.type === 'imageAsset';

// Removes references to the old marketplace's images; returns the JSON paths that had one
const stripImages = (value, at, found) => {
  if (Array.isArray(value)) {
    return value.map((v, i) => stripImages(v, `${at}[${i}]`, found)).filter(v => v !== undefined);
  }
  if (value && typeof value === 'object') {
    if (isImageRef(value)) {
      found.push(at);
      return undefined;
    }
    const out = {};
    Object.entries(value).forEach(([k, v]) => {
      const next = stripImages(v, at ? `${at}.${k}` : k, found);
      if (next !== undefined) out[k] = next;
    });
    return out;
  }
  return value;
};

const main = async () => {
  const report = { copied: [], missing: [], images: [] };
  for (const p of ASSET_PATHS) {
    const url = `https://cdn.st-api.com/v1/assets/pub/${clientId}/a/latest/${p}`;
    const res = await fetch(url);
    if (res.status === 404) {
      report.missing.push(p);
      continue;
    }
    if (!res.ok) throw new Error(`${p}: HTTP ${res.status}`);
    const body = await res.json();
    const found = [];
    const data = stripImages(body.data, '', found);
    found.forEach(f => report.images.push(`${p}: ${f}`));
    const file = path.join(dir, p);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
    report.copied.push(p);
  }
  console.log(`Skopiowane (${report.copied.length}):\n  ${report.copied.join('\n  ')}`);
  if (report.missing.length) {
    console.log(`\nNie było ich w starym marketplace (zostają jak w nowym):\n  ${report.missing.join('\n  ')}`);
  }
  if (report.images.length) {
    console.log(`\nObrazki do wgrania od nowa w Console:\n  ${report.images.join('\n  ')}`);
  }
  console.log('\nTeraz: npx flex-cli assets push -m <nowy marketplace> --path ' + dir);
};

main().catch(e => {
  console.error('Błąd:', e.message);
  process.exit(1);
});
