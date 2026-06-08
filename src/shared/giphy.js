const { GiphyFetch } = require('@giphy/js-fetch-api');

const gf = process.env.GIPHY_API_KEY ? new GiphyFetch(process.env.GIPHY_API_KEY) : null;

// A slow Giphy call must never blow the platform ack deadline (Slack: 3s) — and
// for a free public app, an external dependency hanging is a cost/latency risk.
const DEFAULT_TIMEOUT_MS = Number(process.env.GIPHY_TIMEOUT_MS) || 1500;
const TIMEOUT = Symbol('giphy-timeout');

async function fetchRandomGif(searchTerm, { timeoutMs = DEFAULT_TIMEOUT_MS, rating = 'pg' } = {}) {
  if (!gf) return null;
  let timer;
  try {
    const search = gf.search(searchTerm, { limit: 25, rating });
    const result = await Promise.race([
      search,
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(TIMEOUT), timeoutMs);
      }),
    ]);

    if (result === TIMEOUT) {
      console.error(`Giphy fetch timed out after ${timeoutMs}ms`);
      // Swallow a late rejection from the abandoned search so it can't surface
      // as an unhandled promise rejection.
      Promise.resolve(search).catch(() => {});
      return null;
    }

    const { data } = result;
    if (data.length === 0) return null;
    const randomIndex = Math.floor(Math.random() * data.length);
    return data[randomIndex].images.fixed_height.url;
  } catch (err) {
    console.error('Giphy fetch failed:', err.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { fetchRandomGif };
