import { $, $$, api, clientInfo, esc } from './util.js';
import { initTheme } from './theme.js';
import { pi, initPi, signIn, signOut, messageFor } from './pi.js';
import { loadHistory, initHistoryActions } from './history.js';
import { loadStats, initStatsListeners } from './stats.js';
import { initShell, applyBrand, applyNetworkLinks, bindAuthButtons } from './shell.js';

const state = { cfg: null, ipinfo: null };

init();

async function init() {
  initTheme();
  initShell();
  initHistoryActions();
  initStatsListeners();

  state.cfg = await api('/api/config').catch(() => null);
  if (!state.cfg) return;

  applyBrand(state.cfg);
  applyNetworkLinks(state.cfg);
  await initPi(state.cfg);
  bindAuthButtons({ signIn, signOut, messageFor });

  loadHistory();
  loadStats();
  loadConnection();

  document.addEventListener('pi:auth-changed', () => loadHistory());
}

async function loadConnection() {
  const info = clientInfo();
  try {
    state.ipinfo = await api('/api/ipinfo');
  } catch {
  }
  const ip = state.ipinfo;

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
  if (!host) return;
  host.innerHTML = rows
    .map(
      ([k, v]) => `<div class="capability">
        <span class="cap-name">${k}</span>
        <span class="verdict num" style="color:var(--text)">${esc(v) || 'Unknown'}</span>
      </div>`
    )
    .join('');
}
