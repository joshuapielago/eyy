const mockFetchRandomGif = jest.fn();
jest.mock('../../src/shared/giphy', () => ({
  fetchRandomGif: (...args) => mockFetchRandomGif(...args),
}));

const {
  DEFAULT_CONFIG,
  resolveConfig,
  listValues,
  getValue,
  resolveGifUrl,
} = require('../../src/shared/config');

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
    expect(getValue(DEFAULT_CONFIG, 'speed').name).toBe('Speed Is Our Advantage');
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
