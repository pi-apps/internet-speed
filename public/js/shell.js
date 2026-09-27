import { $, $$, toast } from './util.js';
import { pi } from './pi.js';

export function initShell() {
  const nav = $('#nav');
  const burger = $('#burger');

  if (nav && burger) {
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
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && nav.dataset.open === 'true') setDrawer(false);
    });
    addEventListener('resize', () => {
      if (innerWidth > 980 && nav.dataset.open === 'true') setDrawer(false);
    });
  }

  const header = $('#header');
  const bar = $('#scroll-progress');
  addEventListener(
    'scroll',
    () => {
      if (header) header.dataset.scrolled = String(scrollY > 8);
      if (bar) {
        const max = document.documentElement.scrollHeight - innerHeight;
        bar.style.setProperty('--progress', max > 0 ? (scrollY / max).toFixed(4) : 0);
      }
    },
    { passive: true }
  );
}

export function applyBrand(cfg) {
  $$('[data-brand-name]').forEach((el) => (el.textContent = cfg.brand?.name || 'Internet Speed'));
  $$('[data-brand-tagline]').forEach((el) => (el.textContent = cfg.brand?.tagline || ''));

  const mail = $('#contact-mail');
  if (mail && cfg.brand?.email) {
    mail.href = 'mailto:' + cfg.brand.email;
    mail.textContent = cfg.brand.email;
  }
  const tg = $('#contact-telegram');
  if (tg && cfg.brand?.telegram) tg.href = cfg.brand.telegram;
}

export function applyNetworkLinks(cfg) {
  const net = cfg.network || {};
  if (!net.altUrl) return;

  $$('[data-network-link]').forEach((el) => {
    el.href = net.altUrl;
    el.target = '_blank';
    el.rel = 'noopener noreferrer';
    el.classList.remove('hidden');
  });
  $$('[data-network-label]').forEach((el) => (el.textContent = net.altLabel));
  $$('[data-network-block]').forEach((el) => {
    const only = el.dataset.networkOnly;
    if (!only || only === net.name) el.classList.remove('hidden');
  });
  $$('[data-network-name]').forEach((el) => (el.textContent = net.altName));

  $$('[data-network-when]').forEach((el) => {
    el.classList.toggle('hidden', el.dataset.networkWhen !== net.name);
  });

  $('#mainnet-banner')?.classList.remove('hidden');
}

export function bindAuthButtons({ signIn, signOut, messageFor }) {
  const paint = () => {
    const label = $('#pi-auth-label');
    if (label) label.textContent = pi.signedIn ? '@' + (pi.username || 'account') : 'Sign in';
    if (!pi.configured) $('#pi-auth')?.classList.add('hidden');
    paintAccountBanner();
  };

  const doSignIn = async () => {
    try {
      const result = await signIn();
      if (result?.redirecting) return;
      paint();
      toast(`Signed in as @${pi.username}.`);
      document.dispatchEvent(new CustomEvent('pi:auth-changed'));
    } catch (err) {
      toast(err.message || messageFor(pi.reason), 'bad', 9000);
    }
  };

  const doSignOut = async () => {
    await signOut();
    paint();
    toast('Signed out.');
    document.dispatchEvent(new CustomEvent('pi:auth-changed'));
  };

  $('#pi-auth')?.addEventListener('click', () => (pi.signedIn ? doSignOut() : doSignIn()));
  $('#account-signin')?.addEventListener('click', doSignIn);
  $('#account-signout')?.addEventListener('click', doSignOut);

  paint();
  document.addEventListener('pi:auth-changed', paint);
}

function paintAccountBanner() {
  const box = $('#account-banner');
  if (!box) return;

  const title = $('#account-title');
  const note = $('#account-note');

  box.dataset.state = pi.signedIn ? 'signed-in' : 'anon';
  if (title) title.textContent = pi.signedIn ? `Signed in as @${pi.username || 'your account'}` : 'Not signed in';
  if (note) {
    note.textContent = pi.signedIn
      ? 'Your history and leaderboard entries follow this account on any device.'
      : 'Results are tied to this browser only. Sign in with Pi to keep them on your account.';
  }
  $('#account-signin')?.classList.toggle('hidden', pi.signedIn);
  $('#account-signout')?.classList.toggle('hidden', !pi.signedIn);
}
