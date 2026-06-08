const { DEFAULT_CONFIG, listValueDefs } = require('./config');

const QUICKCHART_BASE = 'https://quickchart.io/chart';
// Back-compat export = the built-in default order. Live rendering uses the
// operator's configured value set via listValueDefs().
const VALUE_KEYS_IN_ORDER = DEFAULT_CONFIG.values.map((v) => v.key);
const DEFAULT_WIDTH = 500;
const DEFAULT_HEIGHT = 500;
const DEFAULT_TIMEOUT_MS = 1500;

const BAR_BLOCK = '🟦';
const MAX_BAR_BLOCKS = 10;

function buildRadarUrl({ counts, label = '' }) {
  const defs = listValueDefs();
  const data = defs.map((v) => Number(counts?.[v.key]) || 0);
  const labels = defs.map((v) => v.name?.split(/[\s,]/)[0] || v.key);

  const config = {
    type: 'radar',
    data: {
      labels,
      datasets: [
        {
          label,
          data,
          backgroundColor: 'rgba(255, 165, 0, 0.3)',
          borderColor: 'rgba(255, 165, 0, 1)',
          borderWidth: 2,
          pointBackgroundColor: 'rgba(255, 165, 0, 1)',
        },
      ],
    },
    options: {
      scale: {
        ticks: { beginAtZero: true, stepSize: 1, precision: 0 },
        pointLabels: { fontSize: 14 },
      },
      legend: { display: false },
    },
  };

  const url = new URL(QUICKCHART_BASE);
  url.searchParams.set('c', JSON.stringify(config));
  url.searchParams.set('w', String(DEFAULT_WIDTH));
  url.searchParams.set('h', String(DEFAULT_HEIGHT));
  url.searchParams.set('bkg', 'transparent');
  return url.toString();
}

function formatTextBars(counts) {
  const rows = listValueDefs().map((v) => ({
    key: v.key,
    name: v.name || v.key,
    n: Number(counts?.[v.key]) || 0,
  }));
  rows.sort((a, b) => b.n - a.n);
  return rows
    .map((r) => {
      const blocks = BAR_BLOCK.repeat(Math.min(r.n, MAX_BAR_BLOCKS));
      const padding = blocks ? ' ' : '   ';
      const overflow = r.n > MAX_BAR_BLOCKS ? ` (+${r.n - MAX_BAR_BLOCKS})` : '';
      return `${blocks}${padding}${r.name} · ${r.n}${overflow}`.trimEnd();
    })
    .join('\n');
}

async function probeQuickChart(url, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (typeof fetch !== 'function') return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: 'HEAD', signal: controller.signal });
    if (!res.ok) return false;
    const contentType = res.headers.get('content-type') || '';
    return contentType.toLowerCase().startsWith('image/');
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  buildRadarUrl,
  formatTextBars,
  probeQuickChart,
  VALUE_KEYS_IN_ORDER,
  QUICKCHART_BASE,
};
