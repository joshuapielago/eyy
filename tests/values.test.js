const { VALUES, getValueByKey, getRandomGiphyTerm } = require('../src/values');

describe('values', () => {
  test('has exactly 7 values', () => {
    expect(Object.keys(VALUES)).toHaveLength(7);
  });

  test('each value has name, emoji, tagline, and giphyTerms', () => {
    for (const [key, val] of Object.entries(VALUES)) {
      expect(val).toHaveProperty('name');
      expect(val).toHaveProperty('emoji');
      expect(val).toHaveProperty('tagline');
      expect(val).toHaveProperty('giphyTerms');
      expect(val.giphyTerms.length).toBeGreaterThan(0);
    }
  });

  test('getValueByKey returns correct value', () => {
    const val = getValueByKey('speed');
    expect(val.name).toBe('Speed Is Our Advantage');
    expect(val.emoji).toBe('⚡');
  });

  test('getValueByKey returns undefined for unknown key', () => {
    expect(getValueByKey('nonexistent')).toBeUndefined();
  });

  test('getRandomGiphyTerm returns a string from the value giphyTerms', () => {
    const term = getRandomGiphyTerm('speed');
    const validTerms = VALUES.speed.giphyTerms;
    expect(validTerms).toContain(term);
  });
});
