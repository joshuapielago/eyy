const { buildEyyyCard, HYPE_HEADERS } = require('../../src/platforms/google-chat/card');

describe('buildEyyyCard', () => {
  const input = {
    senderName: 'Maria Santos',
    recipientName: 'Juan Dela Cruz',
    message: 'Shipped the landing page overnight',
    valueKey: 'speed',
    gifUrl: 'https://media.giphy.com/test.gif',
  };

  test('returns a cardsV2 response', () => {
    const result = buildEyyyCard(input);
    expect(result.cardsV2).toBeDefined();
    expect(result.cardsV2).toHaveLength(1);
    expect(result.cardsV2[0].card).toBeDefined();
  });

  test('card header contains a hype message', () => {
    const result = buildEyyyCard(input);
    const title = result.cardsV2[0].card.header.title;
    expect(HYPE_HEADERS.some(h => title === h)).toBe(true);
  });

  test('card body contains sender and recipient names', () => {
    const result = buildEyyyCard(input);
    const sections = result.cardsV2[0].card.sections;
    const bodyText = JSON.stringify(sections);
    expect(bodyText).toContain('Maria Santos');
    expect(bodyText).toContain('Juan Dela Cruz');
  });

  test('card body contains the message', () => {
    const result = buildEyyyCard(input);
    const bodyText = JSON.stringify(result.cardsV2[0].card.sections);
    expect(bodyText).toContain('Shipped the landing page overnight');
  });

  test('card body contains the value name and tagline', () => {
    const result = buildEyyyCard(input);
    const bodyText = JSON.stringify(result.cardsV2[0].card.sections);
    expect(bodyText).toContain('Speed Is Our Advantage');
    expect(bodyText).toContain('Move fast, win first');
  });

  test('card contains the gif image', () => {
    const result = buildEyyyCard(input);
    const bodyText = JSON.stringify(result.cardsV2[0].card.sections);
    expect(bodyText).toContain('https://media.giphy.com/test.gif');
  });

  test('card works without gif (graceful fallback)', () => {
    const result = buildEyyyCard({ ...input, gifUrl: null });
    expect(result.cardsV2).toBeDefined();
    // Should not contain an image widget when no gif
    const bodyText = JSON.stringify(result.cardsV2[0].card.sections);
    expect(bodyText).not.toContain('imageUrl');
  });

  test('text field includes attribution with gave an eyyy', () => {
    const result = buildEyyyCard(input);
    expect(result.text).toContain('gave an eyyy to');
  });
});
