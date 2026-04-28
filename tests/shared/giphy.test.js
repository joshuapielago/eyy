const mockSearch = jest.fn();

jest.mock('@giphy/js-fetch-api', () => ({
  GiphyFetch: jest.fn(() => ({ search: mockSearch })),
}));

describe('giphy', () => {
  const origKey = process.env.GIPHY_API_KEY;

  beforeEach(() => {
    jest.resetModules();
    mockSearch.mockReset();
    process.env.GIPHY_API_KEY = 'test-key';
  });

  afterAll(() => {
    if (origKey) {
      process.env.GIPHY_API_KEY = origKey;
    } else {
      delete process.env.GIPHY_API_KEY;
    }
  });

  test('fetchRandomGif returns a URL string on success', async () => {
    mockSearch.mockResolvedValue({
      data: [
        { images: { fixed_height: { url: 'https://giphy.com/test.gif' } } },
        { images: { fixed_height: { url: 'https://giphy.com/test2.gif' } } },
      ],
    });

    const { fetchRandomGif } = require('../../src/shared/giphy');
    const url = await fetchRandomGif('celebration');
    expect(typeof url).toBe('string');
    expect(url).toMatch(/^https:\/\/giphy\.com/);
    expect(mockSearch).toHaveBeenCalledWith('celebration', { limit: 25, rating: 'pg' });
  });

  test('fetchRandomGif returns null when search returns empty results', async () => {
    mockSearch.mockResolvedValue({ data: [] });

    const { fetchRandomGif } = require('../../src/shared/giphy');
    const url = await fetchRandomGif('nothing');
    expect(url).toBeNull();
  });

  test('fetchRandomGif returns null on API error', async () => {
    mockSearch.mockRejectedValue(new Error('API error'));

    const { fetchRandomGif } = require('../../src/shared/giphy');
    const url = await fetchRandomGif('test');
    expect(url).toBeNull();
  });

  test('fetchRandomGif returns null when GIPHY_API_KEY is not set', async () => {
    delete process.env.GIPHY_API_KEY;

    const { fetchRandomGif } = require('../../src/shared/giphy');
    const url = await fetchRandomGif('test');
    expect(url).toBeNull();
  });
});
