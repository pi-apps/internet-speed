import { $, api, fmt, fmtInt, latencyTone, esc } from './util.js';
import { lineChart, barWidth } from './chart.js';

let last = null;

export async function loadStats() {
  const host = $('#stats-cards');
  if (!host) return;

  try {
    last = await api('/api/stats');
    render(last);
  } catch {
    host.innerHTML =
      '<p class="muted">Public statistics are unavailable. The server may have this feature switched off.</p>';
  }
}

function render(data) {
  renderOverview(data.overview);
  renderTargets(data.targets);
  renderIsps(data.isps);
  renderHourly(data.hourly);
}

function renderOverview(o = {}) {
  const cards = [
    { label: 'Latency runs recorded', value: fmtInt(o.runs) },
    { label: 'Runs in the last 24 hours', value: fmtInt(o.last_24h) },
    { label: 'Average latency, all targets', value: fmt(o.avg_latency, 'ms') },
    { label: 'Providers represented', value: fmtInt(o.providers) },
    { label: 'Signed-in Pi accounts', value: fmtInt(o.pi_users) },
  ];

  $('#stats-cards').innerHTML = cards
    .map(
      (c) => `<div class="stat">
        <div class="stat-value num">${c.value}</div>
        <div class="stat-label">${c.label}</div>
      </div>`
    )
    .join('');
}

function renderTargets(list = []) {
  const body = $('#target-body');
  if (!body) return;

  if (!list.length) {
    $('#target-wrap')?.classList.add('hidden');
    $('#target-empty')?.classList.remove('hidden');
    return;
  }

  $('#target-wrap')?.classList.remove('hidden');
  $('#target-empty')?.classList.add('hidden');
  const max = Math.max(...list.map((r) => r.avg_latency || 0));

  body.innerHTML = list
    .map(
      (r) => `<tr>
        <td data-label="Service">${esc(r.target)}</td>
        <td class="num" data-label="Average" data-tone="${latencyTone(r.avg_latency)}">${fmt(r.avg_latency)} ms
          <span class="bar" style="width:${barWidth(r.avg_latency, max)}"></span>
        </td>
        <td class="num" data-label="Best">${fmt(r.best_latency)} ms</td>
        <td class="num" data-label="Reached">${fmt(r.reach_rate)}%</td>
        <td class="num muted" data-label="Samples">${fmtInt(r.samples)}</td>
      </tr>`
    )
    .join('');
}

function renderIsps(list = []) {
  const body = $('#isp-body');
  if (!body) return;

  if (!list.length) {
    $('#isp-wrap')?.classList.add('hidden');
    $('#isp-empty')?.classList.remove('hidden');
    return;
  }

  $('#isp-wrap')?.classList.remove('hidden');
  $('#isp-empty')?.classList.add('hidden');

  body.innerHTML = list
    .map(
      (r) => `<tr>
        <td data-label="Provider">${esc(r.isp)}</td>
        <td class="num" data-label="Average latency" data-tone="${latencyTone(r.avg_latency)}">${fmt(r.avg_latency)} ms</td>
        <td class="num muted" data-label="Runs">${fmtInt(r.runs)}</td>
      </tr>`
    )
    .join('');
}

function renderHourly(list = []) {
  const svg = $('#hourly-chart');
  const empty = $('#hourly-empty');
  if (!svg) return;

  const points = Array.from({ length: 24 }, (_, h) => {
    const row = list.find((r) => r.hour === h);
    return row?.avg_latency || 0;
  });

  const ok =
    points.some((p) => p > 0) &&
    lineChart(
      svg,
      [{ name: 'Average latency', color: 'var(--lat)', points }],
      Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0')),
      'ms'
    );

  svg.classList.toggle('hidden', !ok);
  empty?.classList.toggle('hidden', ok);
}

export function initStatsListeners() {
  addEventListener('resize', debounce(() => last && render(last), 250));
}

function debounce(fn, ms) {
  let id;
  return (...args) => {
    clearTimeout(id);
    id = setTimeout(() => fn(...args), ms);
  };
}
