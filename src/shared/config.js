const fs = require('fs');
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

// --- Operator-defined config (self-host model) --------------------------------
// An operator drops an eyy.config.json next to the app (or points EYY_CONFIG_PATH
// at it) to define THEIR own values + GIFs without editing source. Secrets stay
// in env vars (GIPHY_API_KEY, bot tokens) — never in this file.

function normalizeValueGif(gif) {
  if (gif && typeof gif === 'object') {
    if (gif.mode === 'url' || (gif.url && !gif.terms)) {
      return { mode: 'url', url: gif.url || null };
    }
    const terms = Array.isArray(gif.terms)
      ? gif.terms
      : Array.isArray(gif.giphyTerms)
        ? gif.giphyTerms
        : [];
    return { mode: 'search', terms: [...terms] };
  }
  return { mode: 'search', terms: [] };
}

function normalizeConfig(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('EYY config must be a JSON object');
  }
  if (!Array.isArray(raw.values) || raw.values.length === 0) {
    throw new Error('EYY config must define a non-empty "values" array');
  }

  const seen = new Set();
  const values = raw.values.map((v, i) => {
    if (!v || typeof v !== 'object') throw new Error(`EYY config value #${i} must be an object`);
    if (!v.key) throw new Error(`EYY config value #${i} is missing "key"`);
    if (!v.name) throw new Error(`EYY config value "${v.key}" is missing "name"`);
    if (seen.has(v.key)) throw new Error(`EYY config has a duplicate value key: ${v.key}`);
    seen.add(v.key);
    return {
      key: String(v.key),
      name: String(v.name),
      emoji: v.emoji ? String(v.emoji) : '',
      tagline: v.tagline ? String(v.tagline) : '',
      gif: normalizeValueGif(v.gif),
    };
  });

  return {
    tenantId: 'operator',
    brandName: raw.brandName ? String(raw.brandName) : 'EYYY',
    values,
    giphy: {
      apiKey: process.env.GIPHY_API_KEY || null,
      rating: (raw.giphy && raw.giphy.rating) || 'pg',
    },
  };
}

function loadConfigFile(filePath) {
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    throw new Error(`Failed to load EYY config from ${filePath}: ${err.message}`);
  }
  return normalizeConfig(raw);
}

function loadInlineConfig(jsonString) {
  let raw;
  try {
    raw = JSON.parse(jsonString);
  } catch (err) {
    throw new Error(`Failed to parse EYY config from EYY_CONFIG_JSON: ${err.message}`);
  }
  return normalizeConfig(raw);
}

let cachedFileConfig;
let cachedFilePath;
let cachedInlineConfig;
let cachedInlineRaw;

// Self-host: a single operator config per deployment. Resolution order:
//   1. EYY_CONFIG_JSON  — inline JSON (easiest on PaaS like Railway/Render)
//   2. EYY_CONFIG_PATH  — path to an eyy.config.json file (local/Docker)
//   3. built-in default sample
function resolveConfig(/* tenantId — single-tenant in self-host */) {
  const inline = process.env.EYY_CONFIG_JSON;
  if (inline) {
    if (cachedInlineConfig && cachedInlineRaw === inline) return cachedInlineConfig;
    cachedInlineConfig = loadInlineConfig(inline);
    cachedInlineRaw = inline;
    return cachedInlineConfig;
  }

  const filePath = process.env.EYY_CONFIG_PATH;
  if (!filePath) return DEFAULT_CONFIG;
  if (cachedFileConfig && cachedFilePath === filePath) return cachedFileConfig;
  cachedFileConfig = loadConfigFile(filePath);
  cachedFilePath = filePath;
  return cachedFileConfig;
}

function _resetConfigCacheForTests() {
  cachedFileConfig = undefined;
  cachedFilePath = undefined;
  cachedInlineConfig = undefined;
  cachedInlineRaw = undefined;
}

// Zero-arg convenience accessors for the single operator config (self-host).
// UI builders and stats call these instead of importing the static value list.
function listValueDefs() {
  return resolveConfig().values;
}

function getValueDef(key) {
  return getValue(resolveConfig(), key);
}

function defaultValueKey() {
  const values = resolveConfig().values;
  return (values[0] && values[0].key) || 'speed';
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
  return fetchRandomGif(pickRandom(terms), { rating: config.giphy && config.giphy.rating });
}

module.exports = {
  DEFAULT_CONFIG,
  resolveConfig,
  listValues,
  getValue,
  resolveGifUrl,
  normalizeConfig,
  loadConfigFile,
  listValueDefs,
  getValueDef,
  defaultValueKey,
  _resetConfigCacheForTests,
};
