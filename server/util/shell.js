import site, { publicConfig } from '../../config/site.config.js';
import { esc } from './markup.js';

const NAV = [
  { href: '/', label: 'Home', id: 'home' },
  { href: '/latency', label: 'Latency', id: 'latency' },
  { href: '/stats', label: 'Statistics', id: 'stats' },
  { href: '/guide', label: 'Guide', id: 'guide' },
  { href: '/news', label: 'News', id: 'news' },
  { href: '/about', label: 'About', id: 'about' },
];

export function shell({ title, description, main, active = '' }) {
  const cfg = publicConfig();
  const alt = cfg.network;

  return `<!doctype html>
<html lang="en" dir="ltr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#05070d">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="color-scheme" content="dark light">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<script src="https://sdk.minepi.com/pi-sdk.js"></script>
<link rel="stylesheet" href="/css/tokens.css">
<link rel="stylesheet" href="/css/main.css">
<link rel="stylesheet" href="/css/motion.css">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="manifest" href="/manifest.webmanifest">
<script type="module" src="/js/page.js"></script>
</head>
<body>
<a class="skip" href="#main">Skip to the content</a>

<header class="site-header" id="header">
  <span class="scroll-progress" id="scroll-progress" aria-hidden="true"></span>
  <div class="wrap header-inner">
    <a class="brand" href="/">
      <svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
        <circle cx="16" cy="16" r="14" fill="none" stroke="var(--line-strong)" stroke-width="1.5"/>
        <path d="M5 20 L11 20 L14 11 L18 25 L21 16 L27 16" fill="none" stroke="var(--dl)"
              stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
        <circle class="pulse" cx="27" cy="16" r="3" fill="var(--dl)" opacity="0.35"/>
      </svg>
      <span><span data-brand-name>${esc(site.brand.name)}</span><span class="brand-sub">Speed &amp; latency</span></span>
    </a>

    <nav class="nav" id="nav" aria-label="Main menu">
      <div class="nav-links">
        ${NAV.map(
          (item) =>
            `<a href="${item.href}"${item.id === active ? ' aria-current="page"' : ''}>${esc(item.label)}</a>`
        ).join('\n        ')}
      </div>
      <div class="drawer-extra">
        <div class="drawer-section">
          <span class="drawer-label">Appearance</span>
          <div class="theme-grid" id="theme-grid"></div>
        </div>
        ${
          alt.altUrl
            ? `<div class="drawer-section">
                 <a class="btn btn-ghost" href="${esc(alt.altUrl)}" target="_blank" rel="noopener noreferrer">
                   <span class="pi-glyph" aria-hidden="true">π</span> ${esc(alt.altLabel)}
                 </a>
               </div>`
            : ''
        }
      </div>
    </nav>

    <div class="header-tools">
      <div class="theme-menu-wrap">
        <button class="icon-btn theme-trigger" id="theme-toggle" type="button"
                aria-label="Change theme" aria-haspopup="true" aria-expanded="false"
                aria-controls="theme-menu">
          <span class="trigger-swatch" id="trigger-swatch" aria-hidden="true"></span>
        </button>
        <div class="theme-menu" id="theme-menu" role="menu" aria-label="Theme" data-open="false"></div>
      </div>
      <button class="icon-btn burger" id="burger" type="button"
              aria-label="Open menu" aria-expanded="false" aria-controls="nav">
        <span class="burger-lines" aria-hidden="true"><i></i><i></i><i></i></span>
      </button>
    </div>
  </div>
</header>

<main class="wrap section" id="main">
${main}
</main>

<footer class="site-footer">
  <div class="wrap">
    <div class="footer-grid">
      <div>
        <h4>Measure</h4>
        <ul>
          <li><a href="/">Speed test</a></li>
          <li><a href="/latency">Latency test</a></li>
          <li><a href="/stats">Statistics</a></li>
        </ul>
      </div>
      <div>
        <h4>Learn</h4>
        <ul>
          <li><a href="/guide">Guide and FAQ</a></li>
          <li><a href="/requirements">Speed requirements</a></li>
          <li><a href="/news">News</a></li>
        </ul>
      </div>
      <div>
        <h4>Legal</h4>
        <ul>
          <li><a href="/legal/terms">Terms of Service</a></li>
          <li><a href="/legal/privacy">Privacy Policy</a></li>
        </ul>
      </div>
      <div>
        <h4>More</h4>
        <ul>
          <li><a href="/about">About</a></li>
          ${alt.altUrl ? `<li><a href="${esc(alt.altUrl)}" target="_blank" rel="noopener noreferrer">${esc(alt.altLabel)}</a></li>` : ''}
          <li><a href="/api/health">Service status</a></li>
        </ul>
      </div>
    </div>
    <div class="footer-bottom">
      <span>Speed engine: OpenSpeedTest — open source and free</span>
      <span>We do not store your IP address.</span>
    </div>
  </div>
</footer>

<div class="toasts" id="toasts" aria-live="polite"></div>
</body>
</html>`;
}
