import { Router } from 'express';
import { asyncRoute } from '../util/async-route.js';
import rateLimit from 'express-rate-limit';
import site from '../../config/site.config.js';
import { get as setting } from '../settings.js';
import { requireAdmin } from '../util/auth-token.js';
import { insertRun, listRuns, clearRuns, exportAll } from '../db.js';
import { currentSession } from './auth.js';
import { ensureClientId, clientIp, hashIp, lookupGeo, num, str } from '../util/net.js';
import { issueRunToken, verifyRunToken } from '../util/run-token.js';

const router = Router();
const allowedTargets = new Set(site.pingTargets.map((t) => t.id));

router.get('/token', (req, res) => {
  const clientId = ensureClientId(req, res);
  res.set('Cache-Control', 'no-store');
  res.json({ token: issueRunToken(clientId) });
});

const writeLimit = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many submissions. Please try again shortly.' },
});

router.post('/', writeLimit, asyncRoute(async (req, res) => {
  if (!setting('features.saveResults')) {
    return res.status(503).json({ error: 'Saving results is disabled on this server.' });
  }

  const incoming = Array.isArray(req.body?.samples) ? req.body.samples : [];
  const samples = incoming
    .filter((s) => allowedTargets.has(s?.target))
    .slice(0, allowedTargets.size)
    .map((s) => ({
      target: s.target,
      latency: s.ok ? num(s.latency, 0, 60_000) : null,
      ok: Boolean(s.ok),
    }));

  if (!samples.length) {
    return res.status(400).json({ error: 'No valid samples supplied.' });
  }

  const clientId = ensureClientId(req, res);
  const session = currentSession(req);
  const duration = verifyRunToken(req.body?.token, clientId);
  const ip = clientIp(req);
  const geo = await lookupGeo(ip);

  const id = insertRun(
    {
      client_id: clientId,
      user_id: session?.user_id || null,
      created_at: Date.now(),
      isp: geo?.isp || null,
      asn: geo?.asn || null,
      country: geo?.country || null,
      city: geo?.city || null,
      ip_hash: hashIp(ip),
      platform: str(req.body?.platform, 60),
      browser: str(req.body?.browser, 60),
      duration_ms: duration,
    },
    samples
  );

  res.status(201).json({
    id,
    saved: true,
    isp: geo?.isp || null,
    signedIn: Boolean(session),
  });
}));

router.get('/mine', (req, res) => {
  const owner = ownerOf(req, res);
  const limit = Math.min(Number(req.query.limit) || 30, 100);
  res.set('Cache-Control', 'no-store');
  res.json({ items: listRuns(owner, limit), scope: owner.userId ? 'account' : 'browser' });
});

router.get('/mine.csv', (req, res) => {
  const rows = [];
  for (const run of listRuns(ownerOf(req, res), 100)) {
    for (const s of run.samples) {
      rows.push({
        time: new Date(run.created_at).toISOString(),
        target: s.target,
        latency_ms: s.ok ? s.latency : '',
        reachable: s.ok ? 'yes' : 'no',
        isp: run.isp || '',
        city: run.city || '',
        country: run.country || '',
      });
    }
  }
  res.set({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': 'attachment; filename="my-latency-history.csv"',
  });
  res.send('\uFEFF' + toCsv(rows, ['time', 'target', 'latency_ms', 'reachable', 'isp', 'city', 'country']));
});

router.delete('/mine', (req, res) => {
  res.json({ deleted: clearRuns(ownerOf(req, res)) });
});

function ownerOf(req, res) {
  const session = currentSession(req);
  if (session) return { userId: session.user_id, clientId: null };
  return { userId: null, clientId: ensureClientId(req, res) };
}

router.get('/export.csv', (req, res) => {
  if (!requireAdmin(req, res, site.server.adminToken)) return;
  const cols = ['run_id', 'created_at', 'isp', 'asn', 'country', 'city', 'platform', 'browser', 'target', 'latency', 'ok'];
  const rows = exportAll(20_000).map((r) => ({
    ...r,
    created_at: new Date(r.created_at).toISOString(),
  }));
  res.set({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': 'attachment; filename="all-latency-runs.csv"',
  });
  res.send('\uFEFF' + toCsv(rows, cols));
});

function toCsv(rows, cols) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
}

export default router;
