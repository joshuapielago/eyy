const { GiphyFetch } = require('@giphy/js-fetch-api');

async function fetchRandomGif(searchTerm) {
  try {
    const gf = new GiphyFetch(process.env.GIPHY_API_KEY);
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
