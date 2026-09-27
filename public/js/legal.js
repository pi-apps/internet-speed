import { initTheme } from './theme.js';

initTheme();

const nav = document.getElementById('nav');
const burger = document.getElementById('burger');
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
}

const host = document.getElementById('host');
if (host) host.textContent = location.hostname;

const updated = document.getElementById('updated');
if (updated) {
  const date = new Date(document.lastModified);
  updated.textContent = Number.isNaN(date.valueOf())
    ? '—'
    : new Intl.DateTimeFormat('en-GB', { dateStyle: 'long' }).format(date);
}

fetch('/api/config')
  .then((r) => r.json())
  .then((cfg) => {
    document.querySelectorAll('[data-brand-name]').forEach((el) => {
      el.textContent = cfg.brand?.name || 'Internet Speed';
    });
    const mail = document.getElementById('contact-mail');
    if (mail && cfg.brand?.email) {
      mail.href = 'mailto:' + cfg.brand.email;
      mail.textContent = cfg.brand.email;
    }
  })
  .catch(() => {
  });

addEventListener(
  'scroll',
  () => {
    const header = document.getElementById('header');
    if (header) header.dataset.scrolled = String(scrollY > 8);
  },
  { passive: true }
);
