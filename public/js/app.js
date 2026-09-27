import { $, $$, api, fmt, toast, countTo, clientInfo, localStore, latencyTone, latencyVerdict, esc } from './util.js';
import { initTheme } from './theme.js';
import { Widget } from './widget.js';
import { PingRunner, Monitor, medianLatency } from './globalping.js';
import { pi, initPi, signIn, signOut, messageFor, inPiBrowser } from './pi.js';
import { initDonate } from './donate.js';
import { initAds, runAdGate, ads } from './ads.js';
import { share } from './share.js';
import { loadLatestNews } from './news.js';
import { applyNetworkLinks } from './shell.js';
import { initLeaderboard, load as loadLeaderboard } from './leaderboard.js';

const ui = { cfg: null, widget: null, runner: null, monitor: null, ipinfo: null, results: [], averages: {}, runToken: null };

init();

async function init() {
  watchCspViolations();
  initReveal();
  initScrollProgress();
  initSpotlights();
  initTheme();
  initNav();
  initAccordionState();

  ui.cfg = await api('/api/config').catch(() => null);
  if (!ui.cfg) {
    toast('Could not load the site configuration. Please reload the page.', 'bad');
    return;
  }

  applyBrand(ui.cfg.brand);
  applyNetworkLinks(ui.cfg);
  loadLatestNews();
  showBuild(ui.cfg.build);
  await initPi(ui.cfg);
  await initAds(ui.cfg);
  paintAdsNote();
  setupAuth();
  initDonate(ui.cfg);
  initLeaderboard(ui.cfg);
  setupWidget();
  setupPing();
  loadConnectionInfo();
}

function applyBrand(brand) {
  $$('[data-brand-name]').forEach((el) => (el.textContent = brand.name));
  $$('[data-brand-tagline]').forEach((el) => (el.textContent = brand.tagline));
  const mail = $('#contact-mail');
  if (mail) {
    mail.href = 'mailto:' + brand.email;
    mail.textContent = brand.email;
  }
  const tg = $('#contact-telegram');
  if (tg) tg.href = brand.telegram;
}

const cspViolations = [];

function watchCspViolations() {
  document.addEventListener('securitypolicyviolation', (e) => {
    cspViolations.push(`${e.violatedDirective} blocked ${e.blockedURI}`);
  });
}

function initScrollProgress() {
  const bar = $('#scroll-progress');
  if (!bar) return;

  let ticking = false;
  const update = () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    const ratio = max > 0 ? Math.min(1, scrollY / max) : 0;
    bar.style.setProperty('--progress', ratio.toFixed(4));
    ticking = false;
  };

  addEventListener(
    'scroll',
    () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    },
    { passive: true }
  );
  update();
}

function initSpotlights() {
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  $$('.spotlight').forEach((el) => {
    let frame = 0;

    el.addEventListener('pointermove', (e) => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect();
        el.style.setProperty('--mx', `${((e.clientX - rect.left) / rect.width) * 100}%`);
        el.style.setProperty('--my', `${((e.clientY - rect.top) / rect.height) * 100}%`);
        frame = 0;
      });
    });

    el.addEventListener('pointerenter', () => (el.dataset.hot = 'true'));
    el.addEventListener('pointerleave', () => {
      el.dataset.hot = 'false';
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    });
  });
}

function initReveal() {
  const targets = $$('[data-reveal]');
  if (!targets.length) return;

  if (!('IntersectionObserver' in window) ||
      matchMedia('(prefers-reduced-motion: reduce)').matches) {
    targets.forEach((el) => (el.dataset.visible = 'true'));
    return;
  }

  const obs = new IntersectionObserver(
    (entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        en.target.dataset.visible = 'true';
        obs.unobserve(en.target);
      });
    },
    { rootMargin: '0px 0px -12% 0px', threshold: 0.05 }
  );

  targets.forEach((el) => obs.observe(el));
}

function showBuild(build) {
  const el = $('#build-stamp');
  if (el && build) el.textContent = build;
}

function setupAuth() {
  $('#pi-auth')?.addEventListener('click', () => {
    if (pi.signedIn) {
      $('#leaderboard')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      doSignIn();
    }
  });

  revealAdminLink();
  document.addEventListener('pi:auth-changed', revealAdminLink);
  $('#account-signin')?.addEventListener('click', doSignIn);
  $('#drawer-signin')?.addEventListener('click', doSignIn);
  document.addEventListener('pi:sign-in-requested', doSignIn);
  $('#account-signout')?.addEventListener('click', doSignOut);

  $('#auth-debug-copy')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('#auth-debug-body').textContent);
      toast('Diagnostics copied.');
    } catch {
      toast('Select the text and copy it manually.', 'bad');
    }
  });

  paintAuth();
}

async function doSignIn() {
  if (!pi.configured) {
    toast(messageFor(pi.reason), 'bad', 9000);
    showAuthDebug({ phase: 'config' }, messageFor(pi.reason));
    return;
  }

  const buttons = $$('#pi-auth, #account-signin, #drawer-signin, #donate-signin');
  buttons.forEach((b) => (b.disabled = true));

  try {
    if (ui.cfg.ads?.beforeSignIn) {
      const gate = await runAdGate('signin', { label: 'sign-in' });
      if (!gate.proceed) return;
    }

    const result = await signIn();

    if (result?.redirecting) return;

    paintAuth();
    const moved = result.claimedRuns
      ? ` ${result.claimedRuns} earlier run${result.claimedRuns === 1 ? '' : 's'} moved to your account.`
      : '';
    toast(`Signed in as @${pi.username}.${moved}`);
    loadLeaderboard();
  } catch (err) {
    const msg = String(err?.message || err);
    if (/cancel|abort|denied|closed/i.test(msg)) {
      toast('Sign-in cancelled.', 'bad');
    } else {
      toast(msg, 'bad', 9000);
      if (err.hint) toast(err.hint, 'bad', 11000);
      showAuthDebug(err, msg);
    }
  } finally {
    buttons.forEach((b) => (b.disabled = false));
  }
}

async function doSignOut() {
  await signOut();
  paintAuth();
  loadLeaderboard();
  toast('Signed out. New runs will be kept in this browser only.');
}

function showAuthDebug(err, msg) {
  const panel = $('#auth-debug');
  const body = $('#auth-debug-body');
  if (!panel || !body) return;

  const cfg = ui.cfg?.pi || {};
  const lines = [
    `mode:         ${pi.mode || 'none'} (${pi.mode === 'sdk' ? 'Pi Browser SDK' : 'OAuth redirect'})`,
    `phase:        ${err.phase || 'unknown'}`,
    `message:      ${msg}`,
    err.stage ? `stage:        ${err.stage}` : null,
    err.status ? `http:         ${err.status}` : null,
    err.raw && err.raw !== msg ? `sdk error:    ${err.raw}` : null,
    `pi browser:   ${inPiBrowser() ? 'yes' : 'not detected'}`,
    `sandbox:      ${cfg.sandbox}`,
    `client id:    ${cfg.clientId ? cfg.clientId.slice(0, 12) + '…' : 'NOT SET'}`,
    `redirect uri: ${cfg.redirectUri || '(none)'}`,
    `scopes:       ${(pi.mode === 'sdk' ? cfg.sdkScopes : cfg.scopes || []).join(' ') || '(none)'}`,
    `page url:     ${location.origin}${location.pathname}`,
    `ua:           ${navigator.userAgent}`,
    cspViolations.length ? '' : null,
    cspViolations.length ? 'BLOCKED BY THIS SITE\'S CONTENT SECURITY POLICY:' : null,
    ...cspViolations.slice(-6).map((v) => '  ' + v),
    '',
    pi.mode === 'sdk'
      ? 'Inside the Pi Browser, sign-in goes through window.Pi.authenticate(). A failure here means Pi refused the request — check that the app checklist in the Developer Portal is complete.'
      : 'The redirect URI above must appear character for character in the Redirect URIs list in the Pi Developer Portal.',
  ].filter(Boolean);

  body.textContent = lines.join('\n');
  panel.classList.remove('hidden');
}

async function revealAdminLink() {
  try {
    const session = await api('/api/admin/session');
    if (session.isAdmin) $('#footer-admin')?.classList.remove('hidden');
  } catch {
  }
}

function paintAdsNote() {
  const note = $('#ads-note');
  if (!note) return;

  if (!ads.enabled || !ads.supported) {
    note.classList.add('hidden');
    return;
  }

  const gates = [];
  if (ui.cfg.ads?.beforeSignIn) gates.push('signing in');
  if (ui.cfg.ads?.beforeLatency) gates.push('starting the latency test');
  if (!gates.length) return note.classList.add('hidden');

  note.textContent =
    `A short advert plays before ${gates.join(' and ')}. It keeps the site free, ` +
    'and repeated automatic latency runs are never interrupted by one.';
  note.classList.remove('hidden');
}

function paintDrawerAccount() {
  const box = $('#drawer-account');
  if (!box) return;
  const name = $('#drawer-account-name');
  const note = $('#drawer-account-note');

  box.dataset.signedIn = String(pi.signedIn);
  if (pi.signedIn) {
    name.textContent = '@' + (pi.username || 'your account');
    note.textContent = 'Your history and leaderboard entries follow this account.';
  } else {
    name.textContent = 'Not signed in';
    note.textContent = pi.configured
      ? 'Sign in with Pi to save your history and enter the leaderboard.'
      : messageFor(pi.reason);
  }
  $('#drawer-signin')?.toggleAttribute('disabled', !pi.configured);
}

function paintAuth() {
  paintDrawerAccount();
  const label = $('#pi-auth-label');
  const banner = $('#account-banner');
  const title = $('#account-title');
  const note = $('#account-note');
  const scope = $('#history-scope');

  if (pi.signedIn) {
    if (label) label.textContent = '@' + (pi.username || 'account');
    banner?.setAttribute('data-state', 'signed-in');
    if (title) title.textContent = `Signed in as @${pi.username || 'your Pi account'}`;
    if (note) {
      note.textContent =
        'Your runs are saved to your Pi account, so the same history follows you to any device you sign in on.';
    }
    $('#account-signin')?.classList.add('hidden');
    $('#account-signout')?.classList.remove('hidden');
    if (scope) scope.textContent = 'These runs are stored against your Pi account.';
    return;
  }

  if (label) label.textContent = 'Sign in';
  if (note && pi.configured) {
    note.textContent =
      pi.mode === 'sdk'
        ? 'Results are tied to this browser only. Sign in with your Pi account to keep them and see the same history on any device.'
        : 'Results are tied to this browser only. Sign in with Pi — you will be taken to Pi to approve, then brought straight back.';
  }
  banner?.setAttribute('data-state', pi.configured ? 'anon' : 'unavailable');
  $('#account-signin')?.classList.remove('hidden');
  $('#account-signout')?.classList.add('hidden');

  if (!pi.configured) {
    if (title) title.textContent = 'Pi sign-in unavailable';
    if (note) note.textContent = messageFor(pi.reason);
    const btn = $('#account-signin');
    if (btn) btn.disabled = true;
    const headerBtn = $('#pi-auth');
    if (headerBtn) headerBtn.classList.add('hidden');
  }

  if (scope) {
    scope.textContent =
      'Every latency run is kept for this browser so you can watch your connection over time.';
  }
}

function setupWidget() {
  ui.widget = new Widget($('#widget'), ui.cfg);

  ui.widget.addEventListener('ready', () => {
    const box = $('#console');
    box.dataset.booting = 'true';
    setTimeout(() => (box.dataset.booting = 'false'), 1200);
    setStatus('Ready — press start inside the widget', 'live');
  });

  ui.widget.mount();
}

function setStatus(text, tone = '') {
  const el = $('#widget-status');
  if (el) el.innerHTML = `<span class="dot ${tone}"></span>${text}`;
}

function setupPing() {
  const targets = ui.cfg.pingTargets || [];
  renderTargetRows(targets);

  $('#ping-start')?.addEventListener('click', () => runPing());
  $('#ping-stop')?.addEventListener('click', () => ui.runner?.abort());
  $('#share-result')?.addEventListener('click', shareResult);
  $('#copy-result')?.addEventListener('click', copyResult);

  setupMonitor();
  loadAverages();
}

function setupMonitor() {
  const host = $('#monitor-presets');
  const status = $('#monitor-status');
  if (!host) return;

  ui.monitor = new Monitor(() => runPing({ silent: true }));

  let countdown = 0;
  ui.monitor.onTick = (nextAt) => {
    clearInterval(countdown);
    if (!nextAt) {
      if (status) status.textContent = '';
      document.body.dataset.monitoring = 'false';
      return;
    }
    document.body.dataset.monitoring = 'true';
    const paint = () => {
      const left = Math.max(0, Math.round((nextAt - Date.now()) / 1000));
      const m = String(Math.floor(left / 60)).padStart(2, '0');
      const sec = String(left % 60).padStart(2, '0');
      if (status) status.textContent = `Next run in ${m}:${sec}`;
    };
    paint();
    countdown = setInterval(paint, 1000);
  };

  host.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    $$('#monitor-presets button').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    const seconds = Number(btn.dataset.value);
    ui.monitor.start(seconds);
    if (seconds) toast(`Repeating the latency test every ${seconds / 60} minute${seconds === 60 ? '' : 's'}.`);
  });
}

async function loadAverages() {
  try {
    const data = await api('/api/stats');
    ui.averages = Object.fromEntries((data.targets || []).map((t) => [t.target, t.avg_latency]));
  } catch {
    ui.averages = {};
  }
}

async function shareResult() {
  const text = summaryText();
  if (!text) return toast('Run the latency test first.', 'bad');
  await share({ title: `${ui.cfg.brand?.name || 'Internet Speed'} — my latency`, message: text });
}

async function copyResult() {
  const text = summaryText();
  if (!text) return toast('Run the latency test first.', 'bad');
  try {
    await navigator.clipboard.writeText(text);
    toast('Result copied to your clipboard.');
  } catch {
    prompt('Copy the result:', text);
  }
}

function summaryText() {
  if (!ui.results.length) return '';
  const reached = ui.results.filter((r) => r.ok);
  const med = medianLatency(ui.results);
  const fastest = [...reached].sort((a, b) => a.latency - b.latency)[0];

  const lines = [
    `My latency: ${fmt(med)} ms median`,
    `${ui.ipinfo?.isp || 'My connection'}${ui.ipinfo?.country ? ' · ' + ui.ipinfo.country : ''}`,
    `${reached.length} of ${ui.results.length} services reachable` +
      (fastest ? ` · closest ${fastest.name} at ${fmt(fastest.latency)} ms` : ''),
    '',
    ...ui.results.map((r) => `${r.name.padEnd(11)} ${r.ok ? fmt(r.latency) + ' ms' : 'unreachable'}`),
    '',
    `Measured on ${location.origin}`,
  ];
  return lines.join('\n');
}

function renderTargetRows(targets) {
  const host = $('#ping-list');
  if (!host) return;

  host.innerHTML = targets
    .map(
      (t) => `<li class="probe" id="probe-${t.id}" data-state="idle">
        <span class="probe-name">${t.name}<span class="probe-hint">${t.hint || ''}</span></span>
        <span class="probe-bar"><i></i></span>
        <span class="probe-value num">—</span>
      </li>`
    )
    .join('');
}

async function runPing({ silent = false, skipAd = false } = {}) {
  const targets = ui.cfg.pingTargets || [];
  if (!targets.length || ui.runner?.running) return;

  if (!silent && !skipAd && ui.cfg.ads?.beforeLatency) {
    const gate = await runAdGate('latency', { label: 'the latency test' });
    if (!gate.proceed) return;
  }

  ui.runner = new PingRunner(targets, ui.cfg.ping);
  ui.results = [];
  ui.runToken = await api('/api/runs/token').then((d) => d.token).catch(() => null);

  const startBtn = $('#ping-start');
  const stopBtn = $('#ping-stop');
  const progress = $('#ping-progress');

  startBtn.disabled = true;
  stopBtn.classList.remove('hidden');
  document.body.dataset.measuring = 'true';
  renderTargetRows(targets);
  $('#ping-summary')?.classList.add('hidden');

  ui.runner.addEventListener('target:start', (e) => {
    const { target, index, total } = e.detail;
    const row = $(`#probe-${target.id}`);
    if (row) row.dataset.state = 'busy';
    if (progress) {
      progress.textContent = `Testing ${target.name} — ${index + 1} of ${total}`;
    }
  });

  ui.runner.addEventListener('target:done', (e) => {
    const r = e.detail;
    ui.results.push(r);
    paintProbe(r);
  });

  ui.runner.addEventListener('finished', ({ detail }) => {
    startBtn.disabled = false;
    stopBtn.classList.add('hidden');
    document.body.dataset.measuring = 'false';
    if (progress) progress.textContent = '';
    paintSummary(detail.results);
    saveRun(detail.results, { silent });
  });

  await ui.runner.run();
}

function paintProbe(r) {
  const row = $(`#probe-${r.target}`);
  if (!row) return;

  row.dataset.state = r.ok ? 'done' : 'failed';
  row.dataset.tone = r.ok ? latencyTone(r.latency) : 'bad';

  const value = $('.probe-value', row);
  const bar = $('.probe-bar i', row);

  if (!r.ok) {
    value.textContent = 'unreachable';
    bar.style.width = '100%';
    return;
  }

  const average = ui.averages[r.target];
  if (average) {
    const delta = r.latency - average;
    const sign = delta >= 0 ? '+' : '−';
    const hint = $('.probe-hint', row);
    if (hint) {
      hint.textContent = `${sign}${fmt(Math.abs(delta))} ms vs the average here`;
      hint.dataset.tone = delta <= 0 ? 'ok' : delta < 40 ? '' : 'warn';
    }
  }

  value.textContent = `${fmt(r.latency)} ms`;

  bar.style.width = Math.min(100, Math.max(4, (r.latency / 600) * 100)) + '%';
}

function paintSummary(results) {
  const box = $('#ping-summary');
  if (!box) return;

  const reached = results.filter((r) => r.ok);
  const med = medianLatency(results);
  const fastest = [...reached].sort((a, b) => a.latency - b.latency)[0];
  const slowest = [...reached].sort((a, b) => b.latency - a.latency)[0];

  if (!reached.length) {
    box.classList.remove('hidden');
    box.innerHTML =
      '<p class="muted">None of the targets responded. Your network is blocking these requests, or you are offline.</p>';
    return;
  }

  const el = $('#summary-median');
  if (el) countTo(el, med, 500);

  box.classList.remove('hidden');
  $('#summary-verdict').textContent = latencyVerdict(med);
  $('#summary-verdict').dataset.tone = latencyTone(med);
  $('#summary-reach').textContent = `${reached.length} of ${results.length} reachable`;
  $('#summary-fastest').textContent = fastest ? `${fastest.name} (${fmt(fastest.latency)} ms)` : '—';
  $('#summary-slowest').textContent = slowest ? `${slowest.name} (${fmt(slowest.latency)} ms)` : '—';

  const versus = $('#summary-versus');
  if (versus) {
    const comparable = reached.filter((r) => ui.averages[r.target]);
    if (!comparable.length) {
      versus.textContent = 'not enough public data yet';
      versus.dataset.tone = '';
    } else {
      const delta =
        comparable.reduce((sum, r) => sum + (r.latency - ui.averages[r.target]), 0) / comparable.length;
      const faster = delta <= 0;
      versus.textContent = `${fmt(Math.abs(delta))} ms ${faster ? 'faster' : 'slower'} on average`;
      versus.dataset.tone = faster ? 'ok' : Math.abs(delta) < 40 ? '' : 'warn';
    }
  }
}

async function saveRun(results, { silent = false } = {}) {
  const info = clientInfo();
  const payload = {
    samples: results.map((r) => ({ target: r.target, latency: r.latency, ok: r.ok })),
    platform: info.platform,
    browser: info.browser,
    token: ui.runToken || undefined,
  };

  localStore.push({
    created_at: Date.now(),
    isp: ui.ipinfo?.isp || null,
    samples: payload.samples,
  });

  try {
    await api('/api/runs', { method: 'POST', body: payload });
    loadAverages();
    loadLeaderboard();
  } catch {
    if (!silent) toast('Saved on this device only — the server did not accept the run.', 'bad');
  }
}

async function loadConnectionInfo() {
  const info = clientInfo();
  try {
    ui.ipinfo = await api('/api/ipinfo');
  } catch {
  }
  const ip = ui.ipinfo;

  const rows = [
    ['IP address', ip?.ip],
    ['Provider / ISP', ip?.isp],
    ['Autonomous system (ASN)', ip?.asn],
    ['Approximate location', [ip?.city, ip?.country].filter(Boolean).join(', ')],
    ['Browser', info.browser],
    ['Operating system', info.platform],
    ['Connection type', info.connType],
  ];

  const host = $('#conn-info');
  if (host) {
    host.innerHTML = rows
      .map(
        ([k, v]) => `<div class="capability">
          <span class="cap-name">${k}</span>
          <span class="verdict num" style="color:var(--text)">${esc(v) || 'Unknown'}</span>
        </div>`
      )
      .join('');
  }

  const chipIsp = $('#chip-isp');
  if (chipIsp && ip?.isp) chipIsp.innerHTML = `<span class="dot live"></span>${esc(ip.isp)}`;
  const chipIp = $('#chip-ip');
  if (chipIp && ip?.ip) chipIp.innerHTML = `IP <b class="num">${esc(ip.ip)}</b>`;
}

function initNav() {
  const nav = $('#nav');
  const burger = $('#burger');

  const setDrawer = (open) => {
    nav.dataset.open = String(open);
    burger?.setAttribute('aria-expanded', String(open));
    document.body.style.overflow = open ? 'hidden' : '';

    if (open) nav.scrollTop = 0;
  };

  burger?.addEventListener('click', () => setDrawer(nav.dataset.open !== 'true'));

  nav?.addEventListener('click', (e) => {
    if (e.target.closest('.theme-option')) return;
    if (e.target.closest('a')) setDrawer(false);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && nav.dataset.open === 'true') {
      setDrawer(false);
      burger?.focus();
    }
  });

  addEventListener('resize', () => {
    if (innerWidth > 980 && nav.dataset.open === 'true') setDrawer(false);
  });

  const header = $('#header');
  addEventListener('scroll', () => (header.dataset.scrolled = String(scrollY > 8)), {
    passive: true,
  });

  const links = new Map($$('#nav a[href^="#"]').map((a) => [a.getAttribute('href').slice(1), a]));
  const obs = new IntersectionObserver(
    (entries) => {
      entries.forEach((en) => {
        const link = links.get(en.target.id);
        if (link && en.isIntersecting) {
          links.forEach((l) => l.removeAttribute('aria-current'));
          link.setAttribute('aria-current', 'page');
        }
      });
    },
    { rootMargin: '-45% 0px -50% 0px' }
  );
  $$('section[id]').forEach((s) => obs.observe(s));
}

function initAccordionState() {
  const group = $$('.acc[data-group="faq"]');
  group.forEach((d) =>
    d.addEventListener('toggle', () => {
      if (d.open) group.forEach((o) => o !== d && (o.open = false));
    })
  );
}
