import { Router } from 'express';
import { asyncRoute } from '../util/async-route.js';
import rateLimit from 'express-rate-limit';
import site from '../../config/site.config.js';
import { get as setting } from '../settings.js';
import { requireAdmin } from '../util/auth-token.js';
import { getPayment, approvePayment, completePayment, paymentsConfigured } from '../util/pi.js';
import { recordDonation, recentDonations, donationTotals, allDonations } from '../db.js';
import { currentSession } from './auth.js';

const router = Router();

const payLimit = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 40,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many payment requests. Please wait a few minutes.' },
});

function requireSession(req, res) {
  const session = currentSession(req);
  if (!session) {
    res.status(401).json({ error: 'Sign in with Pi before donating.' });
    return null;
  }
  return session;
}

function requireEnabled(res) {
  if (!setting('donations.enabled') || !paymentsConfigured()) {
    res.status(503).json({
      error: 'Donations are not enabled on this server (PI_API_KEY is missing).',
    });
    return false;
  }
  return true;
}

router.post('/approve', payLimit, asyncRoute(async (req, res) => {
  if (!requireEnabled(res)) return;
  const session = requireSession(req, res);
  if (!session) return;

  const paymentId = String(req.body?.paymentId || '').slice(0, 128);
  if (!paymentId) return res.status(400).json({ error: 'paymentId is required.' });

  try {
    const payment = await getPayment(paymentId);

    if (payment.user_uid !== session.user_id) {
      console.warn(`[pay] refusing ${paymentId}: belongs to another user`);
      return res.status(403).json({ error: 'This payment does not belong to you.' });
    }

    const amount = Number(payment.amount);
    if (!(amount >= setting('donations.min') && amount <= setting('donations.max'))) {
      return res.status(400).json({
        error: `Amount must be between ${setting('donations.min')} and ${setting('donations.max')} Pi.`,
      });
    }

    recordDonation({
      paymentId,
      userId: session.user_id,
      username: session.username,
      amount,
      memo: payment.memo || null,
      status: 'pending',
      network: payment.network || null,
    });

    await approvePayment(paymentId);
    recordDonation({ paymentId, status: 'approved' });

    console.log(`[pay] approved ${paymentId} — ${amount} Pi from @${session.username}`);
    res.json({ approved: true });
  } catch (err) {
    console.error(`[pay] approve failed for ${paymentId}: ${err.message}`);
    recordDonation({ paymentId, status: 'error', note: err.message.slice(0, 240) });
    res.status(502).json({ error: 'Pi could not approve the payment.', detail: err.message });
  }
}));

router.post('/complete', payLimit, asyncRoute(async (req, res) => {
  if (!requireEnabled(res)) return;

  const paymentId = String(req.body?.paymentId || '').slice(0, 128);
  const txid = String(req.body?.txid || '').slice(0, 128);
  if (!paymentId || !txid) {
    return res.status(400).json({ error: 'paymentId and txid are required.' });
  }

  try {
    const dto = await completePayment(paymentId, txid);
    const row = recordDonation({
      paymentId,
      txid,
      amount: dto?.amount ?? null,
      memo: dto?.memo ?? null,
      status: 'completed',
      network: dto?.network ?? null,
    });

    console.log(`[pay] completed ${paymentId} — txid ${txid}`);
    res.json({ completed: true, amount: row?.amount ?? null });
  } catch (err) {
    console.error(`[pay] complete failed for ${paymentId}: ${err.message}`);
    recordDonation({ paymentId, txid, status: 'error', note: err.message.slice(0, 240) });
    res.status(502).json({ error: 'Pi could not complete the payment.', detail: err.message });
  }
}));

router.post('/incomplete', payLimit, asyncRoute(async (req, res) => {
  if (!requireEnabled(res)) return;

  const payment = req.body?.payment;
  const paymentId = String(payment?.identifier || '').slice(0, 128);
  const txid = String(payment?.transaction?.txid || '').slice(0, 128);

  if (!paymentId || !txid) {
    return res.status(400).json({ error: 'An incomplete payment needs an identifier and a txid.' });
  }

  try {
    await completePayment(paymentId, txid);
    recordDonation({ paymentId, txid, status: 'completed', note: 'settled from incomplete callback' });
    console.log(`[pay] settled stale payment ${paymentId}`);
    res.json({ completed: true });
  } catch (err) {
    console.error(`[pay] settling ${paymentId} failed: ${err.message}`);
    res.status(502).json({ error: err.message });
  }
}));

router.post('/cancel', payLimit, (req, res) => {
  const paymentId = String(req.body?.paymentId || '').slice(0, 128);
  if (paymentId) recordDonation({ paymentId, status: 'cancelled' });
  res.json({ ok: true });
});

router.get('/recent', (req, res) => {
  if (!setting('donations.enabled')) return res.json({ items: [], total: 0, count: 0 });
  const totals = donationTotals();
  res.set('Cache-Control', 'public, max-age=60');
  res.json({
    items: recentDonations(12),
    total: totals?.total || 0,
    count: totals?.count || 0,
  });
});

router.get('/export.csv', (req, res) => {
  if (!requireAdmin(req, res, site.server.adminToken)) return;

  const cols = ['payment_id', 'created_at', 'status', 'username', 'amount', 'memo', 'txid', 'network', 'note'];
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = allDonations(20_000).map((r) =>
    cols.map((c) => esc(c === 'created_at' ? new Date(r[c]).toISOString() : r[c])).join(',')
  );

  res.set({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': 'attachment; filename="donations.csv"',
  });
  res.send('\uFEFF' + [cols.join(','), ...rows].join('\n'));
});

export default router;
