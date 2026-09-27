import { $, $$, toast, fmt, esc } from './util.js';
import { pi, ensureSdkSession } from './pi.js';
import { share } from './share.js';

let cfg = null;
let busy = false;
let amount = 1;

export function initDonate(publicConfig) {
  cfg = publicConfig.donations || { enabled: false };
  const section = $('#donate');
  if (!section) return;

  if (!cfg.enabled) {
    section.classList.add('hidden');
    return;
  }

  renderPresets();
  bindControls();
  paintState();
  loadRecent();

  document.addEventListener('pi:auth-changed', paintState);
}

function renderPresets() {
  const host = $('#donate-presets');
  if (!host) return;
  host.innerHTML = (cfg.presets || [1])
    .map(
      (v, i) =>
        `<button type="button" data-value="${v}" aria-pressed="${i === 0}">${v} π</button>`
    )
    .join('');
  amount = cfg.presets?.[0] ?? 1;
  const input = $('#donate-amount');
  if (input) input.value = amount;
}

function bindControls() {
  $('#donate-presets')?.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    amount = Number(btn.dataset.value);
    $$('#donate-presets button').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    const input = $('#donate-amount');
    if (input) input.value = amount;
  });

  $('#donate-amount')?.addEventListener('input', (e) => {
    amount = Number(e.target.value);
    $$('#donate-presets button').forEach((b) => b.setAttribute('aria-pressed', 'false'));
  });

  const memo = $('#donate-memo');
  if (memo) {
    memo.maxLength = cfg.memoMaxLength || 50;
    memo.addEventListener('input', () => {
      const left = (cfg.memoMaxLength || 50) - memo.value.length;
      const counter = $('#donate-memo-count');
      if (counter) counter.textContent = `${left} characters left`;
    });
  }

  $('#donate-send')?.addEventListener('click', startDonation);
  $('#donate-signin')?.addEventListener('click', () =>
    document.dispatchEvent(new CustomEvent('pi:sign-in-requested'))
  );
}

function paintState() {
  const notice = $('#donate-notice');
  const form = $('#donate-form');
  const button = $('#donate-send');
  if (!notice || !form) return;

  if (pi.mode !== 'sdk') {
    form.classList.add('hidden');
    notice.classList.remove('hidden');
    notice.textContent =
      'Donations are sent from your Pi Wallet, which only exists inside the Pi Browser. Open this site there to donate.';
    return;
  }

  form.classList.remove('hidden');

  if (!pi.signedIn) {
    form.classList.remove('hidden');
    notice.classList.remove('hidden');
    notice.textContent = 'Sign in with Pi first — the payment is made from your own wallet.';
    if (button) button.disabled = true;
    return;
  }

  form.classList.remove('hidden');
  notice.classList.add('hidden');
  if (button) button.disabled = false;
}

function setStatus(text, tone = '') {
  const el = $('#donate-status');
  if (!el) return;
  el.textContent = text;
  el.dataset.tone = tone;
  el.classList.toggle('hidden', !text);
}

async function startDonation() {
  if (busy) return;

  if (!pi.signedIn) return toast('Sign in with Pi first.', 'bad');
  if (typeof window.Pi?.createPayment !== 'function') {
    return toast('Payments are only available inside the Pi Browser.', 'bad');
  }

  const value = Number($('#donate-amount')?.value);
  if (!(value >= cfg.min && value <= cfg.max)) {
    return toast(`Enter an amount between ${cfg.min} and ${cfg.max} π.`, 'bad');
  }

  const memo = ($('#donate-memo')?.value || '').trim().slice(0, cfg.memoMaxLength || 50);

  busy = true;
  const button = $('#donate-send');
  if (button) button.disabled = true;

  setStatus('Confirming your Pi session…');
  try {
    await ensureSdkSession();
  } catch (err) {
    return finish(`Pi could not confirm your session: ${err?.message || err}`, 'bad');
  }

  setStatus('Opening your Pi Wallet…');

  window.Pi.createPayment(
    {
      amount: value,

      memo: memo || 'Donation to Internet Speed',
      metadata: { purpose: 'donation', site: location.hostname, message: memo },
    },
    {
      onReadyForServerApproval: async (paymentId) => {
        setStatus('Waiting for the server to approve…');
        try {
          await post('/api/payments/approve', { paymentId });
          setStatus('Approved — confirm the payment in your wallet.');
        } catch (err) {
          finish(`Approval failed: ${err.message}`, 'bad');
        }
      },

      onReadyForServerCompletion: async (paymentId, txid) => {
        setStatus('Transaction submitted — finalising…');
        try {
          const data = await post('/api/payments/complete', { paymentId, txid });
          finish(`Thank you. Your donation of ${fmt(data.amount ?? value)} π is confirmed.`, 'ok');
          toast('Donation confirmed. Thank you.');
          loadRecent();
          offerShare(data.amount ?? value, memo);
        } catch (err) {
          finish(
            `The transaction went through, but the server could not finalise it: ${err.message}. It will settle next time you sign in.`,
            'bad'
          );
        }
      },

      onCancel: (paymentId) => {
        post('/api/payments/cancel', { paymentId }).catch(() => {});
        finish('Payment cancelled.', '');
      },

      onError: (error) => {
        console.error('[donate] payment error:', error);
        finish(`Payment failed: ${error?.message || 'unknown error'}`, 'bad');
      },
    }
  );
}

function offerShare(amount, memo) {
  const host = $('#donate-status');
  if (!host) return;

  const btn = document.createElement('button');
  btn.className = 'btn btn-ghost btn-sm';
  btn.type = 'button';
  btn.style.marginTop = 'var(--s3)';
  btn.textContent = 'Share this';
  btn.addEventListener('click', () => {
    const brand = document.querySelector('[data-brand-name]')?.textContent || 'Internet Speed';
    share({
      title: `I supported ${brand}`,
      message: [
        `I just donated ${fmt(amount)} π to ${brand}.`,
        memo ? `"${memo}"` : null,
        'A free, ad-light speed and latency test for Pioneers:',
        location.origin,
      ].filter(Boolean).join('\n'),
    });
  });

  host.append(document.createElement('br'), btn);
}

function finish(message, tone) {
  busy = false;
  const button = $('#donate-send');
  if (button) button.disabled = false;
  setStatus(message, tone);
}

async function post(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || data.error || `HTTP ${res.status}`);
  return data;
}

export async function settleIncompletePayment(payment) {
  try {
    await post('/api/payments/incomplete', { payment });
    console.info('[donate] settled a previously incomplete payment');
  } catch (err) {
    console.warn('[donate] could not settle incomplete payment:', err.message);
  }
}

async function loadRecent() {
  const host = $('#donate-recent');
  if (!host) return;

  try {
    const data = await (await fetch('/api/payments/recent')).json();
    const totals = $('#donate-totals');
    if (totals) {
      totals.textContent = data.count
        ? `${data.count} donation${data.count === 1 ? '' : 's'} so far, ${fmt(data.total)} π in total.`
        : '';
    }

    if (!data.items?.length) {
      host.innerHTML = '';
      return;
    }

    host.innerHTML =
      '<h4 class="donate-recent-head">Recent supporters</h4>' +
      data.items
        .map(
          (d) => `<div class="capability">
            <span class="cap-name">@${esc(d.username || 'anonymous')}</span>
            <span class="cap-need">${esc(d.memo)}</span>
            <span class="verdict" style="color:var(--ul)">${fmt(d.amount)} π</span>
          </div>`
        )
        .join('');
  } catch {
  }
}
