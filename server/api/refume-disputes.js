/**
 * Refume: disputes ("Zgłoszony problem" after delivery) handled by moderators.
 *
 * Sharetribe lets only the buyer and the seller write messages, so the team "joins" the
 * conversation through transaction metadata: refumeSpor.wiadomosci are shown inside the chat to
 * both parties as messages from "Zespół Refume". Both also get an inbox notification.
 *
 * metadata.refumeSpor = {
 *   wiadomosci: [{ id, tresc, at, przez }],
 *   decyzja: { wynik: 'dla-sprzedawcy' | 'zwrot', uzasadnienie, at, przez } | null
 * }
 *
 * GET  /api/moderacja/spory                       open and recently closed disputes
 * POST /api/moderacja/spor { txId, action, tresc }
 *      action 'wiadomosc'     message in the chat for both + notifications
 *      action 'prywatna'      notification only, to { do: 'kupujacy' | 'sprzedawca' }
 *      action 'dla-sprzedawcy' close: order counts as received, seller is paid
 *      action 'zwrot'         close: full refund to the buyer, order cancelled
 */
const { handleError } = require('../api-util/sdk');
const {
  queryTransactions,
  showTransaction,
  transitionTransaction,
  updateTransactionMetadata,
} = require('../api-util/refumeIntegrationApi');
const { addNotification } = require('../api-util/refumeNotifications');
const { requireModerator, invalidate } = require('./refume-moderation-panel');

const OPEN = ['transition/dispute', 'transition/operator-dispute'];
const CLOSED = [
  'transition/mark-received-from-disputed',
  'transition/cancel-from-disputed',
  'transition/auto-cancel-from-disputed',
];
const KEY = 'refumeSpor';
const MAX_MESSAGES = 50;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const httpError = (status, message) =>
  Object.assign(new Error(message), { status, statusText: message, data: {} });
const clean = (text, max) =>
  String(text || '')
    .replace(/\r/g, '')
    .trim()
    .slice(0, max);
const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const IMAGE_VARIANTS = ['square-small2x', 'square-small', 'landscape-crop', 'default'];
const imageUrl = image => {
  const variants = image?.attributes?.variants || {};
  const name = IMAGE_VARIANTS.find(v => variants[v]?.url) || Object.keys(variants)[0];
  return name ? variants[name].url : null;
};

const toItem = (t, byKey) => {
  const a = t.attributes || {};
  const rel = t.relationships || {};
  const listing = byKey.get(`listing/${rel.listing?.data?.id}`);
  const customer = byKey.get(`user/${rel.customer?.data?.id}`);
  const provider = byKey.get(`user/${rel.provider?.data?.id}`);
  const image = byKey.get(`image/${listing?.relationships?.images?.data?.[0]?.id}`);
  const transitions = a.transitions || [];
  const disputed = [...transitions].reverse().find(tr => OPEN.includes(tr.transition));
  const money = m => (m ? { amount: m.amount, currency: m.currency } : null);
  return {
    id: t.id,
    lastTransition: a.lastTransition,
    open: OPEN.includes(a.lastTransition),
    zgloszono: disputed?.createdAt || null,
    przezOperatora: disputed?.transition === 'transition/operator-dispute',
    powod: clean(a.protectedData?.disputeReason, 2000),
    payinTotal: money(a.payinTotal),
    payoutTotal: money(a.payoutTotal),
    listing: listing
      ? { id: listing.id, title: listing.attributes?.title || '', image: imageUrl(image) }
      : null,
    customer: customer
      ? { id: customer.id, name: customer.attributes?.profile?.displayName || '' }
      : null,
    provider: provider
      ? { id: provider.id, name: provider.attributes?.profile?.displayName || '' }
      : null,
    spor: a.metadata?.[KEY] || null,
    bundle: a.metadata?.refumePakiet?.items?.length || 0,
  };
};

// Recent transactions with one of these last transitions. The filter is also applied here,
// in case the API ignores or refuses the lastTransitions parameter.
const MAX_PAGES = 5;
const query = async lastTransitions => {
  const base = {
    include: 'listing,listing.images,customer,provider',
    'fields.image': 'variants.square-small2x,variants.square-small',
    perPage: 100,
  };
  const items = [];
  let useFilter = true;
  for (let page = 1; page <= MAX_PAGES; page++) {
    let result;
    try {
      result = await queryTransactions({
        ...base,
        page,
        ...(useFilter ? { lastTransitions: lastTransitions.join(',') } : {}),
      });
    } catch (e) {
      if (!useFilter || e.status !== 400) throw e;
      useFilter = false;
      page -= 1;
      continue;
    }
    const byKey = new Map((result.included || []).map(i => [`${i.type}/${i.id}`, i]));
    (result.data || [])
      .filter(t => lastTransitions.includes(t.attributes?.lastTransition))
      .forEach(t => items.push(toItem(t, byKey)));
    if (page >= (result.meta?.totalPages || 1)) break;
  }
  return items;
};

const listDisputes = async () => {
  const [open, closed] = await Promise.all([query(OPEN), query(CLOSED).catch(() => [])]);
  open.sort((a, b) => (a.zgloszono || '').localeCompare(b.zgloszono || ''));
  return { open, closed: closed.slice(0, 30) };
};

const getDisputes = (req, res) => {
  requireModerator(req, res)
    .then(async () => res.status(200).json({ data: await listDisputes() }))
    .catch(e => handleError(res, e));
};

const notifyBoth = (item, notification) =>
  Promise.all(
    [
      item.customer ? addNotification(item.customer.id, { ...notification, txId: item.id, tab: 'orders' }) : null,
      item.provider ? addNotification(item.provider.id, { ...notification, txId: item.id, tab: 'sales' }) : null,
    ].filter(Boolean)
  ).catch(() => null);

const disputeAction = (req, res) => {
  const txId = String(req.body?.txId || '');
  const { action } = req.body || {};
  const tresc = clean(req.body?.tresc, 1500);
  requireModerator(req, res)
    .then(async moderatorId => {
      if (!UUID_RE.test(txId)) throw httpError(400, 'Invalid txId.');
      if (!['wiadomosc', 'prywatna', 'dla-sprzedawcy', 'zwrot'].includes(action)) {
        throw httpError(400, 'Invalid action.');
      }
      if (!tresc) throw httpError(400, 'Napisz treść.');
      const shown = await showTransaction({ id: txId, include: 'listing,customer,provider' });
      const byKey = new Map((shown.included || []).map(i => [`${i.type}/${i.id}`, i]));
      const item = toItem(shown.data, byKey);
      const previous = shown.data.attributes?.metadata?.[KEY] || {};
      const now = new Date().toISOString();
      const title = item.listing?.title || 'zamówienie';

      if (action === 'prywatna') {
        const to = req.body?.do === 'sprzedawca' ? item.provider : item.customer;
        if (!to) throw httpError(400, 'Brak odbiorcy.');
        await addNotification(to.id, {
          type: 'spor-wiadomosc',
          title: `Zespół Refume: zgłoszenie „${title}”`,
          body: tresc,
          txId,
          tab: to === item.provider ? 'sales' : 'orders',
        });
        return res.status(200).json({ data: { ok: true } });
      }

      if (action === 'wiadomosc') {
        const wiadomosci = [
          ...(previous.wiadomosci || []),
          { id: newId(), tresc, at: now, przez: moderatorId },
        ].slice(-MAX_MESSAGES);
        await updateTransactionMetadata({ id: txId, metadata: { [KEY]: { ...previous, wiadomosci } } });
        await notifyBoth(item, {
          type: 'spor-wiadomosc',
          title: `Zespół Refume w sprawie „${title}”`,
          body: tresc,
        });
        return res.status(200).json({ data: { ok: true } });
      }

      // Decisions
      if (!item.open) throw httpError(409, 'To zgłoszenie jest już zamknięte.');
      const transition =
        action === 'dla-sprzedawcy'
          ? 'transition/mark-received-from-disputed'
          : 'transition/cancel-from-disputed';
      await transitionTransaction({ id: txId, transition, params: {} });
      const decyzja = { wynik: action, uzasadnienie: tresc, at: now, przez: moderatorId };
      await updateTransactionMetadata({ id: txId, metadata: { [KEY]: { ...previous, decyzja } } });
      await notifyBoth(item, {
        type: 'spor-rozstrzygniety',
        title:
          action === 'dla-sprzedawcy'
            ? `Zgłoszenie zamknięte – zamówienie „${title}” zakończone`
            : `Zgłoszenie zamknięte – zwrot pieniędzy za „${title}”`,
        body:
          (action === 'dla-sprzedawcy'
            ? 'Po sprawdzeniu zgłoszenia uznaliśmy zamówienie za zrealizowane. Sprzedawca otrzyma wypłatę. '
            : 'Po sprawdzeniu zgłoszenia zwracamy kupującemu całą kwotę, a zamówienie zostaje anulowane. ') +
          `Uzasadnienie: ${tresc}`,
      });
      invalidate();
      countCache = { at: 0, n: 0 };
      res.status(200).json({ data: { ok: true } });
    })
    .catch(e => handleError(res, e));
};

let countCache = { at: 0, n: 0 };
const countOpenDisputes = async () => {
  if (Date.now() - countCache.at < 60 * 1000) return countCache.n;
  const n = await query(OPEN)
    .then(list => list.length)
    .catch(() => 0);
  countCache = { at: Date.now(), n };
  return n;
};

module.exports = { getDisputes, disputeAction, countOpenDisputes };
