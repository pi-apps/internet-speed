import { Router } from 'express';
import { get as setting } from '../settings.js';
import { overview, byTarget, byIsp, hourly, countUsers } from '../db.js';

const router = Router();

let cache = { at: 0, data: null };
const TTL = 60_000;

router.get('/', (req, res) => {
  if (!setting('features.publicStats')) {
    return res.status(503).json({ error: 'Public statistics are disabled on this server.' });
  }

  if (cache.data && Date.now() - cache.at < TTL) {
    res.set('Cache-Control', 'public, max-age=60');
    return res.json(cache.data);
  }

  const data = {
    overview: { ...overview(), pi_users: countUsers() },
    targets: byTarget(30),
    isps: byIsp(30, 3),
    hourly: hourly(7),
    generatedAt: Date.now(),
  };

  cache = { at: Date.now(), data };
  res.set('Cache-Control', 'public, max-age=60');
  res.json(data);
});

export default router;
