import { $ } from './util.js';
import { initTheme } from './theme.js';

initTheme();

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
}

const bar = $('#scroll-progress');
addEventListener(
  'scroll',
  () => {
    $('#header').dataset.scrolled = String(scrollY > 8);
    if (bar) {
      const max = document.documentElement.scrollHeight - innerHeight;
      bar.style.setProperty('--progress', max > 0 ? (scrollY / max).toFixed(4) : 0);
    }
  },
  { passive: true }
);
