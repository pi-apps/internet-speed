import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { asyncRoute } from '../util/async-route.js';
import { get as setting } from '../settings.js';
import { verifyRewardedAd } from '../util/ads.js';
import { recordAdView, getAdView } from '../db.js';
import { currentSession } from './auth.js';

const router = Router();

const verifyLimit = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many ad verifications. Please wait a few minutes.' },
});

const PLACEMENTS = new Set(['signin', 'latency', 'manual']);

router.post('/verify', verifyLimit, asyncRoute(async (req, res) => {
  if (!setting('ads.enabled')) {
    return res.status(503).json({ error: 'Ads are not enabled on this server.' });
  }

  const adId = String(req.body?.adId || '');
  const placement = PLACEMENTS.has(req.body?.placement) ? req.body.placement : 'manual';
  const session = currentSession(req);

  const seen = getAdView(adId);
  if (seen) {
    return res.json({
      rewarded: Boolean(seen.granted),
      status: seen.status,
      replay: true,
      detail: 'This ad was already verified.',
    });
  }

  const result = await verifyRewardedAd(adId);

  recordAdView({
    adId,
    userId: session?.user_id || null,
    username: session?.username || null,
    placement,
    status: result.status || result.reason,
    granted: result.ok,
    detail: result.detail,
  });

  if (!result.ok) {
    console.warn(`[ads] not granted (${placement}): ${result.reason} - ${result.detail}`);
  }

  res.json({
    rewarded: result.ok,
    status: result.status || null,
    detail: result.detail,
  });
}));

export default router;
