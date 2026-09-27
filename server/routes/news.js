import { Router } from 'express';
import site from '../../config/site.config.js';
import { publishedPosts, publishedPostCount, postBySlug } from '../db.js';
import { renderPostBody, esc } from '../util/markup.js';
import { shell } from '../util/shell.js';

const router = Router();

const dateText = (ts) =>
  new Intl.DateTimeFormat('en-GB', { dateStyle: 'long' }).format(new Date(ts));

router.get('/api/news', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 10, 50);
  const offset = Math.max(Number(req.query.offset) || 0, 0);

  res.set('Cache-Control', 'public, max-age=60');
  res.json({
    total: publishedPostCount(),
    items: publishedPosts(limit, offset).map((p) => ({
      slug: p.slug,
      title: p.title,
      summary: p.summary,
      pinned: Boolean(p.pinned),
      date: p.created_at,
    })),
  });
});

router.get('/news', (req, res) => {
  const posts = publishedPosts(50, 0);

  const body = posts.length
    ? `<div class="news-list">${posts
        .map(
          (p) => `<article class="news-card">
            ${p.pinned ? '<span class="news-pin">Pinned</span>' : ''}
            <h2><a href="/news/${esc(p.slug)}">${esc(p.title)}</a></h2>
            <p class="news-date">${dateText(p.created_at)}</p>
            ${p.summary ? `<p>${esc(p.summary)}</p>` : ''}
            <a class="btn btn-ghost btn-sm" href="/news/${esc(p.slug)}">Read</a>
          </article>`
        )
        .join('')}</div>`
    : '<div class="chart-empty">Nothing published yet.</div>';

  res.send(
    shell({
      title: `News — ${site.brand.name}`,
      description: `Updates and announcements from ${site.brand.name}.`,
      active: 'news',
      main: `<div class="section-head">
          <span class="eyebrow">Updates</span>
          <h1 style="font-size:var(--f-2xl)">News</h1>
          <p>Announcements, changes and notes about how the site measures things.</p>
        </div>
        ${body}`,
    })
  );
});

router.get('/news/:slug', (req, res) => {
  const post = postBySlug(String(req.params.slug || ''));

  if (!post || !post.published) {
    return res.status(404).send(
      shell({
        title: `Not found — ${site.brand.name}`,
        description: 'That update does not exist.',
        active: 'news',
        main: `<div class="section-head">
            <span class="eyebrow">404</span>
            <h1 style="font-size:var(--f-2xl)">That update is not here</h1>
            <p>It may have been removed, or it may not be published yet.</p>
          </div>
          <div class="button-row"><a class="btn btn-primary" href="/news">All updates</a>
          <a class="btn btn-ghost" href="/">Back to the site</a></div>`,
      })
    );
  }

  res.send(
    shell({
      title: `${post.title} — ${site.brand.name}`,
      description: post.summary || `An update from ${site.brand.name}.`,
      active: 'news',
      main: `<article class="legal-doc news-article">
          <span class="eyebrow">Update</span>
          <h1 style="font-size:var(--f-2xl)">${esc(post.title)}</h1>
          <p class="news-date">${dateText(post.created_at)}${
            post.updated_at > post.created_at + 60_000
              ? ` · updated ${dateText(post.updated_at)}`
              : ''
          }</p>
          ${renderPostBody(post.body)}
          <p style="margin-top:var(--s6)"><a href="/news">All updates</a></p>
        </article>`,
    })
  );
});

export default router;
