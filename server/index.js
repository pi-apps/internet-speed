import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import site, { safeOrigin, targetOrigins } from '../config/site.config.js';
import core from './routes/core.js';
import runs from './routes/runs.js';
import auth from './routes/auth.js';
import payments from './routes/payments.js';
import rewards from './routes/rewards.js';
import { recoverInterruptedPayouts } from './payout.js';
import admin from './routes/admin.js';
import ads from './routes/ads.js';
import news from './routes/news.js';
import pages from './routes/pages.js';
import { shell as notFoundPage } from './util/shell.js';
import stats from './routes/stats.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');

const BUILD = (() => {
  try {
    const html = fs.readFileSync(path.join(publicDir, 'index.html'));
    return crypto.createHash('sha256').update(html).digest('hex').slice(0, 8);
  } catch {
    return 'unknown';
  }
})();
const STARTED_AT = Date.now();

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', site.server.trustProxy);

const widgetOrigin = safeOrigin(site.widget.url);
const frameSrc = ["'self'", 'https://openspeedtest.com'];
if (widgetOrigin && !frameSrc.includes(widgetOrigin)) frameSrc.push(widgetOrigin);

const PI_ORIGINS = [
  'https://sdk.minepi.com',
  'https://api.minepi.com',
  'https://accounts.pinet.com',
  'https://socialchain.app',
  'https://*.minepi.com',
  'https://*.pinet.com',
  'https://*.socialchain.app',
];

const piSources = site.pi.enabled ? PI_ORIGINS : [];

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'default-src': ["'self'"],
        'script-src': [
          "'self'",
          ...(site.pi.enabled ? ['https://sdk.minepi.com'] : []),
          ...site.csp.scriptSrc,
        ],
        'style-src': ["'self'", "'unsafe-inline'"],
        'img-src': ["'self'", 'data:'],
        'font-src': ["'self'", 'data:'],

        'connect-src': ["'self'", ...targetOrigins(), ...piSources, ...site.csp.connectSrc],
        'frame-src': [...frameSrc, ...piSources],
        'child-src': [...frameSrc, ...piSources],

        'frame-ancestors': [
          "'self'",
          'https://*.minepi.com',
          'https://*.pinet.com',
          'https://*.socialchain.app',
        ],
        'upgrade-insecure-requests': null,
      },
    },

    frameguard: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  })
);

app.use(compression());

app.use((req, res, next) => {
  res.set('X-App-Build', BUILD);
  next();
});

app.use(express.json({ limit: '16kb' }));
app.use(cookieParser());

app.use(
  '/api',
  rateLimit({
    windowMs: 60_000,
    limit: 300,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
  })
);

app.get('/validation-key.txt', (req, res) => {
  if (!site.pi.validationKey) return res.status(404).type('text/plain').send('');
  res.type('text/plain').set('Cache-Control', 'no-cache').send(site.pi.validationKey);
});

app.get('/signin/callback', (req, res) => {
  noStore(res);
  res.sendFile(path.join(publicDir, 'signin', 'callback.html'));
});

app.use(news);
app.use(pages);

app.get('/admin', (req, res) => {
  noStore(res);
  res.sendFile(path.join(publicDir, 'admin', 'index.html'));
});

for (const doc of ['terms', 'privacy']) {
  app.get(`/legal/${doc}`, (req, res) => {
    noStore(res);
    res.sendFile(path.join(publicDir, 'legal', `${doc}.html`));
  });
}

app.use('/api', core);
app.use('/api/auth', auth);
app.use('/api/runs', runs);
app.use('/api/payments', payments);
app.use('/api/rewards', rewards);
app.use('/api/admin', admin);
app.use('/api/ads', ads);
app.use('/api/stats', stats);

const IMMUTABLE = 'public, max-age=31536000, immutable';
const REVALIDATED = 'public, max-age=600, s-maxage=3600, stale-while-revalidate=86400';
const NEVER = 'no-store, must-revalidate';

function noStore(res) {
  res.setHeader('Cache-Control', NEVER);
  res.setHeader('CDN-Cache-Control', 'no-store');
  res.setHeader('Cloudflare-CDN-Cache-Control', 'no-store');
}

app.use(
  express.static(publicDir, {
    etag: true,
    lastModified: true,
    setHeaders(res, filePath) {
      if (filePath.endsWith('.html')) return noStore(res);

      if (/[\\/](fonts|assets)[\\/]/.test(filePath)) {
        return res.setHeader('Cache-Control', IMMUTABLE);
      }
      if (/\.(css|js|mjs)$/.test(filePath)) {
        return res.setHeader('Cache-Control', REVALIDATED);
      }
      res.setHeader('Cache-Control', REVALIDATED);
    },
  })
);

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  noStore(res);
  res.status(404).send(
    notFoundPage({
      title: `Not found — ${site.brand.name}`,
      description: 'That page does not exist.',
      active: '',
      main: `<div class="section-head">
          <span class="eyebrow">404</span>
          <h1 style="font-size:var(--f-2xl)">That page is not here</h1>
          <p>The address may be mistyped, or the page may have moved.</p>
        </div>
        <div class="button-row">
          <a class="btn btn-primary" href="/">Back to the site</a>
          <a class="btn btn-ghost" href="/news">News</a>
          <a class="btn btn-ghost" href="/guide">Guide</a>
        </div>`,
    })
  );
});

app.use((req, res) => res.status(404).json({ error: 'Not found.' }));

app.use((err, req, res, _next) => {
  console.error('[error]', err.message);
  res.status(500).json({ error: 'Internal server error.' });
});

export { BUILD, STARTED_AT };

recoverInterruptedPayouts();

process.on('unhandledRejection', (reason) => {
  console.error('[unhandled rejection]', reason?.stack || reason);
});

process.on('uncaughtException', (err) => {
  console.error('[uncaught exception] the process will exit and be restarted:', err?.stack || err);
  process.exit(1);
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    console.log(`[shutdown] received ${signal}`);
    process.exit(0);
  });
}

app.listen(site.server.port, site.server.host, () => {
  console.log(`▲ ${site.brand.name} listening on http://${site.server.host}:${site.server.port}`);
  console.log(`  build: ${BUILD}`);
  console.log(`  widget: ${site.widget.url}`);
});
