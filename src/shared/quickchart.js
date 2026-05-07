const { VALUES } = require('./values');

const QUICKCHART_BASE = 'https://quickchart.io/chart';
const VALUE_KEYS_IN_ORDER = ['speed', 'talent', 'kind', 'hightech', 'creative', 'clear', 'lead'];
const DEFAULT_WIDTH = 500;
const DEFAULT_HEIGHT = 500;
const DEFAULT_TIMEOUT_MS = 1500;

const BAR_BLOCK = '🟦';
const MAX_BAR_BLOCKS = 10;

function buildRadarUrl({ counts, label = '' }) {
  const data = VALUE_KEYS_IN_ORDER.map((k) => Number(counts?.[k]) || 0);
  const labels = VALUE_KEYS_IN_ORDER.map((k) => VALUES[k]?.name?.split(/[\s,]/)[0] || k);

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
  const rows = VALUE_KEYS_IN_ORDER.map((k) => ({
    key: k,
    name: VALUES[k]?.name || k,
    n: Number(counts?.[k]) || 0,
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
