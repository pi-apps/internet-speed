import { $, $$, api, fmt, fmtDate, toast, esc } from './util.js';
import { initTheme } from './theme.js';
import { pi, initPi, signIn, messageFor } from './pi.js';

let state = null;
let dirty = {};

init();

async function init() {
  initTheme();
  initDrawer();

  const cfg = await api('/api/config').catch(() => null);
  if (cfg) {
    await initPi(cfg);
    $$('[data-brand-name]').forEach((el) => (el.textContent = cfg.brand?.name || 'Internet Speed'));
  }

  $('#gate-signin')?.addEventListener('click', doSignIn);
  $('#pi-auth')?.addEventListener('click', doSignIn);
  $('#settings-save')?.addEventListener('click', saveSettings);
  $('#admin-load-day')?.addEventListener('click', loadDay);
  $('#admin-pay')?.addEventListener('click', payWinner);
  $('#payout-check')?.addEventListener('click', checkPayout);
  $('#settle-pending')?.addEventListener('click', settlePending);
  $('#post-save')?.addEventListener('click', savePost);
  $('#post-cancel')?.addEventListener('click', resetPostForm);

  await refresh();
}

function initDrawer() {
  const nav = $('#nav');
  const burger = $('#burger');
  if (!nav || !burger) return;
  const setDrawer = (open) => {
    nav.dataset.open = String(open);
    burger.setAttribute('aria-expanded', String(open));
    document.body.style.overflow = open ? 'hidden' : '';
    if (open) nav.scrollTop = 0;
  };
  burger.addEventListener('click', () => setDrawer(nav.dataset.open !== 'true'));
  nav.addEventListener('click', (e) => {
    if (e.target.closest('.theme-option')) return;
    if (e.target.closest('a')) setDrawer(false);
  });
  addEventListener('scroll', () => {
    $('#header').dataset.scrolled = String(scrollY > 8);
  }, { passive: true });
}

async function doSignIn() {
  try {
    const result = await signIn('/admin');
    if (result?.redirecting) return;
    await refresh();
  } catch (err) {
    toast(err.message || messageFor(pi.reason), 'bad', 9000);
  }
}

async function refresh() {
  const session = await api('/api/admin/session').catch(() => null);
  const intro = $('#admin-intro');
  const gate = $('#gate');
  const dash = $('#dash');

  $('#pi-auth-label').textContent = session?.username ? '@' + session.username : 'Sign in';

  if (!session?.configured) {
    intro.textContent = 'No administrator is configured yet.';
    $('#gate-title').textContent = 'ADMIN_USERNAMES is empty';
    $('#gate-note').textContent =
      'Set ADMIN_USERNAMES to your Pi username in the environment file and restart the service. Until then nobody can open this dashboard.';
    $('#gate-signin').classList.add('hidden');
    return;
  }

  if (!session.signedIn) {
    intro.textContent = 'Sign in to continue.';
    gate.classList.remove('hidden');
    dash.classList.add('hidden');
    return;
  }

  if (!session.isAdmin) {
    intro.textContent = `Signed in as @${session.username}.`;
    $('#gate-title').textContent = 'Not an administrator';
    $('#gate-note').textContent =
      `@${session.username} is not listed in ADMIN_USERNAMES, so this dashboard stays closed.`;
    $('#gate-signin').classList.add('hidden');
    gate.classList.remove('hidden');
    dash.classList.add('hidden');
    return;
  }

  gate.classList.add('hidden');
  dash.classList.remove('hidden');
  intro.textContent = `Signed in as @${session.username}.`;

  state = await api('/api/admin/state');
  dirty = {};
  renderTotals();
  renderServer();
  renderSettings();
  renderRewards();
  renderAudit();
  loadPosts();

  const dayInput = $('#admin-day');
  if (dayInput && !dayInput.value) dayInput.value = state.server.lastCompletedDay;
}

function renderTotals() {
  const t = state.totals;
  const a = state.ads?.totals || {};
  $('#admin-totals').innerHTML = [
    ...(state.ads?.enabled
      ? [
          ['Ad views', (a.total || 0).toLocaleString('en-US')],
          ['Ads granted', (a.granted || 0).toLocaleString('en-US')],
        ]
      : []),
    ['Latency runs', t.runs.toLocaleString('en-US')],
    ['Runs, last 24h', t.runs24h.toLocaleString('en-US')],
    ['Average latency', t.avgLatency ? fmt(t.avgLatency) + ' ms' : '—'],
    ['Pi accounts', t.users.toLocaleString('en-US')],
    ['Donations', t.donations.toLocaleString('en-US')],
    ['Donated total', fmt(t.donated) + ' π'],
  ]
    .map(
      ([label, value]) => `<div class="stat">
        <div class="stat-value num">${esc(value)}</div>
        <div class="stat-label">${label}</div>
      </div>`
    )
    .join('');
}

function renderServer() {
  const s = state.server;
  const row = (label, ok, text) => `<div class="capability" data-ok="${ok}">
      <span class="cap-name">${label}</span>
      <span class="cap-need">${esc(text)}</span>
      <span class="verdict">${ok ? 'ready' : 'missing'}</span>
    </div>`;

  $('#admin-server').innerHTML = [
    row('Server API key', s.apiKey, s.apiKey ? 'PI_API_KEY is set' : 'PI_API_KEY is empty — donations and payouts are off'),
    row('App wallet seed', s.wallet, s.wallet ? 'PI_WALLET_PRIVATE_SEED is set' : 'PI_WALLET_PRIVATE_SEED is empty — payouts are off'),
    row('Administrators', s.adminUsernames.length > 0, s.adminUsernames.map((u) => '@' + u).join(', ') || 'none'),
    row('Network', true, s.network),
    row('Leaderboard day', true, `today ${s.today}, last completed ${s.lastCompletedDay}`),
  ].join('');
}

function renderSettings() {
  const groups = new Map();
  for (const field of state.settings) {
    if (!groups.has(field.group)) groups.set(field.group, []);
    groups.get(field.group).push(field);
  }

  $('#settings-form').innerHTML = [...groups]
    .map(
      ([group, list]) => `<section class="card" style="margin-bottom:var(--s4)">
        <h3>${esc(group)}</h3>
        ${list.map(fieldMarkup).join('')}
      </section>`
    )
    .join('');

  $$('#settings-form [data-key]').forEach((input) => {
    input.addEventListener('change', () => {
      dirty[input.dataset.key] = input.type === 'checkbox' ? input.checked : input.value;
      $('#settings-status').textContent = 'Unsaved changes';
    });
  });
}

function fieldMarkup(f) {
  const id = 'set-' + f.key.replace(/\./g, '-');
  const badge = f.isDefault ? '<span class="muted" style="font-size:var(--f-xs)">default</span>' : '';
  const help = f.help ? `<span class="muted" style="font-size:var(--f-xs)">${esc(f.help)}</span>` : '';

  if (f.type === 'bool') {
    return `<div class="capability" style="margin-top:var(--s2)">
      <span class="cap-name"><label for="${id}">${esc(f.label)}</label></span>
      <span class="cap-need">${help} ${badge}</span>
      <span class="verdict">
        <input type="checkbox" id="${id}" data-key="${f.key}" ${f.value ? 'checked' : ''}
               style="width:22px;height:22px;accent-color:var(--dl)">
      </span>
    </div>`;
  }

  if (f.type === 'enum') {
    return `<label class="field" style="margin-top:var(--s3)">
      <span>${esc(f.label)} ${badge}</span>
      <select id="${id}" data-key="${f.key}">
        ${f.options.map((o) => `<option value="${o}" ${o === f.value ? 'selected' : ''}>${o}</option>`).join('')}
      </select>
      ${help}
    </label>`;
  }

  const attrs = f.type === 'number'
    ? `type="number" min="${f.min ?? ''}" max="${f.max ?? ''}" step="${f.step ?? 'any'}"`
    : `type="text" maxlength="${f.max ?? 200}"`;

  return `<label class="field" style="margin-top:var(--s3)">
    <span>${esc(f.label)} ${badge}</span>
    <input id="${id}" data-key="${f.key}" ${attrs} value="${esc(f.value ?? '')}">
    ${help}
  </label>`;
}

async function saveSettings() {
  if (!Object.keys(dirty).length) return toast('Nothing to save.');
  const btn = $('#settings-save');
  btn.disabled = true;
  try {
    const data = await api('/api/admin/settings', { method: 'PUT', body: { settings: dirty } });
    state.settings = data.settings;
    dirty = {};
    renderSettings();
    $('#settings-status').textContent = 'Saved';
    toast('Settings saved and applied.');
  } catch (err) {
    toast(err.message, 'bad', 8000);
  } finally {
    btn.disabled = false;
  }
}

async function checkPayout() {
  const out = $('#payout-check-result');
  const btn = $('#payout-check');
  btn.disabled = true;
  out.textContent = 'Checking…';
  out.dataset.tone = '';

  try {
    const r = await api('/api/admin/payout-check');
    out.dataset.tone = r.ok ? 'ok' : 'bad';
    const rt = r.runtime || {};
    out.textContent = [
      r.ok ? 'Ready.' : 'Not ready.',
      r.detail,
      r.walletAddress ? `Wallet ${r.walletAddress.slice(0, 8)}…${r.walletAddress.slice(-6)}.` : null,
      r.incomplete ? `${r.incomplete} incomplete payment(s) on the Pi side.` : null,
      `Runtime: Node ${rt.node || '?'} on ${rt.platform || '?'}, ${rt.libc || '?'}, signing via ${rt.fastSigning || '?'}, pi-backend ${rt.piBackend || '?'}.`,
    ].filter(Boolean).join(' ');
  } catch (err) {
    out.dataset.tone = 'bad';
    out.textContent = err.message;
  } finally {
    btn.disabled = false;
  }
}

async function settlePending() {
  const out = $('#payout-check-result');
  const btn = $('#settle-pending');
  btn.disabled = true;
  out.textContent = 'Checking with Pi…';
  out.dataset.tone = '';

  try {
    const r = await api('/api/admin/rewards/settle-pending', { method: 'POST', body: {} });
    out.dataset.tone = r.handled?.some((h) => !h.resolved) ? 'bad' : 'ok';
    out.textContent = r.found
      ? `${r.found} open payment(s): ` +
        r.handled.map((h) => `${h.id.slice(0, 10)}… ${h.resolved ? h.action : 'FAILED: ' + h.error}`).join(' · ')
      : r.note;
  } catch (err) {
    out.dataset.tone = 'bad';
    out.textContent = err.message;
  } finally {
    btn.disabled = false;
    await refresh();
  }
}

let posts = [];

async function loadPosts() {
  try {
    posts = (await api('/api/admin/news')).items;
  } catch {
    return;
  }

  const when = (ts) => new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(new Date(ts));

  $('#admin-news').innerHTML = posts.length
    ? posts
        .map(
          (p) => `<tr>
            <td data-label="Title">${esc(p.title)}</td>
            <td data-label="Address"><a href="/news/${esc(p.slug)}" target="_blank" rel="noopener">/${esc(p.slug)}</a></td>
            <td data-label="State" data-tone="${p.published ? 'ok' : 'warn'}">${p.published ? 'published' : 'draft'}${p.pinned ? ' · pinned' : ''}</td>
            <td data-label="Updated">${when(p.updated_at)}</td>
            <td data-label="">
              <button class="btn btn-ghost btn-sm" data-edit="${p.id}" type="button">Edit</button>
              <button class="btn btn-danger btn-sm" data-remove="${p.id}" type="button">Delete</button>
            </td>
          </tr>`
        )
        .join('')
    : '<tr><td colspan="5" class="muted">No posts yet.</td></tr>';

  $$('#admin-news [data-edit]').forEach((btn) =>
    btn.addEventListener('click', () => editPost(Number(btn.dataset.edit)))
  );
  $$('#admin-news [data-remove]').forEach((btn) =>
    btn.addEventListener('click', () => removePost(Number(btn.dataset.remove)))
  );
}

function editPost(id) {
  const post = posts.find((p) => p.id === id);
  if (!post) return;

  $('#post-id').value = post.id;
  $('#post-title').value = post.title;
  $('#post-slug').value = post.slug;
  $('#post-summary').value = post.summary || '';
  $('#post-body').value = post.body;
  $('#post-published').checked = Boolean(post.published);
  $('#post-pinned').checked = Boolean(post.pinned);

  $('#post-form-title').textContent = `Editing: ${post.title}`;
  $('#post-cancel').classList.remove('hidden');
  $('#post-status').textContent = '';
  $('#post-title').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function resetPostForm() {
  ['post-id', 'post-title', 'post-slug', 'post-summary', 'post-body'].forEach((id) => ($('#' + id).value = ''));
  $('#post-published').checked = false;
  $('#post-pinned').checked = false;
  $('#post-form-title').textContent = 'New post';
  $('#post-cancel').classList.add('hidden');
  $('#post-status').textContent = '';
}

async function savePost() {
  const id = $('#post-id').value;
  const payload = {
    title: $('#post-title').value,
    slug: $('#post-slug').value,
    summary: $('#post-summary').value,
    body: $('#post-body').value,
    published: $('#post-published').checked,
    pinned: $('#post-pinned').checked,
  };

  const btn = $('#post-save');
  btn.disabled = true;

  try {
    const result = id
      ? await api(`/api/admin/news/${id}`, { method: 'PUT', body: payload })
      : await api('/api/admin/news', { method: 'POST', body: payload });

    toast(id ? 'Post updated.' : 'Post created.');
    $('#post-status').textContent = result.post.published
      ? `Live at /news/${result.post.slug}`
      : 'Saved as a draft.';
    resetPostForm();
    await loadPosts();
  } catch (err) {
    $('#post-status').textContent = err.message;
    toast(err.message, 'bad', 8000);
  } finally {
    btn.disabled = false;
  }
}

async function removePost(id) {
  const post = posts.find((p) => p.id === id);
  if (!confirm(`Delete "${post?.title || id}"? This cannot be undone.`)) return;

  try {
    await api(`/api/admin/news/${id}`, { method: 'DELETE' });
    toast('Post deleted.');
    await loadPosts();
  } catch (err) {
    toast(err.message, 'bad');
  }
}

async function loadDay() {
  const day = $('#admin-day').value;
  if (!day) return toast('Pick a day first.', 'bad');

  const list = $('#admin-board');
  const empty = $('#admin-board-empty');

  try {
    const data = await api('/api/admin/leaderboard?day=' + encodeURIComponent(day));
    if (!data.entries.length) {
      list.innerHTML = '';
      empty.textContent = 'No qualifying runs on that day.';
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');
    list.innerHTML = data.entries
      .map(
        (e) => `<li class="board-row" data-rank="${e.rank}">
          <span class="board-rank">${e.rank}</span>
          <span class="board-name">@${esc(e.username || 'pioneer')}</span>
          <span class="board-runs muted">${e.runs} run${e.runs === 1 ? '' : 's'}${
            e.canReceivePayments ? '' : ' · no wallet permission'
          }</span>
          <span class="board-score num">${fmt(e.score)} ms</span>
        </li>`
      )
      .join('');

    const status = $('#admin-pay-status');
    if (data.reward) {
      status.classList.remove('hidden');
      status.dataset.tone = data.reward.status === 'paid' ? 'ok' : 'bad';
      const frozen = data.reward.paid_at
        ? ` · board frozen at ${fmtDate(data.reward.paid_at)}`
        : '';
      status.textContent = `${data.reward.status} — ${fmt(data.reward.amount)} π to @${data.reward.username || '?'}${
        data.reward.txid ? ' · txid ' + data.reward.txid : ''
      }${frozen}`;
    } else {
      status.classList.add('hidden');
    }
  } catch (err) {
    toast(err.message, 'bad');
  }
}

async function payWinner() {
  const day = $('#admin-day').value;
  if (!day) return toast('Pick a day first.', 'bad');
  const isToday = state?.server?.today === day;
  const warning = isToday
    ? `Pay the current leader of ${day} now?\n\nThis settles today early: the board freezes at this moment, the rest of today counts for nothing, and tomorrow starts a new leaderboard. It moves real funds and cannot be undone.`
    : `Pay the winner of ${day} from the app wallet?\n\nThis moves real funds and cannot be undone.`;
  if (!confirm(warning)) return;

  const btn = $('#admin-pay');
  const status = $('#admin-pay-status');
  btn.disabled = true;
  status.classList.remove('hidden');
  status.dataset.tone = '';
  status.textContent = 'Starting the payment…';

  try {
    const data = await api('/api/admin/rewards/pay', { method: 'POST', body: { day } });
    status.textContent = `Payment started for @${data.username}. Waiting for Pi…`;
    await watchPayout(day, data);
  } catch (err) {
    status.dataset.tone = 'bad';
    status.textContent = err.message;
    toast(err.message, 'bad', 10000);
  } finally {
    btn.disabled = false;
  }
}

async function watchPayout(day, started) {
  const status = $('#admin-pay-status');
  const deadline = Date.now() + 4 * 60 * 1000;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2000));

    let s;
    try {
      s = await api(`/api/admin/rewards/status?day=${encodeURIComponent(day)}`);
    } catch {
      continue;
    }

    if (s.status === 'paid') {
      status.dataset.tone = 'ok';
      status.textContent =
        `Paid ${fmt(s.amount)} π to @${s.username}${s.txid ? ' · txid ' + s.txid : ''}` +
        (started?.early ? '. Today is settled and frozen.' : '');
      toast(`Paid ${fmt(s.amount)} π to @${s.username}.`);
      await refresh();
      await loadDay();
      return;
    }

    if (s.status === 'failed') {
      status.dataset.tone = 'bad';
      status.textContent = s.error || 'The payout failed.';
      toast('The payout failed. The reason is shown below the leaderboard.', 'bad', 10000);
      await refresh();
      return;
    }

    status.textContent = `Working… (${s.status || 'starting'})`;
  }

  status.dataset.tone = 'bad';
  status.textContent =
    'Still running after four minutes. It keeps going on the server; reload this page to see the result.';
}

function renderRewards() {
  $('#admin-rewards').innerHTML = state.rewards
    .map(
      (r) => `<tr>
        <td data-label="Day">${esc(r.day)}</td>
        <td data-label="Winner">@${esc(r.username || '?')}</td>
        <td class="num" data-label="Score">${fmt(r.score)} ms</td>
        <td class="num" data-label="Amount">${fmt(r.amount)} π</td>
        <td data-label="Status" data-tone="${r.status === 'paid' ? 'ok' : r.status === 'failed' ? 'bad' : 'warn'}">${esc(r.status)}</td>
        <td data-label="Transaction" class="num">${r.txid ? esc(r.txid.slice(0, 14)) + '…' : '—'}</td>
        <td data-label="Detail" style="white-space:normal;max-width:34ch">${esc(r.error || '—')}</td>
        <td data-label="">${
          r.status === 'paid'
            ? ''
            : `<button class="btn btn-ghost btn-sm" data-release="${esc(r.day)}" type="button">Release</button>
               <button class="btn btn-ghost btn-sm" data-retry="${esc(r.day)}" type="button">Retry</button>`
        }</td>
      </tr>`
    )
    .join('');

  $$('#admin-rewards [data-release]').forEach((btn) =>
    btn.addEventListener('click', () => releasePayout(btn.dataset.release))
  );
  $$('#admin-rewards [data-retry]').forEach((btn) =>
    btn.addEventListener('click', () => {
      $('#admin-day').value = btn.dataset.retry;
      payWinner();
    })
  );
}

async function releasePayout(day) {
  if (!confirm(`Release the stuck payout lock for ${day}?\n\nThis only clears the lock so it can be retried. It never marks anything as paid.`)) return;
  try {
    const data = await api('/api/admin/rewards/release', { method: 'POST', body: { day } });
    toast(data.note, 'ok', 9000);
    await refresh();
  } catch (err) {
    toast(err.message, 'bad', 8000);
  }
}

function renderAudit() {
  $('#admin-audit').innerHTML = state.audit
    .map(
      (a) => `<tr>
        <td data-label="Setting">${esc(a.key)}</td>
        <td data-label="Changed">${fmtDate(a.updated_at)}</td>
        <td data-label="By">${a.updated_by ? '@' + esc(a.updated_by) : '—'}</td>
      </tr>`
    )
    .join('');
}
