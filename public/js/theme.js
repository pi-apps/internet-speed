import { $, $$ } from './util.js';

const KEY = 'ng-theme';

export const THEMES = [
  { id: 'neon',      name: 'Neon',      bg: '#05070d', swatch: ['#00f5d4', '#ff2e97', '#ffd23f'] },
  { id: 'synthwave', name: 'Synthwave', bg: '#0c0620', swatch: ['#45e0ff', '#ff5cc3', '#ffb648'] },
  { id: 'toxic',     name: 'Toxic',     bg: '#060a06', swatch: ['#a3ff4f', '#00e5ff', '#ffc400'] },
  { id: 'daylight',  name: 'Daylight',  bg: '#eef2f5', swatch: ['#00786a', '#c2185b', '#a8480a'] },
];

const byId = (id) => THEMES.find((t) => t.id === id);

export function initTheme() {
  const saved = localStorage.getItem(KEY);
  const initial = byId(saved)
    ? saved
    : matchMedia('(prefers-color-scheme: light)').matches
      ? 'daylight'
      : 'neon';

  apply(initial, { persist: false });
  buildMenu();
}

function apply(id, { persist = true } = {}) {
  const theme = byId(id) || THEMES[0];
  document.documentElement.dataset.theme = theme.id;
  if (persist) localStorage.setItem(KEY, theme.id);

  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.bg);
  $$('.theme-option').forEach((btn) =>
    btn.setAttribute('aria-checked', String(btn.dataset.theme === theme.id))
  );

  const trigger = $('#trigger-swatch');
  if (trigger) trigger.innerHTML = theme.swatch.map((c) => `<i style="background:${c}"></i>`).join('');
  $('#theme-toggle')?.setAttribute('aria-label', `Theme: ${theme.name}. Change theme`);
  document.dispatchEvent(new CustomEvent('theme:changed', { detail: { theme: theme.id } }));
}

const optionMarkup = (t) => `<button class="theme-option" type="button" role="menuitemradio"
    aria-checked="false" data-theme="${t.id}">
    <span class="theme-swatch" style="--sw-bg:${t.bg}">
      ${t.swatch.map((c) => `<i style="background:${c}"></i>`).join('')}
    </span>
    <span class="theme-name">${t.name}</span>
  </button>`;

function buildMenu() {
  const menu = $('#theme-menu');
  const button = $('#theme-toggle');

  const grid = $('#theme-grid');
  if (grid) grid.innerHTML = THEMES.map(optionMarkup).join('');

  if (!menu || !button) {
    document.addEventListener('click', (e) => {
      const option = e.target.closest('.theme-option');
      if (option) apply(option.dataset.theme);
    });
    return;
  }

  menu.innerHTML = THEMES.map(optionMarkup).join('');

  const close = ({ refocus = false } = {}) => {
    menu.dataset.open = 'false';
    button.setAttribute('aria-expanded', 'false');
    if (refocus) button.focus();
  };
  const open = () => {
    menu.dataset.open = 'true';
    button.setAttribute('aria-expanded', 'true');
    menu.querySelector('[aria-checked="true"]')?.focus();
  };

  button.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.dataset.open === 'true' ? close() : open();
  });

  document.addEventListener('click', onOptionClick);

  document.addEventListener('click', (e) => {
    if (!menu.contains(e.target) && !button.contains(e.target)) close();
  });

  menu.addEventListener('keydown', (e) => {
    const options = [...menu.querySelectorAll('.theme-option')];
    const index = options.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = e.key === 'ArrowDown' ? index + 1 : index - 1;
      options[(next + options.length) % options.length].focus();
    }
    if (e.key === 'Home') { e.preventDefault(); options[0].focus(); }
    if (e.key === 'End') { e.preventDefault(); options.at(-1).focus(); }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menu.dataset.open === 'true') close({ refocus: true });
  });

  function onOptionClick(e) {
    const option = e.target.closest('.theme-option');
    if (!option) return;
    apply(option.dataset.theme);
    close();
  }

  apply(document.documentElement.dataset.theme, { persist: false });
}
