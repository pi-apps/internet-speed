import { $, api, fmt, fmtDate, fmtDayMonth, toast, localStore, latencyTone, esc } from './util.js';
import { lineChart } from './chart.js';

let cache = [];

export async function loadHistory() {
  const body = $('#history-body');
  if (!body) return;

  try {
    cache = (await api('/api/runs/mine?limit=30')).items || [];
  } catch {
    cache = localStore.read();
  }

  const empty = $('#history-empty');
  if (!cache.length) {
    body.innerHTML = '';
    empty?.classList.remove('hidden');
    $('#history-chart')?.classList.add('hidden');
    $('#history-chart-empty')?.classList.remove('hidden');
    return;
  }

  empty?.classList.add('hidden');
  renderTable();
  renderChart();
}

function median(run) {
  const values = (run.samples || []).filter((s) => s.ok).map((s) => s.latency).sort((a, b) => a - b);
  if (!values.length) return null;
  return values[Math.floor(values.length / 2)];
}

function renderTable() {
  $('#history-body').innerHTML = cache
    .map((run) => {
      const reached = (run.samples || []).filter((s) => s.ok).length;
      const total = (run.samples || []).length;
      const med = median(run);
      const best = run.samples?.filter((s) => s.ok).sort((a, b) => a.latency - b.latency)[0];
      return `<tr>
        <td data-label="Time">${fmtDate(run.created_at)}</td>
        <td class="num" data-label="Median" data-tone="${latencyTone(med)}">${fmt(med)} ms</td>
        <td data-label="Closest">${best ? `${esc(best.target)} · ${fmt(best.latency)} ms` : '—'}</td>
        <td class="num" data-label="Reached">${reached}/${total}</td>
        <td data-label="Provider">${esc(run.isp) || '—'}</td>
      </tr>`;
    })
    .join('');
}

function renderChart() {
  const svg = $('#history-chart');
  const emptyBox = $('#history-chart-empty');
  if (!svg) return;

  const rows = [...cache].reverse().filter((r) => median(r) !== null).slice(-24);
  const ok =
    rows.length > 1 &&
    lineChart(
      svg,
      [{ name: 'Median latency', color: 'var(--lat)', points: rows.map(median) }],
      rows.map((r) => fmtDayMonth(r.created_at)),
      'ms'
    );

  svg.classList.toggle('hidden', !ok);
  emptyBox?.classList.toggle('hidden', ok);
}

export function initHistoryActions() {
  $('#history-clear')?.addEventListener('click', async () => {
    if (!confirm('Delete every latency run stored in this browser?')) return;
    try {
      await api('/api/runs/mine', { method: 'DELETE' });
    } catch {
    }
    localStore.clear();
    cache = [];
    await loadHistory();
    toast('History cleared.');
  });

  $('#history-refresh')?.addEventListener('click', () => loadHistory());
  addEventListener('resize', debounce(() => cache.length && renderChart(), 250));
}

function debounce(fn, ms) {
  let id;
  return (...args) => {
    clearTimeout(id);
    id = setTimeout(() => fn(...args), ms);
  };
}
