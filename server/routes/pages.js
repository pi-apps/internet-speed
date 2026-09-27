import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const router = Router();
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'pages');

export const PAGES = ['stats', 'requirements', 'guide', 'about'];

router.get('/latency', (req, res) => res.redirect(302, '/#latency'));

for (const page of PAGES) {
  router.get(`/${page}`, (req, res, next) => {
    const file = path.join(dir, `${page}.html`);
    if (!fs.existsSync(file)) return next();
    res.set({
      'Cache-Control': 'no-store, must-revalidate',
      'CDN-Cache-Control': 'no-store',
    });
    res.sendFile(file);
  });
}

export default router;
