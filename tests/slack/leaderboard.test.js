const { buildLeaderboard, buildEmptyLeaderboardEphemeral } = require('../../src/platforms/slack/leaderboard');

const sampleCounts = { speed: 3, talent: 1, kind: 8, hightech: 2, creative: 5, clear: 0, lead: 4 };
const sampleVerbatims = [
  {
    sender_name: 'Alice',
    message: 'great demo',
    value_key: 'creative',
    value_name: 'Radically Creative',
    value_emoji: '🎨',
    platform: 'slack',
    created_at: new Date(),
  },
  {
    sender_name: 'Bob',
    message: 'shipped fast',
    value_key: 'speed',
    value_name: 'Speed Is Our Advantage',
    value_emoji: '⚡',
    platform: 'google-chat',
    created_at: new Date(),
  },
];

describe('buildLeaderboard', () => {
  test('embeds an image block when QuickChart probe succeeds', async () => {
    const probe = jest.fn().mockResolvedValue(true);
    const out = await buildLeaderboard({
      senderName: 'Daisy',
      counts: sampleCounts,
      total: 23,
      verbatims: sampleVerbatims,
      probe,
    });
    const image = out.blocks.find((b) => b.type === 'image');
    expect(image).toBeDefined();
    expect(image.image_url).toMatch(/^https:\/\/quickchart\.io\/chart\?/);
    expect(probe).toHaveBeenCalledTimes(1);
  });

  test('uses text-bar fallback when probe returns false', async () => {
    const probe = jest.fn().mockResolvedValue(false);
    const out = await buildLeaderboard({
      senderName: 'Daisy',
      counts: sampleCounts,
      total: 23,
      verbatims: sampleVerbatims,
      probe,
    });
    expect(out.blocks.find((b) => b.type === 'image')).toBeUndefined();
    const codeBlock = out.blocks.find(
      (b) => b.type === 'section' && b.text?.text?.startsWith('```')
    );
    expect(codeBlock).toBeDefined();
    expect(codeBlock.text.text).toContain('Kind by Default');
  });

  test('includes a header with the sender name and total in context', async () => {
    const probe = jest.fn().mockResolvedValue(true);
    const out = await buildLeaderboard({
      senderName: 'Daisy',
      counts: sampleCounts,
      total: 23,
      verbatims: [],
      probe,
    });
    const header = out.blocks.find((b) => b.type === 'header');
    expect(header.text.text).toContain('Daisy');
    const ctx = out.blocks.find((b) => b.type === 'context');
    expect(ctx.elements[0].text).toContain('23');
  });

  test('uses singular "eyy" when total is 1', async () => {
    const probe = jest.fn().mockResolvedValue(true);
    const out = await buildLeaderboard({
      senderName: 'Daisy',
      counts: { ...sampleCounts, kind: 1, speed: 0, talent: 0, hightech: 0, creative: 0, clear: 0, lead: 0 },
      total: 1,
      verbatims: [],
      probe,
    });
    const ctx = out.blocks.find((b) => b.type === 'context');
    expect(ctx.elements[0].text).toMatch(/received \*1\* eyy /);
  });

  test('renders verbatims as context blocks with quote and sender', async () => {
    const probe = jest.fn().mockResolvedValue(true);
    const out = await buildLeaderboard({
      senderName: 'Daisy',
      counts: sampleCounts,
      total: 23,
      verbatims: sampleVerbatims,
      probe,
    });
    const ctxBlocks = out.blocks.filter((b) => b.type === 'context');
    // First context = total summary; rest = verbatims
    const verbatimCtx = ctxBlocks.slice(1);
    expect(verbatimCtx).toHaveLength(2);
    expect(verbatimCtx[0].elements[0].text).toContain('great demo');
    expect(verbatimCtx[0].elements[0].text).toContain('Alice');
    expect(verbatimCtx[1].elements[0].text).toContain('shipped fast');
  });

  test('omits verbatims section when verbatims is empty', async () => {
    const probe = jest.fn().mockResolvedValue(true);
    const out = await buildLeaderboard({
      senderName: 'Daisy',
      counts: sampleCounts,
      total: 23,
      verbatims: [],
      probe,
    });
    expect(out.blocks.find((b) => b.text?.text === '*Recent eyys you\'ve received*')).toBeUndefined();
  });

  test('includes a fallback text for screen readers / unfurled previews', async () => {
    const probe = jest.fn().mockResolvedValue(true);
    const out = await buildLeaderboard({
      senderName: 'Daisy',
      counts: sampleCounts,
      total: 23,
      verbatims: [],
      probe,
    });
    expect(out.text).toContain('Daisy');
    expect(out.text).toContain('23');
  });
});

describe('buildEmptyLeaderboardEphemeral', () => {
  test('returns an ephemeral response with friendly text', () => {
    const out = buildEmptyLeaderboardEphemeral('Daisy');
    expect(out.response_type).toBe('ephemeral');
    expect(out.text).toContain('Daisy');
    expect(out.text).toMatch(/keep being awesome/i);
  });

  test('handles missing name gracefully', () => {
    const out = buildEmptyLeaderboardEphemeral();
    expect(out.response_type).toBe('ephemeral');
    expect(out.text).toMatch(/keep being awesome/i);
  });
});
