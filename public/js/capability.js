import { $, $$ } from './util.js';

const NEEDS = [
  { name: 'Voice call (WhatsApp, Telegram)', need: 0.5 },
  { name: 'One-to-one video call', need: 2 },
  { name: 'Group video meeting', need: 4 },
  { name: '720p video streaming', need: 5 },
  { name: 'Full HD video streaming', need: 8 },
  { name: 'Competitive online gaming', need: 3 },
  { name: 'Live game streaming', need: 6 },
  { name: '4K video streaming', need: 25 },
  { name: 'Four devices on HD video at once', need: 32 },
];

const FILES = [
  { name: 'An MP3 track', mb: 8 },
  { name: 'One HD TV episode', mb: 700 },
  { name: 'A Full HD film', mb: 4500 },
  { name: 'A mid-size game', mb: 25000 },
];

let speed = 50;

export function initCapability() {
  const input = $('#speed-input');
  if (!input) return;

  input.value = speed;
  input.addEventListener('input', () => {
    speed = Math.max(0, Number(input.value) || 0);
    render();
  });

  $('#speed-presets')?.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    speed = Number(btn.dataset.value);
    input.value = speed;
    $$('#speed-presets button').forEach((b) =>
      b.setAttribute('aria-pressed', String(b === btn))
    );
    render();
  });

  initFileCalculator();
  render();
}

function render() {
  renderCapabilities();
  renderDownloadTimes();
}

function renderCapabilities() {
  const host = $('#capability-list');
  if (!host) return;

  host.innerHTML = NEEDS.map((item) => {
    const ok = speed >= item.need;
    return `<div class="capability" data-ok="${ok}">
      <span class="cap-name">${item.name}</span>
      <span class="cap-need">needs ${item.need} Mbps</span>
      <span class="verdict">${ok ? 'Fine' : 'Not enough'}</span>
    </div>`;
  }).join('');
}

function renderDownloadTimes() {
  const host = $('#download-times');
  if (!host) return;

  if (!speed) {
    host.innerHTML = '<p class="muted">Enter a speed above to see estimated download times.</p>';
    return;
  }

  host.innerHTML = FILES.map((f) => {
    const seconds = (f.mb * 8) / speed;
    return `<div class="capability">
      <span class="cap-name">${f.name}</span>
      <span class="cap-need">${f.mb.toLocaleString('en-US')} MB</span>
      <span class="verdict" style="color:var(--dl)">${humanTime(seconds)}</span>
    </div>`;
  }).join('');
}

export function humanTime(sec) {
  if (!isFinite(sec) || sec <= 0) return '—';
  if (sec < 60) return `${Math.round(sec)} sec`;
  if (sec < 3600) return `${Math.round(sec / 60)} min`;
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return m ? `${h} h ${m} min` : `${h} h`;
}

function initFileCalculator() {
  const size = $('#calc-size');
  const unit = $('#calc-unit');
  const out = $('#calc-result');
  if (!size || !out) return;

  const update = () => {
    const mb = Number(size.value) * (unit.value === 'gb' ? 1024 : 1);
    if (!mb || !speed) {
      out.textContent = 'Enter a file size and a speed.';
      return;
    }
    out.textContent = `About ${humanTime((mb * 8) / speed)} at ${speed} Mbps.`;
  };

  [size, unit].forEach((el) => {
    el.addEventListener('input', update);
    el.addEventListener('change', update);
  });
  $('#speed-input')?.addEventListener('input', update);
  $('#speed-presets')?.addEventListener('click', () => setTimeout(update, 0));
  update();
}
