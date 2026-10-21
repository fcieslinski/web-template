/**
 * Refume: shipment endpoints (labels and tracking through Furgonetka.pl).
 *
 * GET  /api/przesylka?txId=…            status for a participant of the order
 * GET  /api/przesylka/etykieta?txId=…   label PDF (seller only)
 * POST /api/przesylka/ponow  { txId }   try again, e.g. after the seller filled in sender details
 * POST /api/przesylka/symuluj { txId, state }   sandbox only: simulate a tracking state
 * POST /api/furgonetka/webhook          Furgonetka's tracking notifications
 *
 * Participants are checked with the user's own SDK (the Marketplace API only shows an order to
 * its customer and provider).
 */
const { getSdk, handleError } = require('../api-util/sdk');
const furgonetka = require('../api-util/furgonetka');
const shipments = require('../api-util/refumeShipments');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SIMULATION_STATES = ['collected', 'transit', 'delivery', 'delivered', 'delivery-problem', 'returned'];

const httpError = (status, message) =>
  Object.assign(new Error(message), { status, statusText: message, data: {} });

const moderatorIds = () =>
  (process.env.REFUME_MODERATOR_USER_IDS || '')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean);

/** The current user's role in the order, or a 403/404. */
const participant = async (req, res, txId) => {
  if (!UUID_RE.test(txId || '')) throw httpError(400, 'Invalid txId.');
  const sdk = getSdk(req, res);
  const me = (await sdk.currentUser.show()).data.data;
  const userId = me.id.uuid;
  if (moderatorIds().includes(userId)) {
    return { userId, role: 'moderator' };
  }
  const tx = await sdk.transactions
    .show({ id: txId, include: ['provider', 'customer'] })
    .catch(() => null);
  if (!tx) throw httpError(404, 'Order not found.');
  const providerId = tx.data.data.relationships?.provider?.data?.id?.uuid;
  const customerId = tx.data.data.relationships?.customer?.data?.id?.uuid;
  const role = userId === providerId ? 'provider' : userId === customerId ? 'customer' : null;
  if (!role) throw httpError(403, 'Not a participant.');
  return { userId, role };
};

const requireEnabled = () => {
  if (!shipments.isShipmentsEnabled()) throw httpError(503, 'Shipments are not configured.');
};

const getShipment = (req, res) => {
  const txId = String(req.query?.txId || '');
  Promise.resolve()
    .then(async () => {
      const { role } = await participant(req, res, txId);
      if (!shipments.isShipmentsEnabled()) {
        return res.status(200).json({ data: { enabled: false } });
      }
      const row = await shipments.getRow(txId);
      const seesErrors = role === 'provider' || role === 'moderator';
      res.status(200).json({
        data: {
          enabled: true,
          sandbox: furgonetka.env() === 'sandbox',
          role,
          status: row?.status || null,
          carrier: row?.carrier || null,
          waybill: row?.waybill || null,
          trackingUrl: row?.tracking_url || null,
          events: row?.events || [],
          labelReady: !!row?.waybill && role !== 'customer',
          error: seesErrors ? row?.error || null : null,
          canRetry: seesErrors && ['blad', 'brak-danych-nadawcy'].includes(row?.status),
          point: row?.point_code ? { code: row.point_code, name: row.point_name || '' } : null,
        },
      });
    })
    .catch(e => handleError(res, e));
};

const getLabel = (req, res) => {
  const txId = String(req.query?.txId || '');
  Promise.resolve()
    .then(async () => {
      requireEnabled();
      const { role } = await participant(req, res, txId);
      if (role === 'customer') throw httpError(403, 'Only the seller can download the label.');
      const row = await shipments.getRow(txId);
      if (!row?.package_id || !row.waybill) throw httpError(404, 'No label yet.');
      const label = await furgonetka.getLabel(row.package_id);
      if (!label) throw httpError(409, 'The label is not ready yet. Try again in a moment.');
      res
        .status(200)
        .set('Content-Type', label.contentType)
        .set('Content-Disposition', `inline; filename="etykieta-${row.waybill}.pdf"`)
        .set('Cache-Control', 'private, no-store')
        .send(label.buffer);
    })
    .catch(e => {
      // A plain message is easier to read when the PDF was opened in a new tab
      if (!res.headersSent) {
        res
          .status(e.status || 500)
          .type('text/plain; charset=utf-8')
          .send(
            e.status === 409
              ? 'Etykieta jeszcze się przygotowuje. Spróbuj za chwilę.'
              : e.status === 403
              ? 'Etykietę może pobrać tylko sprzedawca.'
              : 'Nie udało się pobrać etykiety.'
          );
      }
    });
};

const retry = (req, res) => {
  const txId = String(req.body?.txId || '');
  Promise.resolve()
    .then(async () => {
      requireEnabled();
      const { role } = await participant(req, res, txId);
      if (role === 'customer') throw httpError(403, 'Only the seller can do this.');
      const row = await shipments.processOrder(txId);
      res.status(200).json({ data: { status: row?.status || null, error: row?.error || null } });
    })
    .catch(e => handleError(res, e));
};

const changePoint = (req, res) => {
  const txId = String(req.body?.txId || '');
  const code = String(req.body?.code || '').trim();
  const name = String(req.body?.name || '');
  Promise.resolve()
    .then(async () => {
      requireEnabled();
      if (!/^[A-Za-z0-9-]{3,40}$/.test(code)) throw httpError(400, 'Invalid point code.');
      const { role } = await participant(req, res, txId);
      if (role === 'provider') throw httpError(403, 'Only the buyer chooses the pickup point.');
      const row = await shipments.changePoint(txId, code, name);
      res.status(200).json({ data: { status: row?.status || null } });
    })
    .catch(e => handleError(res, e));
};

const simulate = (req, res) => {
  const txId = String(req.body?.txId || '');
  const state = String(req.body?.state || '');
  Promise.resolve()
    .then(async () => {
      requireEnabled();
      if (furgonetka.env() !== 'sandbox') throw httpError(400, 'Only on the sandbox.');
      if (!SIMULATION_STATES.includes(state)) throw httpError(400, 'Unknown state.');
      await participant(req, res, txId);
      const row = await shipments.getRow(txId);
      if (!row?.package_id || !row.waybill) throw httpError(409, 'No ordered shipment.');
      await furgonetka.simulateTracking(row.package_id, row.waybill, state);
      const updated = await shipments.refreshTracking(row);
      res.status(200).json({ data: { status: updated?.status || null } });
    })
    .catch(e => handleError(res, e));
};

const webhook = (req, res) => {
  const ok = () => res.status(200).json({ status: 'OK' });
  const n = req.body || {};
  const secret = process.env.FURGONETKA_WEBHOOK_TOKEN;
  // Always answer OK (Furgonetka's address check needs it); act only on verified notifications
  // of our own shipments
  if (!n.package_id || !furgonetka.verifyWebhook(n, secret)) {
    if (n.package_id) console.warn('[refume-przesylki] webhook with a wrong checksum ignored');
    return ok();
  }
  shipments
    .handleWebhook(n)
    .catch(e => console.error('[refume-przesylki] webhook:', e.message))
    .finally(ok);
};

module.exports = { getShipment, getLabel, retry, changePoint, simulate, webhook };
