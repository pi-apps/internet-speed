export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function fmt(v, unit = '') {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  const n = Number(v);
  const dec = n >= 100 ? 0 : n >= 10 ? 1 : 2;
  return n.toFixed(dec) + (unit ? ' ' + unit : '');
}

export const fmtInt = (v) => (v === null || v === undefined ? '—' : Math.round(v).toLocaleString('en-US'));

export function fmtDate(ts) {
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
    .format(new Date(ts));
}

export function fmtDayMonth(ts) {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date(ts));
}

export function countTo(el, target, ms = 600) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const from = Number(el.dataset.value || 0);
  const to = Number(target) || 0;
  el.dataset.value = String(to);

  if (reduce || ms === 0) {
    el.textContent = fmt(to);
    return;
  }
  const t0 = performance.now();
  const step = (now) => {
    const p = Math.min(1, (now - t0) / ms);
    el.textContent = fmt(from + (to - from) * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

const GATEWAY_ERRORS = {
  502: 'The server did not answer. If this was a payment, it may still be running - check its status before retrying.',
  503: 'The service is unavailable right now.',
  504: 'The request took longer than the proxy allows. Anything already started on the server keeps running.',
};

export async function api(path, options = {}) {
  let res;
  try {
    res = await fetch(path, {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      ...options,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch (err) {
    throw new Error(`Could not reach the server: ${err.message}`);
  }

  if (res.status === 204) return null;

  const isJson = (res.headers.get('content-type') || '').includes('application/json');
  const data = isJson ? await res.json().catch(() => ({})) : {};

  if (!res.ok) {
    const err = new Error(data.error || GATEWAY_ERRORS[res.status] || `Request failed (HTTP ${res.status}).`);
    err.status = res.status;
    err.detail = data.detail;
    err.hint = data.hint;
    throw err;
  }

  return data;
}

export function toast(message, kind = 'ok', ttl = 4200) {
  const host = $('#toasts');
  if (!host) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.dataset.kind = kind;
  el.setAttribute('role', 'status');
  el.textContent = message;
  host.append(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity 240ms';
    setTimeout(() => el.remove(), 260);
  }, ttl);
}

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

export function clientInfo() {
  const ua = navigator.userAgent;
  return {
    browser:
      /Edg\//.test(ua) ? 'Edge'
      : /OPR\//.test(ua) ? 'Opera'
      : /Firefox\//.test(ua) ? 'Firefox'
      : /Chrome\//.test(ua) ? 'Chrome'
      : /Safari\//.test(ua) ? 'Safari'
      : null,
    platform:
      /Android/.test(ua) ? 'Android'
      : /iPhone|iPad/.test(ua) ? 'iOS'
      : /Windows/.test(ua) ? 'Windows'
      : /Mac OS/.test(ua) ? 'macOS'
      : /Linux/.test(ua) ? 'Linux'
      : null,
    connType: navigator.connection?.effectiveType || null,
  };
}

export const localStore = {
  key: 'ng-runs',
  read() {
    try {
      return JSON.parse(localStorage.getItem(this.key) || '[]');
    } catch {
      return [];
    }
  },
  push(item) {
    const items = this.read();
    items.unshift(item);
    localStorage.setItem(this.key, JSON.stringify(items.slice(0, 50)));
  },
  clear() {
    localStorage.removeItem(this.key);
  },
};

export function latencyTone(ms) {
  if (ms === null || ms === undefined) return 'bad';
  if (ms < 80) return 'ok';
  if (ms < 200) return 'warn';
  return 'bad';
}

export function latencyVerdict(ms) {
  if (ms === null || ms === undefined) return 'Unreachable';
  if (ms < 80) return 'Excellent';
  if (ms < 150) return 'Good';
  if (ms < 300) return 'Sluggish';
  return 'Very slow';
}
