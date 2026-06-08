const {
  buildRadarUrl,
  formatTextBars,
  probeQuickChart,
  VALUE_KEYS_IN_ORDER,
} = require('../../src/shared/quickchart');

describe('buildRadarUrl', () => {
  const counts = { speed: 3, talent: 1, kind: 8, hightech: 2, creative: 5, clear: 0, lead: 4 };

  test('returns a quickchart.io URL', () => {
    const url = buildRadarUrl({ counts, label: 'Daisy' });
    expect(url.startsWith('https://quickchart.io/chart?')).toBe(true);
  });

  test('contains the encoded chart config in the c= parameter', () => {
    const url = buildRadarUrl({ counts, label: 'Daisy' });
    const parsed = new URL(url);
    const c = parsed.searchParams.get('c');
    expect(c).toBeTruthy();
    const decoded = JSON.parse(c);
    expect(decoded.type).toBe('radar');
    expect(decoded.data.labels).toHaveLength(7);
    expect(decoded.data.datasets[0].data).toHaveLength(7);
  });

  test('data values are in canonical value-key order', () => {
    const url = buildRadarUrl({ counts, label: 'Daisy' });
    const decoded = JSON.parse(new URL(url).searchParams.get('c'));
    const expected = VALUE_KEYS_IN_ORDER.map((k) => counts[k]);
    expect(decoded.data.datasets[0].data).toEqual(expected);
  });

  test('label appears in the dataset', () => {
    const url = buildRadarUrl({ counts, label: 'Daisy' });
    const decoded = JSON.parse(new URL(url).searchParams.get('c'));
    expect(decoded.data.datasets[0].label).toBe('Daisy');
  });

  test('zero-fills missing keys', () => {
    const url = buildRadarUrl({ counts: { kind: 5 }, label: 'X' });
    const decoded = JSON.parse(new URL(url).searchParams.get('c'));
    expect(decoded.data.datasets[0].data).toEqual([0, 0, 5, 0, 0, 0, 0]);
  });

  test('width and height parameters are present', () => {
    const url = buildRadarUrl({ counts, label: 'X' });
    const parsed = new URL(url);
    expect(parsed.searchParams.get('w')).toBeTruthy();
    expect(parsed.searchParams.get('h')).toBeTruthy();
  });
});

describe('formatTextBars', () => {
  test('renders bar lengths proportional to counts, sorted descending', () => {
    const counts = { speed: 5, talent: 1, kind: 8, hightech: 2, creative: 3, clear: 0, lead: 4 };
    const out = formatTextBars(counts);
    const lines = out.split('\n');
    expect(lines[0]).toContain('Kindness');
    expect(lines[0]).toContain('· 8');
    expect(lines[lines.length - 1]).toMatch(/· 0$/);
  });

  test('zero counts render with no bar block but the label and · 0', () => {
    const counts = { speed: 0, talent: 0, kind: 0, hightech: 0, creative: 0, clear: 0, lead: 0 };
    const out = formatTextBars(counts);
    expect(out).toContain('· 0');
    expect(out).not.toMatch(/[█▓▒░🟦]/);
  });

  test('output has exactly 7 lines (one per value)', () => {
    const counts = { speed: 1, talent: 1, kind: 1, hightech: 1, creative: 1, clear: 1, lead: 1 };
    const out = formatTextBars(counts);
    expect(out.split('\n')).toHaveLength(7);
  });

  test('handles missing keys as zero', () => {
    const counts = { speed: 1 };
    const out = formatTextBars(counts);
    expect(out.split('\n')).toHaveLength(7);
    expect(out).toContain('· 0');
    expect(out).toContain('· 1');
  });
});

describe('probeQuickChart', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('returns true when HEAD returns 200 with image content-type', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: (h) => (h.toLowerCase() === 'content-type' ? 'image/png' : null) },
    });
    const ok = await probeQuickChart('https://quickchart.io/chart?c=...');
    expect(ok).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://quickchart.io/chart?c=...',
      expect.objectContaining({ method: 'HEAD' })
    );
  });

  test('returns false on non-2xx response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      headers: { get: () => 'image/png' },
    });
    const ok = await probeQuickChart('https://quickchart.io/chart');
    expect(ok).toBe(false);
  });

  test('returns false on non-image content-type', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'text/html' },
    });
    const ok = await probeQuickChart('https://quickchart.io/chart');
    expect(ok).toBe(false);
  });

  test('returns false when fetch throws (timeout / network error)', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('timeout'));
    const ok = await probeQuickChart('https://quickchart.io/chart');
    expect(ok).toBe(false);
  });

  test('aborts the request after timeoutMs', async () => {
    let aborted = false;
    global.fetch = jest.fn().mockImplementation((_url, init) => {
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          aborted = true;
          reject(new Error('aborted'));
        });
      });
    });
    const ok = await probeQuickChart('https://quickchart.io/chart', { timeoutMs: 10 });
    expect(aborted).toBe(true);
    expect(ok).toBe(false);
  });
});
