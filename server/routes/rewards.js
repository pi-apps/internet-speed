import { Router } from 'express';
import { asyncRoute } from '../util/async-route.js';
import rateLimit from 'express-rate-limit';
import site from '../../config/site.config.js';
import { get as setting } from '../settings.js';
import { requireAdmin } from '../util/auth-token.js';
import {
  a2uConfigured, createA2UPayment, submitA2UPayment, completeA2UPayment,
  describeA2UError, settleIncompleteServerPayments,
} from '../util/a2u.js';
import { leaderboard, recordReward, rewardForDay, recentRewards, beginClaim, getUser } from '../db.js';
import { dayKey, dayRange, today, lastCompletedDay, isClaimable } from '../util/period.js';
import { currentSession } from './auth.js';
import { startPayout } from '../payout.js';

const router = Router();

function rewardsLive() {
  return Boolean(setting('rewards.enabled')) && a2uConfigured();
}

const claimLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many claim attempts. Please try again later.' },
});

export function boardFor(day, limit = setting('rewards.leaderboardSize')) {
  const { from, to } = dayRange(day);
  const reward = rewardForDay(day);
  const cutoff = reward?.paid_at ? Math.min(to, reward.paid_at) : to;

  return leaderboard({
    from,
    to: cutoff,
    minReachable: setting('rewards.minReachable'),
    limit,
  });
}

function publicRow(row, index) {
  return {
    rank: index + 1,
    username: row.username,
    score: row.score,
    runs: row.qualifying_runs,
  };
}

router.get('/leaderboard', (req, res) => {
  const requested = typeof req.query.day === 'string' ? req.query.day : today();
  const day = /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : today();

  const rows = boardFor(day);
  const session = currentSession(req);
  const winner = rows[0] || null;
  const reward = rewardForDay(day);

  const isWinner = Boolean(session && winner && rows[0] && session.user_id === rows[0].user_id);
  const settled = day < today();

  res.set('Cache-Control', 'no-store');
  res.json({
    day,
    today: today(),
    lastCompletedDay: lastCompletedDay(),
    settled,
    frozenAt: rewardForDay(day)?.paid_at || null,
    entries: rows.map(publicRow),
    you: session
      ? {
          username: session.username,
          rank: rows.findIndex((r) => r.user_id === session.user_id) + 1 || null,
          isWinner,
          canReceivePayments: (getUser(session.user_id)?.scopes || '').includes('wallet_address'),
        }
      : null,
    reward: {
      enabled: rewardsLive(),
      amount: setting('rewards.amount'),
      status: reward?.status || null,
      txid: reward?.txid || null,
      claimedBy: reward?.username || null,
      mode: setting('rewards.mode'),
      claimable:
        rewardsLive() &&
        setting('rewards.mode') === 'winner-claims' &&
        isWinner &&
        isClaimable(day) &&
        !reward,
      claimableFrom: settled ? null : lastCompletedDay(),
    },
  });
});

router.post('/claim', claimLimit, asyncRoute(async (req, res) => {
  if (!rewardsLive()) {
    return res.status(503).json({ error: 'Rewards are not enabled on this server.' });
  }
  if (setting('rewards.mode') !== 'winner-claims') {
    return res.status(403).json({ error: 'Rewards on this site are released by an administrator.' });
  }

  const session = currentSession(req);
  if (!session) return res.status(401).json({ error: 'Sign in with Pi to claim a reward.' });

  const requested = typeof req.body?.day === 'string' ? req.body.day : lastCompletedDay();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(requested)) {
    return res.status(400).json({ error: 'Invalid day.' });
  }
  if (!isClaimable(requested)) {
    return res.status(400).json({
      error: `That day is not claimable. A day can be claimed once it has finished, for ${setting('rewards.claimWindowDays')} days.`,
    });
  }

  const rows = boardFor(requested);
  const winner = rows[0];
  if (!winner) return res.status(404).json({ error: 'No qualifying results for that day.' });
  if (winner.user_id !== session.user_id) {
    return res.status(403).json({ error: 'You are not the winner for that day.' });
  }

  const existing = rewardForDay(requested);
  if (existing && existing.status === 'paid') {
    return res.status(409).json({ error: 'That reward has already been paid.' });
  }
  if (existing && existing.status === 'processing') {
    return res.status(409).json({ error: 'That reward is already being processed.' });
  }

  recordReward({
    day: requested,
    userId: winner.user_id,
    username: winner.username,
    score: winner.score,
    amount: setting('rewards.amount'),
    memo: setting('rewards.memo'),
    status: existing ? existing.status : 'pending',
  });

  if (!beginClaim(requested, winner.user_id)) {
    return res.status(409).json({ error: 'That reward is already being processed.' });
  }

  const started = startPayout({
    day: requested,
    winner,
    amount: setting('rewards.amount'),
    memo: setting('rewards.memo'),
    by: session.username,
  });

  if (!started) {
    return res.status(409).json({ error: 'That reward is already being processed.' });
  }

  res.status(202).json({
    started: true,
    day: requested,
    amount: setting('rewards.amount'),
    note: 'The payment is being sent. This page will show the result shortly.',
  });
}));

router.get('/status', (req, res) => {
  const day = typeof req.query.day === 'string' ? req.query.day : lastCompletedDay();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return res.status(400).json({ error: 'Invalid day.' });

  const row = rewardForDay(day);
  res.set('Cache-Control', 'no-store');
  res.json({ day, status: row?.status || null, txid: row?.txid || null, error: row?.error || null });
});

router.get('/history', (req, res) => {
  if (!requireAdmin(req, res, site.server.adminToken)) return;
  res.json({ items: recentRewards(60) });
});

export default router;
