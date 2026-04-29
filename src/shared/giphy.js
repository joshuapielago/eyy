const { GiphyFetch } = require('@giphy/js-fetch-api');

const gf = process.env.GIPHY_API_KEY ? new GiphyFetch(process.env.GIPHY_API_KEY) : null;

async function fetchRandomGif(searchTerm) {
  if (!gf) return null;
  try {
    const { data } = await gf.search(searchTerm, { limit: 25, rating: 'pg' });
    if (data.length === 0) return null;
    const randomIndex = Math.floor(Math.random() * data.length);
    return data[randomIndex].images.fixed_height.url;
  } catch (err) {
    console.error('Giphy fetch failed:', err.message);
    return null;
  }
}

module.exports = { fetchRandomGif };
