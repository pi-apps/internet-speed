const H = 240;

export function lineChart(svg, series, labels = [], unit = '') {
  const all = series.flatMap((s) => s.points).filter((n) => Number.isFinite(n));
  if (!all.length) {
    svg.innerHTML = '';
    return false;
  }

  const narrow = (svg.clientWidth || 720) < 480;
  const W = narrow ? 380 : 720;
  const pad = {
    top: 14,
    right: narrow ? 10 : 16,
    bottom: 26,
    left: narrow ? 34 : 44,
  };

  const max = Math.max(...all) * 1.12 || 1;
  const n = Math.max(...series.map((s) => s.points.length));
  const iw = W - pad.left - pad.right;
  const ih = H - pad.top - pad.bottom;
  const x = (i) => pad.left + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (v) => pad.top + ih - (v / max) * ih;

  const fontSize = narrow ? 13 : 11;

  const grid = (narrow ? [0, 0.5, 1] : [0, 0.25, 0.5, 0.75, 1])
    .map((tick) => {
      const gy = pad.top + ih - tick * ih;
      return `<line x1="${pad.left}" y1="${gy}" x2="${W - pad.right}" y2="${gy}"
                stroke="var(--line)" stroke-width="1" />
              <text x="${pad.left - 6}" y="${gy + 4}" text-anchor="end"
                fill="var(--text-3)" font-size="${fontSize}">${Math.round(max * tick)}</text>`;
    })
    .join('');

  const paths = series
    .map((s) => {
      const d = s.points
        .map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1))
        .join(' ');
      const dots = narrow && n > 12
        ? ''
        : s.points
            .map((v, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3" fill="${s.color}" />`)
            .join('');
      return `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2.5"
                stroke-linejoin="round" stroke-linecap="round" />${dots}`;
    })
    .join('');

  const every = Math.ceil(labels.length / (narrow ? 4 : 7)) || 1;
  const ticks = labels
    .map((l, i) =>
      i % every === 0
        ? `<text x="${x(i).toFixed(1)}" y="${H - 7}" text-anchor="middle"
             fill="var(--text-3)" font-size="${fontSize}">${l}</text>`
        : ''
    )
    .join('');

  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `${series.map((s) => s.name).join(' and ')} ${unit}`.trim());
  svg.innerHTML = grid + paths + ticks;
  return true;
}

export function barWidth(value, max) {
  if (!max || !value) return '0%';
  return Math.max(3, Math.round((value / max) * 100)) + '%';
}
