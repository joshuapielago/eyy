// Built-in default value set — a neutral starter shown when an operator has not
// supplied their own eyy.config.json. Operators are expected to replace these
// with their own company values (see eyy.config.example.json + SETUP.md); this
// set exists only so a fresh clone works out of the box.
const VALUES = {
  speed: {
    name: 'Speed',
    emoji: '⚡',
    tagline: 'Move fast and deliver',
    giphyTerms: ['fast and furious', 'speed run', 'lightning speed', 'sonic fast'],
  },
  talent: {
    name: 'Growth',
    emoji: '🌱',
    tagline: 'Always be learning',
    giphyTerms: ['level up', 'rising star', 'growth', 'glow up'],
  },
  kind: {
    name: 'Kindness',
    emoji: '💛',
    tagline: 'Assume good intent, respond with grace',
    giphyTerms: ['group hug', 'kindness', 'wholesome', 'you are awesome'],
  },
  hightech: {
    name: 'Craftsmanship',
    emoji: '🛠️',
    tagline: 'Build it well',
    giphyTerms: ['nailed it', 'master craftsman', 'tech magic', 'perfectly balanced'],
  },
  creative: {
    name: 'Creativity',
    emoji: '🎨',
    tagline: 'Think differently',
    giphyTerms: ['creative genius', 'mind blown', 'lightbulb moment', 'big brain'],
  },
  clear: {
    name: 'Clarity',
    emoji: '🔍',
    tagline: 'Communicate clearly',
    giphyTerms: ['crystal clear', 'mic drop', 'nailed it', 'perfectly balanced'],
  },
  lead: {
    name: 'Ownership',
    emoji: '🦅',
    tagline: 'Own the outcome',
    giphyTerms: ['boss move', 'like a boss', 'leadership', 'own it'],
  },
};

function getValueByKey(key) {
  return VALUES[key];
}

function getRandomGiphyTerm(key) {
  const value = VALUES[key];
  if (!value) return null;
  const terms = value.giphyTerms;
  return terms[Math.floor(Math.random() * terms.length)];
}

module.exports = { VALUES, getValueByKey, getRandomGiphyTerm };
