jest.mock('../../src/shared/db', () => ({
  saveKudos: jest.fn().mockResolvedValue({ id: 1 }),
  saveKudosBatch: jest.fn().mockResolvedValue([{ id: 1 }]),
  initDb: jest.fn().mockResolvedValue(),
  pool: { end: jest.fn(), query: jest.fn() },
}));
jest.mock('../../src/shared/giphy', () => ({
  fetchRandomGif: jest.fn().mockResolvedValue('https://giphy.com/x.gif'),
}));
jest.mock('../../src/shared/stats', () => ({
  getReceivedStats: jest.fn(),
  getRecentVerbatims: jest.fn(),
}));
jest.mock('../../src/shared/quickchart', () => {
  const actual = jest.requireActual('../../src/shared/quickchart');
  return {
    ...actual,
    probeQuickChart: jest.fn().mockResolvedValue(true),
  };
});

const mockViewsOpen = jest.fn().mockResolvedValue({ ok: true });
const mockChatPostMessage = jest.fn().mockResolvedValue({ ok: true });
const mockChatPostEphemeral = jest.fn().mockResolvedValue({ ok: true });
const mockUsersInfo = jest.fn();

jest.mock('../../src/platforms/slack/client', () => ({
  getSlackClient: () => ({
    views: { open: mockViewsOpen },
    chat: {
      postMessage: mockChatPostMessage,
      postEphemeral: mockChatPostEphemeral,
    },
    users: { info: mockUsersInfo },
  }),
}));

const {
  handleSlashCommand,
  handleViewSubmission,
  parsePrefilledUser,
  buildAndPostLeaderboard,
} = require('../../src/platforms/slack/handler');
const { saveKudosBatch } = require('../../src/shared/db');
const { CALLBACK_ID } = require('../../src/platforms/slack/modal');
const { getReceivedStats, getRecentVerbatims } = require('../../src/shared/stats');

beforeEach(() => {
  mockUsersInfo.mockImplementation(({ user }) =>
    Promise.resolve({
      user: {
        name: user.toLowerCase(),
        profile: { real_name: `Real ${user}`, email: `${user}@x.com` },
      },
    })
  );
});

describe('parsePrefilledUser', () => {
  test('extracts the user id from a Slack mention token', () => {
    expect(parsePrefilledUser('<@U12345|alice> nice work')).toBe('U12345');
    expect(parsePrefilledUser('<@W98765>')).toBe('W98765');
  });

  test('returns empty string when there is no mention', () => {
    expect(parsePrefilledUser('nice work')).toBe('');
    expect(parsePrefilledUser('')).toBe('');
  });
});

describe('handleSlashCommand — kudos modal flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('opens the modal with prefilled user and channel metadata', async () => {
    await handleSlashCommand({
      trigger_id: 'TRIG',
      channel_id: 'C1',
      user_id: 'U_INVOKER',
      text: '<@U12345|alice> hyped',
    });
    expect(mockViewsOpen).toHaveBeenCalledTimes(1);
    const call = mockViewsOpen.mock.calls[0][0];
    expect(call.trigger_id).toBe('TRIG');
    expect(call.view.callback_id).toBe(CALLBACK_ID);
    expect(call.view.private_metadata).toBe(JSON.stringify({ channelId: 'C1' }));
    const recipientBlock = call.view.blocks.find((b) => b.block_id === 'recipient_block');
    expect(recipientBlock.element.type).toBe('multi_users_select');
    expect(recipientBlock.element.initial_users).toEqual(['U12345']);
    const messageBlock = call.view.blocks.find((b) => b.block_id === 'message_block');
    expect(messageBlock.element.initial_value).toBe('hyped');
  });

  test('opens the modal with no prefill when text is empty', async () => {
    await handleSlashCommand({ trigger_id: 'T', channel_id: 'C', user_id: 'U', text: '' });
    const call = mockViewsOpen.mock.calls[0][0];
    const recipientBlock = call.view.blocks.find((b) => b.block_id === 'recipient_block');
    expect(recipientBlock.element.initial_users).toBeUndefined();
    const messageBlock = call.view.blocks.find((b) => b.block_id === 'message_block');
    expect(messageBlock.element.initial_value).toBeUndefined();
  });
});

describe('handleSlashCommand — leaderboard subcommand routing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('does not open the modal when text is "leaderboard"', async () => {
    getReceivedStats.mockResolvedValue({ counts: emptyCounts(), total: 0 });
    getRecentVerbatims.mockResolvedValue([]);

    await handleSlashCommand({
      trigger_id: 'T',
      channel_id: 'C',
      user_id: 'U_INV',
      text: 'leaderboard',
      response_url: 'https://hooks.slack.com/x',
    });

    expect(mockViewsOpen).not.toHaveBeenCalled();
  });

  test('routes "Leaderboard" (case-insensitive)', async () => {
    getReceivedStats.mockResolvedValue({ counts: emptyCounts(), total: 0 });
    getRecentVerbatims.mockResolvedValue([]);

    await handleSlashCommand({
      trigger_id: 'T',
      channel_id: 'C',
      user_id: 'U_INV',
      text: '  Leaderboard  ',
      response_url: 'https://hooks.slack.com/x',
    });

    expect(mockViewsOpen).not.toHaveBeenCalled();
  });
});

describe('buildAndPostLeaderboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    delete global.fetch;
  });

  test('zero kudos → posts nothing publicly, sends ephemeral', async () => {
    getReceivedStats.mockResolvedValue({ counts: emptyCounts(), total: 0 });
    getRecentVerbatims.mockResolvedValue([]);

    await buildAndPostLeaderboard({
      channelId: 'C42',
      userId: 'U_INV',
      responseUrl: 'https://hooks.slack.com/x',
    });

    expect(mockChatPostMessage).not.toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledWith(
      'https://hooks.slack.com/x',
      expect.objectContaining({ method: 'POST' })
    );
  });

  test('with kudos → posts publicly with leaderboard blocks', async () => {
    getReceivedStats.mockResolvedValue({
      counts: { speed: 3, talent: 0, kind: 5, hightech: 0, creative: 1, clear: 0, lead: 2 },
      total: 11,
    });
    getRecentVerbatims.mockResolvedValue([
      { sender_name: 'A', message: 'm', value_key: 'kind', value_emoji: '💛', platform: 'slack' },
    ]);

    await buildAndPostLeaderboard({
      channelId: 'C42',
      userId: 'U_INV',
      responseUrl: 'https://hooks.slack.com/x',
    });

    expect(mockChatPostMessage).toHaveBeenCalledTimes(1);
    const call = mockChatPostMessage.mock.calls[0][0];
    expect(call.channel).toBe('C42');
    expect(call.blocks.find((b) => b.type === 'header')).toBeTruthy();
  });

  test('falls back to ephemeral when chat.postMessage fails', async () => {
    getReceivedStats.mockResolvedValue({
      counts: { speed: 3, talent: 0, kind: 5, hightech: 0, creative: 1, clear: 0, lead: 2 },
      total: 11,
    });
    getRecentVerbatims.mockResolvedValue([]);
    mockChatPostMessage.mockRejectedValueOnce(new Error('not_in_channel'));

    await buildAndPostLeaderboard({
      channelId: 'C42',
      userId: 'U_INV',
      responseUrl: 'https://hooks.slack.com/x',
    });

    expect(global.fetch).toHaveBeenCalled();
    const fetchBody = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(fetchBody.text).toMatch(/invite @EYYY/i);
  });

  test('handles missing email gracefully', async () => {
    mockUsersInfo.mockResolvedValueOnce({ user: { profile: {} } });

    await buildAndPostLeaderboard({
      channelId: 'C42',
      userId: 'U_INV',
      responseUrl: 'https://hooks.slack.com/x',
    });

    expect(mockChatPostMessage).not.toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalled();
  });

  test('stats query failure → "Couldn\'t load" ephemeral, NOT empty-state', async () => {
    // Critical distinction: a DB outage must not look like "you have zero
    // kudos" to the user. If getReceivedStats throws, we error-out clearly.
    getReceivedStats.mockRejectedValue(new Error('connection refused'));
    getRecentVerbatims.mockResolvedValue([]);

    await buildAndPostLeaderboard({
      channelId: 'C42',
      userId: 'U_INV',
      responseUrl: 'https://hooks.slack.com/x',
    });

    expect(mockChatPostMessage).not.toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalled();
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.text).toMatch(/couldn't load your stats/i);
    expect(body.text).not.toMatch(/keep being awesome/i);
  });

  test('verbatims query failure is tolerated (chart still posts)', async () => {
    // Best-effort: missing recent-quotes section is fine, leaderboard
    // can still render a useful chart.
    getReceivedStats.mockResolvedValue({
      counts: { speed: 3, talent: 0, kind: 5, hightech: 0, creative: 1, clear: 0, lead: 2 },
      total: 11,
    });
    getRecentVerbatims.mockRejectedValue(new Error('verbatims blew up'));

    await buildAndPostLeaderboard({
      channelId: 'C42',
      userId: 'U_INV',
      responseUrl: 'https://hooks.slack.com/x',
    });

    expect(mockChatPostMessage).toHaveBeenCalledTimes(1);
    const post = mockChatPostMessage.mock.calls[0][0];
    expect(post.blocks.find((b) => b.type === 'header')).toBeTruthy();
    // No "Recent eyys you've received" section since verbatims was empty.
    expect(post.blocks.some((b) => b.text?.text?.includes("Recent eyys"))).toBe(false);
  });
});

describe('handleViewSubmission — multi-recipient submit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('rejects empty recipient list with input validation', async () => {
    const payload = {
      type: 'view_submission',
      user: { id: 'USENDER' },
      view: {
        callback_id: CALLBACK_ID,
        private_metadata: JSON.stringify({ channelId: 'C42' }),
        state: {
          values: {
            recipient_block: { recipient_action: { selected_users: [] } },
            message_block: { message_action: { value: 'great' } },
            value_block: { value_action: { selected_option: { value: 'kind' } } },
          },
        },
      },
    };

    const ack = await handleViewSubmission(payload);
    expect(ack.response_action).toBe('errors');
    expect(ack.errors.recipient_block).toMatch(/teammate/i);
    expect(saveKudosBatch).not.toHaveBeenCalled();
  });

  test('saves N rows for N recipients with shared group_id', async () => {
    const payload = {
      type: 'view_submission',
      user: { id: 'USENDER' },
      view: {
        callback_id: CALLBACK_ID,
        private_metadata: JSON.stringify({ channelId: 'C42' }),
        state: {
          values: {
            recipient_block: { recipient_action: { selected_users: ['U1', 'U2', 'U3'] } },
            message_block: { message_action: { value: 'team win' } },
            value_block: { value_action: { selected_option: { value: 'kind' } } },
          },
        },
      },
    };

    const ack = await handleViewSubmission(payload);
    expect(ack).toEqual({ response_action: 'clear' });
    await new Promise((r) => setImmediate(r));

    expect(saveKudosBatch).toHaveBeenCalledTimes(1);
    const [rows, opts] = saveKudosBatch.mock.calls[0];
    expect(rows).toHaveLength(3);
    expect(opts.kudosGroupId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
    expect(rows[0].recipientUserId).toBe('U1');
    expect(rows[1].recipientUserId).toBe('U2');
    expect(rows[2].recipientUserId).toBe('U3');
    rows.forEach((r) => {
      expect(r.platform).toBe('slack');
      expect(r.valueKey).toBe('kind');
      expect(r.message).toBe('team win');
      expect(r.spaceName).toBe('C42');
    });
  });

  test('posts a single combined message after acking the modal', async () => {
    const payload = {
      type: 'view_submission',
      user: { id: 'USENDER' },
      view: {
        callback_id: CALLBACK_ID,
        private_metadata: JSON.stringify({ channelId: 'C42' }),
        state: {
          values: {
            recipient_block: { recipient_action: { selected_users: ['U1', 'U2'] } },
            message_block: { message_action: { value: 'team win' } },
            value_block: { value_action: { selected_option: { value: 'kind' } } },
          },
        },
      },
    };

    await handleViewSubmission(payload);
    await new Promise((r) => setImmediate(r));

    expect(mockChatPostMessage).toHaveBeenCalledTimes(1);
    const args = mockChatPostMessage.mock.calls[0][0];
    expect(args.channel).toBe('C42');
    expect(args.text).toContain('<@U1>');
    expect(args.text).toContain('<@U2>');
  });
});

function emptyCounts() {
  return { speed: 0, talent: 0, kind: 0, hightech: 0, creative: 0, clear: 0, lead: 0 };
}
