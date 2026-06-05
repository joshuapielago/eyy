const { VALUES } = require('./values');
const { fetchRandomGif } = require('./giphy');

// Per-tenant configuration engine.
//
// This is the single seam through which the app reads a customer's customizable
// settings: their own recognition VALUES and their own GIF behavior (a Giphy
// search, or a fixed "bring your own" link). Today resolveConfig() returns the
// built-in LOKAL defaults for every tenant; the DB-backed per-tenant store will
// plug in here without any consumer needing to change.
// See docs/productization/customization-design.md.

// Each value's GIF can be resolved two ways:
//   { mode: 'search', terms: [...] }  -> pick a random Giphy search term (default)
//   { mode: 'url', url: 'https://...' } -> always send this exact link
function buildDefaultValues() {
  return Object.entries(VALUES).map(([key, v]) => ({
    key,
    name: v.name,
    emoji: v.emoji,
    tagline: v.tagline,
    gif: { mode: 'search', terms: [...v.giphyTerms] },
  }));
}

const DEFAULT_CONFIG = Object.freeze({
  tenantId: 'default',
  brandName: 'EYYY',
  values: buildDefaultValues(),
  giphy: { apiKey: process.env.GIPHY_API_KEY || null, rating: 'pg' },
});

// Seam for per-tenant lookup. Returns the built-in defaults for now.
function resolveConfig(/* tenantId */) {
  return DEFAULT_CONFIG;
}

function listValues(config = DEFAULT_CONFIG) {
  return config.values;
}

function getValue(config, key) {
  if (!config || !Array.isArray(config.values)) return undefined;
  return config.values.find((v) => v.key === key);
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function resolveGifUrl(config, valueKey) {
  const value = getValue(config, valueKey);
  if (!value || !value.gif) return null;

  const { gif } = value;
  if (gif.mode === 'url') {
    return gif.url || null;
  }

  const terms = gif.terms || [];
  if (terms.length === 0) return null;
  return fetchRandomGif(pickRandom(terms));
}

module.exports = {
  DEFAULT_CONFIG,
  resolveConfig,
  listValues,
  getValue,
  resolveGifUrl,
};
