import { $, api, esc } from './util.js';

export async function loadLatestNews(limit = 3) {
  const host = $('#news-latest');
  const section = $('#latest-news');
  if (!host) return;

  let data;
  try {
    data = await api(`/api/news?limit=${limit}`);
  } catch {
    section?.classList.add('hidden');
    return;
  }

  if (!data.items?.length) {
    section?.classList.add('hidden');
    return;
  }

  const when = (ts) => new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(new Date(ts));

  host.innerHTML = data.items
    .map(
      (post) => `<a class="news-row" href="/news/${esc(post.slug)}">
        <span class="news-row-date num">${when(post.date)}</span>
        <span class="news-row-body">
          <b>${esc(post.title)}</b>
          ${post.summary ? `<span class="muted">${esc(post.summary)}</span>` : ''}
        </span>
        ${post.pinned ? '<span class="news-pin">Pinned</span>' : ''}
      </a>`
    )
    .join('');
}
