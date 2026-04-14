const { fetchRandomGif } = require('../src/giphy');

describe('giphy', () => {
  test('fetchRandomGif returns a URL string on success', async () => {
    // Uses the real Giphy API with the SDK key in env
    // If GIPHY_API_KEY is not set, skip
    if (!process.env.GIPHY_API_KEY) {
      console.log('Skipping: GIPHY_API_KEY not set');
      return;
    }
    const url = await fetchRandomGif('celebration');
    expect(typeof url).toBe('string');
    expect(url).toMatch(/^https?:\/\//);
  });

  test('fetchRandomGif returns null on failure', async () => {
    // Temporarily use an invalid key to test failure path
    const origKey = process.env.GIPHY_API_KEY;
    process.env.GIPHY_API_KEY = 'invalid_key_for_test';

    // Re-require to pick up new key — but since module caches, we test the catch
    const { fetchRandomGif: fetchWithBadKey } = require('../src/giphy');
    const url = await fetchWithBadKey('test');
    // Should return null on error, not throw
    expect(url).toBeNull();

    process.env.GIPHY_API_KEY = origKey;
  });
});
