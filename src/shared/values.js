const VALUES = {
  speed: {
    name: 'Speed Is Our Advantage',
    emoji: '⚡',
    tagline: 'Move fast, win first',
    giphyTerms: ['fast and furious', 'speed run', 'sonic fast', 'lightning speed'],
  },
  talent: {
    name: 'Talent Everywhere',
    emoji: '💎',
    tagline: 'Great people come from unexpected places',
    giphyTerms: ['hidden gem', 'diamond in the rough', 'rising star', 'underdog wins'],
  },
  kind: {
    name: 'Kind by Default',
    emoji: '💛',
    tagline: 'Assume good intent, respond with grace',
    giphyTerms: ['group hug', 'kindness', 'wholesome', 'you are awesome'],
  },
  hightech: {
    name: 'High Tech, High Touch',
    emoji: '🤖',
    tagline: 'AI for efficiency, humans for excellence',
    giphyTerms: ['futuristic', 'high five robot', 'tech magic', 'vip treatment'],
  },
  creative: {
    name: 'Radically Creative',
    emoji: '🎨',
    tagline: 'Constraints spark our best ideas',
    giphyTerms: ['creative genius', 'mind blown', 'lightbulb moment', 'big brain'],
  },
  clear: {
    name: 'Clear as Day',
    emoji: '🔍',
    tagline: "If it's not clear, it's not done",
    giphyTerms: ['crystal clear', 'mic drop', 'nailed it', 'perfectly balanced'],
  },
  lead: {
    name: 'Lead It, Own It',
    emoji: '👑',
    tagline: 'Lead from your seat, own your impact',
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
