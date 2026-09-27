import { Router } from 'express';
import { asyncRoute } from '../util/async-route.js';
import rateLimit from 'express-rate-limit';
import site from '../../config/site.config.js';
import { requireAdminSession, isAdminUsername } from '../util/admin.js';
import { fields, update, reset, get as setting } from '../settings.js';
import {
  a2uConfigured, createA2UPayment, submitA2UPayment, completeA2UPayment,
  describeA2UError, a2uPreflight, settleIncompleteServerPayments,
} from '../util/a2u.js';
import { paymentsConfigured } from '../util/pi.js';
import {
  recordReward, rewardForDay, recentRewards, beginClaim, releaseClaim, overview, countUsers, donationTotals, settingsAudit, getUser, adTotals, adsByPlacement, createPost, updatePost, deletePost, postById, postBySlug, allPosts,
} from '../db.js';
import { today, lastCompletedDay } from '../util/period.js';
import { boardFor } from './rewards.js';
import { slugify, autoSummary } from '../util/markup.js';
import { startPayout, payoutInFlight } from '../payout.js';
import { currentSession } from './auth.js';

const router = Router();

const writeLimit = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

router.get('/session', (req, res) => {
  const session = currentSession(req);
  res.set('Cache-Control', 'no-store');
  res.json({
    signedIn: Boolean(session),
    username: session?.username || null,
    isAdmin: Boolean(session && isAdminUsername(session.username)),
    configured: site.server.adminUsernames.length > 0,
  });
});

router.get('/state', (req, res) => {
  if (!requireAdminSession(req, res)) return;

  const stats = overview();
  const donations = donationTotals();

  res.set('Cache-Control', 'no-store');
  res.json({
    settings: fields(),
    audit: settingsAudit(),
    server: {
      apiKey: paymentsConfigured(),
      wallet: a2uConfigured(),
      adminUsernames: site.server.adminUsernames,
      network: site.pi.networkPassphrase || 'chosen by the SDK',
      today: today(),
      lastCompletedDay: lastCompletedDay(),
    },
    ads: {
      enabled: site.ads.enabled,
      totals: adTotals(),
      byPlacement: adsByPlacement(30),
    },
    totals: {
      runs: stats?.runs || 0,
      runs24h: stats?.last_24h || 0,
      avgLatency: stats?.avg_latency || null,
      users: countUsers(),
      donations: donations?.count || 0,
      donated: donations?.total || 0,
    },
    rewards: recentRewards(30),
  });
});

router.put('/settings', writeLimit, (req, res) => {
  const session = requireAdminSession(req, res);
  if (!session) return;

  try {
    const applied = update(req.body?.settings || {}, session.username);
    console.log(`[admin] @${session.username} updated ${Object.keys(applied).join(', ') || 'nothing'}`);
    res.json({ saved: true, applied, settings: fields() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/settings/reset', writeLimit, (req, res) => {
  const session = requireAdminSession(req, res);
  if (!session) return;
  const key = String(req.body?.key || '');
  if (!reset(key, session.username)) return res.status(400).json({ error: 'Unknown setting.' });
  res.json({ reset: true, settings: fields() });
});

router.post('/rewards/release', writeLimit, (req, res) => {
  const session = requireAdminSession(req, res);
  if (!session) return;

  const day = String(req.body?.day || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return res.status(400).json({ error: 'Invalid day.' });

  const row = rewardForDay(day);
  if (!row) return res.status(404).json({ error: 'No payout recorded for that day.' });
  if (row.status === 'paid') return res.status(409).json({ error: 'That payout already completed.' });

  const changed = releaseClaim(day, `released by @${session.username}`);
  console.log(`[admin] @${session.username} released the stuck payout for ${day}`);
  res.json({
    released: changed > 0,
    paymentId: row.payment_id,
    txid: row.txid,
    note: row.payment_id
      ? 'A payment already exists on the Pi side. Retrying resumes it rather than creating a second one.'
      : 'No payment was created, so retrying starts from scratch.',
  });
});

router.post('/rewards/settle-pending', writeLimit, asyncRoute(async (req, res) => {
  const session = requireAdminSession(req, res);
  if (!session) return;

  if (!a2uConfigured()) {
    return res.status(503).json({ error: 'PI_API_KEY and PI_WALLET_PRIVATE_SEED must both be set.' });
  }

  try {
    const handled = await settleIncompleteServerPayments();
    console.log(`[admin] @${session.username} settled ${handled.length} pending Pi payment(s)`);
    res.json({
      found: handled.length,
      handled,
      note: handled.length
        ? 'Anything marked resolved is now closed on the Pi side, so a new payout can be created.'
        : 'Pi reports no open server payment, so nothing was blocking a new payout.',
    });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
}));

router.get('/payout-check', asyncRoute(async (req, res) => {
  if (!requireAdminSession(req, res)) return;
  res.set('Cache-Control', 'no-store');
  res.json(await a2uPreflight());
}));

router.get('/leaderboard', (req, res) => {
  if (!requireAdminSession(req, res)) return;

  const requested = typeof req.query.day === 'string' ? req.query.day : lastCompletedDay();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(requested)) return res.status(400).json({ error: 'Invalid day.' });

  const rows = boardFor(requested);

  res.set('Cache-Control', 'no-store');
  res.json({
    day: requested,
    today: today(),
    reward: rewardForDay(requested) || null,
    entries: rows.map((r, i) => ({
      rank: i + 1,
      userId: r.user_id,
      username: r.username,
      score: r.score,
      runs: r.qualifying_runs,
      canReceivePayments: (getUser(r.user_id)?.scopes || '').includes('wallet_address'),
    })),
  });
});

router.post('/rewards/pay', writeLimit, asyncRoute(async (req, res) => {
  const session = requireAdminSession(req, res);
  if (!session) return;

  if (!a2uConfigured()) {
    return res.status(503).json({
      error: 'PI_API_KEY and PI_WALLET_PRIVATE_SEED must both be set before a payout can be made.',
    });
  }

  const day = String(req.body?.day || lastCompletedDay());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return res.status(400).json({ error: 'Invalid day.' });
  if (day > today()) return res.status(400).json({ error: 'That day has not started yet.' });

  const rows = boardFor(day, 1);
  const winner = rows[0];
  if (!winner) return res.status(404).json({ error: 'No qualifying results for that day.' });

  const existing = rewardForDay(day);
  if (existing?.status === 'paid') return res.status(409).json({ error: 'Already paid.' });

  const amount = Number(req.body?.amount ?? setting('rewards.amount'));
  if (!(amount > 0 && amount <= 1000)) return res.status(400).json({ error: 'Invalid amount.' });

  const started = startPayout({
    day,
    winner,
    amount,
    memo: setting('rewards.memo'),
    by: session.username,
  });

  if (!started) {
    return res.status(409).json({
      error: 'A payout for that day is already running. Watch its status, or release it if it is stale.',
    });
  }

  console.log(`[admin] @${session.username} started a payout of ${amount} Pi for ${day}`);
  res.status(202).json({
    started: true,
    day,
    amount,
    username: winner.username,
    early: day === today(),
    note: 'The payment runs in the background. Poll the status endpoint for the result.',
  });
}));

router.get('/rewards/status', (req, res) => {
  if (!requireAdminSession(req, res)) return;

  const day = String(req.query.day || lastCompletedDay());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return res.status(400).json({ error: 'Invalid day.' });

  const row = rewardForDay(day);
  res.set('Cache-Control', 'no-store');
  res.json({
    day,
    running: payoutInFlight(day),
    status: row?.status || null,
    amount: row?.amount ?? null,
    username: row?.username || null,
    txid: row?.txid || null,
    paymentId: row?.payment_id || null,
    error: row?.error || null,
    paidAt: row?.paid_at || null,
  });
});

function readPost(body) {
  const title = String(body?.title || '').trim().slice(0, 160);
  if (!title) throw new Error('A title is required.');

  const text = String(body?.body || '').trim().slice(0, 40_000);
  if (!text) throw new Error('The body cannot be empty.');

  const requested = String(body?.slug || '').trim();
  return {
    title,
    body: text,
    slug: slugify(requested || title),
    summary: String(body?.summary || '').trim().slice(0, 300) || autoSummary(text),
    published: body?.published ? 1 : 0,
    pinned: body?.pinned ? 1 : 0,
  };
}

router.get('/news', (req, res) => {
  if (!requireAdminSession(req, res)) return;
  res.set('Cache-Control', 'no-store');
  res.json({ items: allPosts(200) });
});

router.post('/news', writeLimit, (req, res) => {
  const session = requireAdminSession(req, res);
  if (!session) return;

  try {
    const post = readPost(req.body);

    let slug = post.slug;
    for (let n = 2; postBySlug(slug); n += 1) slug = `${post.slug}-${n}`;

    const created = createPost({ ...post, slug, author: session.username });
    console.log(`[news] @${session.username} created "${created.title}"`);
    res.status(201).json({ post: created });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/news/:id', writeLimit, (req, res) => {
  const session = requireAdminSession(req, res);
  if (!session) return;

  const id = Number(req.params.id);
  const existing = postById(id);
  if (!existing) return res.status(404).json({ error: 'No such post.' });

  try {
    const post = readPost(req.body);

    let slug = post.slug;
    for (let n = 2; ; n += 1) {
      const clash = postBySlug(slug);
      if (!clash || clash.id === id) break;
      slug = `${post.slug}-${n}`;
    }

    const updated = updatePost({ ...post, slug, id });
    console.log(`[news] @${session.username} updated "${updated.title}"`);
    res.json({ post: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/news/:id', writeLimit, (req, res) => {
  const session = requireAdminSession(req, res);
  if (!session) return;

  const removed = deletePost(Number(req.params.id));
  if (!removed) return res.status(404).json({ error: 'No such post.' });
  console.log(`[news] @${session.username} deleted post ${req.params.id}`);
  res.json({ deleted: true });
});

export default router;
