const mockFetchRandomGif = jest.fn();
jest.mock('../../src/shared/giphy', () => ({
  fetchRandomGif: (...args) => mockFetchRandomGif(...args),
}));

const path = require('path');
const {
  DEFAULT_CONFIG,
  resolveConfig,
  listValues,
  getValue,
  resolveGifUrl,
  normalizeConfig,
  loadConfigFile,
  _resetConfigCacheForTests,
} = require('../../src/shared/config');

const EXAMPLE_CONFIG = path.join(__dirname, '..', '..', 'eyy.config.example.json');

describe('tenant config engine', () => {
  beforeEach(() => {
    mockFetchRandomGif.mockReset();
    mockFetchRandomGif.mockResolvedValue('https://giphy.com/x.gif');
  });

  test('DEFAULT_CONFIG exposes the 7 built-in values as an ordered list', () => {
    expect(DEFAULT_CONFIG.values).toHaveLength(7);
    for (const v of DEFAULT_CONFIG.values) {
      expect(typeof v.key).toBe('string');
      expect(v).toHaveProperty('name');
      expect(v).toHaveProperty('emoji');
      expect(v).toHaveProperty('tagline');
      expect(v.gif.mode).toBe('search');
      expect(v.gif.terms.length).toBeGreaterThan(0);
    }
  });

  test('resolveConfig returns a usable config for any tenant id (defaults to built-in today)', () => {
    const cfg = resolveConfig('T-acme');
    expect(cfg.values).toHaveLength(7);
    expect(listValues(cfg)).toBe(cfg.values);
  });

  test('getValue finds a value by key and is undefined for unknown keys', () => {
    expect(getValue(DEFAULT_CONFIG, 'speed').name).toBe('Speed');
    expect(getValue(DEFAULT_CONFIG, 'nope')).toBeUndefined();
  });

  test('resolveGifUrl uses a Giphy search for search-mode values', async () => {
    const url = await resolveGifUrl(DEFAULT_CONFIG, 'speed');
    expect(url).toBe('https://giphy.com/x.gif');
    expect(mockFetchRandomGif).toHaveBeenCalledTimes(1);
  });

  test('resolveGifUrl returns a tenant fixed link for url-mode values WITHOUT calling Giphy', async () => {
    const config = {
      tenantId: 'T-acme',
      values: [
        {
          key: 'speed',
          name: 'Custom',
          emoji: '✨',
          tagline: 'x',
          gif: { mode: 'url', url: 'https://cdn.acme.com/party.gif' },
        },
      ],
      giphy: { apiKey: null, rating: 'pg' },
    };
    const url = await resolveGifUrl(config, 'speed');
    expect(url).toBe('https://cdn.acme.com/party.gif');
    expect(mockFetchRandomGif).not.toHaveBeenCalled();
  });

  test('resolveGifUrl returns null for an unknown value key', async () => {
    expect(await resolveGifUrl(DEFAULT_CONFIG, 'no_such_value')).toBeNull();
    expect(mockFetchRandomGif).not.toHaveBeenCalled();
  });

  test('resolveGifUrl returns null for a url-mode value with no url set', async () => {
    const config = { values: [{ key: 'x', gif: { mode: 'url' } }] };
    expect(await resolveGifUrl(config, 'x')).toBeNull();
  });
});

describe('normalizeConfig (operator-defined values)', () => {
  test('normalizes search-mode and url-mode values and fills defaults', () => {
    const cfg = normalizeConfig({
      values: [
        { key: 'a', name: 'Alpha', gif: { mode: 'search', terms: ['x'] } },
        { key: 'b', name: 'Beta', gif: { mode: 'url', url: 'https://e.com/g.gif' } },
      ],
    });
    expect(cfg.brandName).toBe('EYYY');
    expect(cfg.values).toHaveLength(2);
    expect(cfg.values[0]).toMatchObject({ key: 'a', name: 'Alpha', emoji: '', tagline: '' });
    expect(cfg.values[0].gif).toEqual({ mode: 'search', terms: ['x'] });
    expect(cfg.values[1].gif).toEqual({ mode: 'url', url: 'https://e.com/g.gif' });
  });

  test('treats bare terms as a search GIF and missing gif as no GIF', () => {
    const cfg = normalizeConfig({
      values: [
        { key: 'a', name: 'A', gif: { terms: ['p', 'q'] } },
        { key: 'b', name: 'B' },
      ],
    });
    expect(cfg.values[0].gif).toEqual({ mode: 'search', terms: ['p', 'q'] });
    expect(cfg.values[1].gif).toEqual({ mode: 'search', terms: [] });
  });

  test('throws when values is missing or empty', () => {
    expect(() => normalizeConfig({})).toThrow();
    expect(() => normalizeConfig({ values: [] })).toThrow();
  });

  test('throws when a value lacks key or name', () => {
    expect(() => normalizeConfig({ values: [{ key: 'a' }] })).toThrow(/name/);
    expect(() => normalizeConfig({ values: [{ name: 'A' }] })).toThrow(/key/);
  });

  test('throws on duplicate value keys', () => {
    expect(() =>
      normalizeConfig({ values: [{ key: 'a', name: 'A' }, { key: 'a', name: 'B' }] })
    ).toThrow(/duplicate/i);
  });
});

describe('loadConfigFile + file-driven resolveConfig', () => {
  afterEach(() => {
    delete process.env.EYY_CONFIG_PATH;
    _resetConfigCacheForTests();
  });

  test('the shipped eyy.config.example.json is valid', () => {
    const cfg = loadConfigFile(EXAMPLE_CONFIG);
    expect(cfg.values.length).toBeGreaterThan(0);
    expect(cfg.values.every((v) => v.key && v.name)).toBe(true);
  });

  test('loadConfigFile throws a helpful error for a missing file', () => {
    expect(() => loadConfigFile('/no/such/eyy.config.json')).toThrow(/EYY config/);
  });

  test('resolveConfig loads the operator file when EYY_CONFIG_PATH is set', () => {
    process.env.EYY_CONFIG_PATH = EXAMPLE_CONFIG;
    _resetConfigCacheForTests();
    const cfg = resolveConfig();
    expect(cfg.values.length).toBeGreaterThan(0);
    expect(cfg).not.toBe(DEFAULT_CONFIG);
  });

  test('resolveConfig falls back to the built-in default when no file is configured', () => {
    delete process.env.EYY_CONFIG_PATH;
    _resetConfigCacheForTests();
    expect(resolveConfig()).toBe(DEFAULT_CONFIG);
  });
});
