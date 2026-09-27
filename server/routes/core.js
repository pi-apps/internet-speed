import { Router } from 'express';
import { asyncRoute } from '../util/async-route.js';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { publicConfig } from '../../config/site.config.js';
import { get as setting } from '../settings.js';
import { clientIp, lookupGeo, isPrivate } from '../util/net.js';

const router = Router();
const started = Date.now();

const build = (() => {
  try {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const html = fs.readFileSync(path.join(dir, '..', '..', 'public', 'index.html'));
    return crypto.createHash('sha256').update(html).digest('hex').slice(0, 8);
  } catch {
    return 'unknown';
  }
})();

router.get('/config', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const base = publicConfig();
  res.json({
    ...base,
    build,
    features: {
      ...base.features,
      saveResults: Boolean(setting('features.saveResults')),
      publicStats: Boolean(setting('features.publicStats')),
    },
    ads: {
      ...base.ads,
      enabled: Boolean(setting('ads.enabled')),
      beforeSignIn: Boolean(setting('ads.beforeSignIn')),
      beforeLatency: Boolean(setting('ads.beforeLatency')),
      cooldownSeconds: setting('ads.cooldownSeconds'),
      blockOnFailure: Boolean(setting('ads.blockOnFailure')),
    },
    rewards: {
      ...base.rewards,
      enabled: Boolean(setting('rewards.enabled')),
      amount: setting('rewards.amount'),
      minReachable: setting('rewards.minReachable'),
      leaderboardSize: setting('rewards.leaderboardSize'),
    },
    donations: {
      ...base.donations,
      enabled: Boolean(setting('donations.enabled')),
      min: setting('donations.min'),
      max: setting('donations.max'),
      memoMaxLength: setting('donations.memoMaxLength'),
      mainnetUrl: setting('donations.mainnetUrl'),
      mainnetLabel: setting('donations.mainnetLabel'),
    },
  });
});

router.get('/ipinfo', asyncRoute(async (req, res) => {
  const ip = clientIp(req);
  const geo = await lookupGeo(ip);
  res.set('Cache-Control', 'private, max-age=60');
  res.json({
    ip,
    private: isPrivate(ip),
    isp: geo?.isp || null,
    asn: geo?.asn || null,
    country: geo?.country || null,
    city: geo?.city || null,
    protocol: req.protocol,
    httpVersion: req.httpVersion,
    serverTime: Date.now(),
  });
}));

router.get('/health', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({
    ok: true,
    build,
    startedAt: new Date(started).toISOString(),
    uptime: Math.round((Date.now() - started) / 1000),
  });
});

export default router;
