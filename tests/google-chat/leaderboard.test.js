const {
  buildLeaderboardCard,
  buildLeaderboardResponse,
  buildLeaderboardPrivateResponse,
} = require('../../src/platforms/google-chat/leaderboard');

const sampleCounts = { speed: 3, talent: 1, kind: 8, hightech: 2, creative: 5, clear: 0, lead: 4 };
const sampleVerbatims = [
  {
    sender_name: 'Alice',
    message: 'great demo',
    value_key: 'creative',
    value_name: 'Radically Creative',
    value_emoji: '🎨',
    platform: 'slack',
  },
];

describe('buildLeaderboardCard', () => {
  test('produces cardsV2 with header and chart image when probe succeeds', async () => {
    const probe = jest.fn().mockResolvedValue(true);
    const result = await buildLeaderboardCard({
      senderName: 'Daisy',
      counts: sampleCounts,
      total: 23,
      verbatims: sampleVerbatims,
      probe,
    });
    expect(result.cardsV2).toHaveLength(1);
    const widgets = result.cardsV2[0].card.sections[0].widgets;
    const image = widgets.find((w) => w.image);
    expect(image.image.imageUrl).toMatch(/^https:\/\/quickchart\.io\/chart\?/);
  });

  test('falls back to text bars when probe fails', async () => {
    const probe = jest.fn().mockResolvedValue(false);
    const result = await buildLeaderboardCard({
      senderName: 'Daisy',
      counts: sampleCounts,
      total: 23,
      verbatims: [],
      probe,
    });
    const widgets = result.cardsV2[0].card.sections[0].widgets;
    expect(widgets.find((w) => w.image)).toBeUndefined();
    const preWidget = widgets.find((w) => w.textParagraph?.text?.includes('<pre>'));
    expect(preWidget).toBeDefined();
    expect(preWidget.textParagraph.text).toContain('Kind by Default');
  });

  test('header includes sender name', async () => {
    const probe = jest.fn().mockResolvedValue(true);
    const result = await buildLeaderboardCard({
      senderName: 'Daisy',
      counts: sampleCounts,
      total: 23,
      verbatims: [],
      probe,
    });
    expect(result.cardsV2[0].card.header.title).toContain('Daisy');
  });

  test('renders verbatims as text paragraphs', async () => {
    const probe = jest.fn().mockResolvedValue(true);
    const result = await buildLeaderboardCard({
      senderName: 'Daisy',
      counts: sampleCounts,
      total: 23,
      verbatims: sampleVerbatims,
      probe,
    });
    const widgets = result.cardsV2[0].card.sections[0].widgets;
    const verbatimWidget = widgets.find(
      (w) => w.textParagraph?.text?.includes('great demo')
    );
    expect(verbatimWidget).toBeDefined();
    expect(verbatimWidget.textParagraph.text).toContain('Alice');
    expect(verbatimWidget.textParagraph.text).toContain('🎨');
  });

  test('handles empty verbatims (chart only)', async () => {
    const probe = jest.fn().mockResolvedValue(true);
    const result = await buildLeaderboardCard({
      senderName: 'Daisy',
      counts: sampleCounts,
      total: 23,
      verbatims: [],
      probe,
    });
    const widgets = result.cardsV2[0].card.sections[0].widgets;
    expect(widgets.some((w) => w.divider)).toBe(false);
  });

  test('escapes HTML in verbatim message', async () => {
    const probe = jest.fn().mockResolvedValue(true);
    const result = await buildLeaderboardCard({
      senderName: 'Daisy',
      counts: sampleCounts,
      total: 1,
      verbatims: [{ sender_name: '<script>', message: '<x>', value_emoji: '⚡', platform: 'slack' }],
      probe,
    });
    const widgets = result.cardsV2[0].card.sections[0].widgets;
    const verbatim = widgets.find((w) => w.textParagraph?.text?.includes('&lt;'));
    expect(verbatim).toBeDefined();
    expect(verbatim.textParagraph.text).not.toContain('<script>');
  });
});

describe('buildLeaderboardResponse', () => {
  test('wraps a card message in the chat slash-command response shape', () => {
    const msg = { text: 'hi', cardsV2: [] };
    const out = buildLeaderboardResponse({ message: msg });
    expect(out.hostAppDataAction.chatDataAction.createMessageAction.message).toBe(msg);
  });
});

describe('buildLeaderboardPrivateResponse', () => {
  test('returns a private message bound to the viewer', () => {
    const out = buildLeaderboardPrivateResponse({
      text: 'No eyys yet',
      viewerUserId: 'users/123',
    });
    const msg = out.hostAppDataAction.chatDataAction.createMessageAction.message;
    expect(msg.text).toBe('No eyys yet');
    expect(msg.privateMessageViewer).toEqual({ name: 'users/123' });
  });

  test('omits privateMessageViewer when viewerUserId not set', () => {
    const out = buildLeaderboardPrivateResponse({ text: 'no viewer' });
    const msg = out.hostAppDataAction.chatDataAction.createMessageAction.message;
    expect(msg.privateMessageViewer).toBeUndefined();
  });
});
