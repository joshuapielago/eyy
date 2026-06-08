// Proves an operator's eyy.config.json flows all the way through the UI:
// the value picker, the posted cards, the leaderboard chart, and stats.
jest.mock('../src/shared/db', () => ({ pool: { query: jest.fn() } }));

const path = require('path');
const { pool } = require('../src/shared/db');
const { _resetConfigCacheForTests } = require('../src/shared/config');
const { buildEyyyModal, BLOCK_VALUE } = require('../src/platforms/slack/modal');
const { buildRenderActionsDialog } = require('../src/platforms/google-chat/dialog');
const { buildEyyyBlocks } = require('../src/platforms/slack/message');
const { buildEyyyCard } = require('../src/platforms/google-chat/card');
const { buildRadarUrl } = require('../src/shared/quickchart');
const { getReceivedStats } = require('../src/shared/stats');

const EXAMPLE = path.join(__dirname, '..', 'eyy.config.example.json');

describe('operator config flows through the whole app (self-host)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.EYY_CONFIG_PATH = EXAMPLE;
    _resetConfigCacheForTests();
  });
  afterEach(() => {
    delete process.env.EYY_CONFIG_PATH;
    _resetConfigCacheForTests();
  });

  test('Slack modal shows the operator-defined value options', () => {
    const view = buildEyyyModal({ channelId: 'C1' });
    const block = view.blocks.find((b) => b.block_id === BLOCK_VALUE);
    const optionValues = block.element.options.map((o) => o.value);
    expect(optionValues).toContain('teamwork');
    expect(optionValues).not.toContain('talent'); // a built-in LOKAL key, not in the example
    expect(block.element.options).toHaveLength(5);
  });

  test('Google Chat dialog shows the operator-defined value options', () => {
    const dialog = buildRenderActionsDialog({ submitUrl: 'https://x/google-chat' });
    const text = JSON.stringify(dialog);
    expect(text).toContain('Team Player');
    expect(text).not.toContain('Speed Is Our Advantage');
  });

  test('Slack kudos card renders an operator-defined value', () => {
    const { blocks } = buildEyyyBlocks({
      senderName: 'A',
      recipients: [{ id: 'U2', name: 'B' }],
      message: 'm',
      valueKey: 'teamwork',
      gifUrl: null,
    });
    const text = JSON.stringify(blocks);
    expect(text).toContain('Team Player');
    expect(text).toContain('We win together');
  });

  test('Google Chat card renders an operator-defined value', () => {
    const card = buildEyyyCard({
      senderName: 'A',
      recipients: [{ id: 'users/2', name: 'B' }],
      message: 'm',
      valueKey: 'ownership',
      gifUrl: null,
    });
    expect(JSON.stringify(card)).toContain('Takes Ownership');
  });

  test('radar chart uses the operator value set (5 axes, not 7)', () => {
    const url = buildRadarUrl({ counts: { teamwork: 2 }, label: 'X' });
    const decoded = JSON.parse(new URL(url).searchParams.get('c'));
    expect(decoded.data.labels).toHaveLength(5);
    expect(decoded.data.datasets[0].data).toHaveLength(5);
  });

  test('getReceivedStats zero-fills the operator value keys', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const res = await getReceivedStats('me@x.com');
    expect(Object.keys(res.counts)).toContain('teamwork');
    expect(Object.keys(res.counts)).not.toContain('talent');
  });
});
