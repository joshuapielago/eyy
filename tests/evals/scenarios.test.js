// Scenario evals — end-to-end behavior tests that pin the user-visible
// contract of each feature. These run the actual platform handlers with
// realistic event payloads and assert on what the user would see.
//
// Each scenario maps to a section of the design spec
// (docs/superpowers/specs/2026-05-07-leaderboard-prefill-multi-recipient-design.md).
// If a future change breaks one of these, we want to know — they encode
// product behavior, not implementation details.

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
    probeQuickChart: jest.fn(),
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

const slackHandler = require('../../src/platforms/slack/handler');
const gchatHandler = require('../../src/platforms/google-chat/handler');
const { saveKudosBatch } = require('../../src/shared/db');
const { getReceivedStats, getRecentVerbatims } = require('../../src/shared/stats');
const { probeQuickChart } = require('../../src/shared/quickchart');
const { CALLBACK_ID } = require('../../src/platforms/slack/modal');

const handleGChatEvent = gchatHandler.handleEventFactory({
  submitUrl: 'https://example.test/google-chat',
});

const standardCounts = {
  speed: 3, talent: 0, kind: 5, hightech: 0, creative: 1, clear: 0, lead: 2,
};
const standardVerbatims = [
  { sender_name: 'Alice', message: 'great demo', value_key: 'creative', value_emoji: '🎨', platform: 'slack' },
  { sender_name: 'Bob', message: 'team player', value_key: 'kind', value_emoji: '💛', platform: 'google-chat' },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockUsersInfo.mockImplementation(({ user }) =>
    Promise.resolve({
      user: {
        name: user.toLowerCase(),
        profile: { real_name: `Real ${user}`, email: `${user}@x.com` },
      },
    })
  );
  global.fetch = jest.fn().mockResolvedValue({ ok: true });
  probeQuickChart.mockResolvedValue(true);
});

afterEach(() => {
  delete global.fetch;
});

// ---------------------------------------------------------------------------
// Scenario 1: Slack invoker types `/eyy @alice` → modal opens with recipient
// pre-filled. Pins the prefill UX described in spec § 5.2.
// ---------------------------------------------------------------------------
describe('SCENARIO: Slack /eyy @user opens modal with recipient prefill', () => {
  test('user mention extracted and shown as initial recipient', async () => {
    await slackHandler.handleSlashCommand({
      trigger_id: 'TRIG',
      channel_id: 'C1',
      user_id: 'U_INVOKER',
      text: '<@UALICE|alice>',
    });

    expect(mockViewsOpen).toHaveBeenCalledTimes(1);
    const view = mockViewsOpen.mock.calls[0][0].view;
    const recipientBlock = view.blocks.find((b) => b.block_id === 'recipient_block');
    expect(recipientBlock.element.initial_users).toEqual(['UALICE']);
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: Slack invoker types `/eyy @alice thanks for the demo` → modal
// opens with both recipient AND message pre-filled. Pins § 5.2.
// ---------------------------------------------------------------------------
describe('SCENARIO: Slack /eyy @user message → recipient AND message prefill', () => {
  test('mention becomes recipient, remaining text becomes message', async () => {
    await slackHandler.handleSlashCommand({
      trigger_id: 'TRIG',
      channel_id: 'C1',
      user_id: 'U_INVOKER',
      text: '<@UALICE|alice> thanks for the demo',
    });

    const view = mockViewsOpen.mock.calls[0][0].view;
    const messageBlock = view.blocks.find((b) => b.block_id === 'message_block');
    expect(messageBlock.element.initial_value).toBe('thanks for the demo');
  });

  test('lenient parser extracts mention from middle of text', async () => {
    await slackHandler.handleSlashCommand({
      trigger_id: 'TRIG',
      channel_id: 'C1',
      user_id: 'U_INVOKER',
      text: 'thanks <@UALICE|alice> for shipping',
    });

    const view = mockViewsOpen.mock.calls[0][0].view;
    const recipientBlock = view.blocks.find((b) => b.block_id === 'recipient_block');
    expect(recipientBlock.element.initial_users).toEqual(['UALICE']);
    const messageBlock = view.blocks.find((b) => b.block_id === 'message_block');
    expect(messageBlock.element.initial_value).toBe('thanks for shipping');
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: Slack multi-recipient submit → N rows + shared group_id.
// Pins § 5.3 and the kudos_group_id contract from § 6.
// ---------------------------------------------------------------------------
describe('SCENARIO: Slack multi-recipient submit creates N rows in one batch', () => {
  test('three recipients → three rows with one shared kudos_group_id', async () => {
    const ack = await slackHandler.handleViewSubmission({
      type: 'view_submission',
      user: { id: 'USENDER' },
      view: {
        callback_id: CALLBACK_ID,
        private_metadata: JSON.stringify({ channelId: 'C42' }),
        state: {
          values: {
            recipient_block: { recipient_action: { selected_users: ['U1', 'U2', 'U3'] } },
            message_block: { message_action: { value: 'incredible team work' } },
            value_block: { value_action: { selected_option: { value: 'kind' } } },
          },
        },
      },
    });

    expect(ack).toEqual({ response_action: 'clear' });
    await new Promise((r) => setImmediate(r));

    expect(saveKudosBatch).toHaveBeenCalledTimes(1);
    const [rows, opts] = saveKudosBatch.mock.calls[0];
    expect(rows).toHaveLength(3);
    expect(opts.kudosGroupId).toMatch(/^[0-9a-f-]{36}$/);
    rows.forEach((r) => {
      expect(r.platform).toBe('slack');
      expect(r.message).toBe('incredible team work');
      expect(r.valueKey).toBe('kind');
    });

    expect(mockChatPostMessage).toHaveBeenCalledTimes(1);
    const post = mockChatPostMessage.mock.calls[0][0];
    expect(post.channel).toBe('C42');
    expect(post.text).toContain('<@U1>');
    expect(post.text).toContain('<@U2>');
    expect(post.text).toContain('<@U3>');
  });

  test('empty recipients rejected with input validation error', async () => {
    const ack = await slackHandler.handleViewSubmission({
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
    });

    expect(ack.response_action).toBe('errors');
    expect(saveKudosBatch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Scenario 4: `/eyy leaderboard` — empty state. Pins § 5.1 and § 9 matrix
// (zero-kudos → ephemeral, no public post).
// ---------------------------------------------------------------------------
describe('SCENARIO: /eyy leaderboard with zero kudos → no public post', () => {
  test('Slack: ephemeral via response_url, no chat.postMessage', async () => {
    getReceivedStats.mockResolvedValue({ counts: emptyCounts(), total: 0 });
    getRecentVerbatims.mockResolvedValue([]);

    await slackHandler.buildAndPostLeaderboard({
      channelId: 'C1',
      userId: 'U_INV',
      responseUrl: 'https://hooks.slack.com/x',
    });

    expect(mockChatPostMessage).not.toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledWith(
      'https://hooks.slack.com/x',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('keep being awesome'),
      })
    );
  });

  test('Google Chat: private message scoped to invoker, no public card', async () => {
    getReceivedStats.mockResolvedValue({ counts: emptyCounts(), total: 0 });
    getRecentVerbatims.mockResolvedValue([]);

    const result = await handleGChatEvent({
      commonEventObject: { hostApp: 'CHAT' },
      chat: {
        user: { displayName: 'Daisy', email: 'd@x.com', name: 'users/D1' },
        appCommandPayload: {
          message: {
            slashCommand: { commandId: 1 },
            argumentText: 'leaderboard',
            annotations: [],
          },
          dialogEventType: 'REQUEST_DIALOG',
        },
      },
    });

    const msg = result.hostAppDataAction.chatDataAction.createMessageAction.message;
    expect(msg.privateMessageViewer).toEqual({ name: 'users/D1' });
    expect(msg.cardsV2).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Scenario 5: `/eyy leaderboard` populated → radar + verbatims. Pins § 5.1,
// § 7 (QuickChart probe → image embed), and the verbatims list shape.
// ---------------------------------------------------------------------------
describe('SCENARIO: /eyy leaderboard with kudos → radar chart + verbatims', () => {
  test('Slack: posts public message with image block + per-verbatim context', async () => {
    getReceivedStats.mockResolvedValue({ counts: standardCounts, total: 11 });
    getRecentVerbatims.mockResolvedValue(standardVerbatims);
    probeQuickChart.mockResolvedValue(true);

    await slackHandler.buildAndPostLeaderboard({
      channelId: 'C1',
      userId: 'U_INV',
      responseUrl: 'https://hooks.slack.com/x',
    });

    expect(mockChatPostMessage).toHaveBeenCalledTimes(1);
    const post = mockChatPostMessage.mock.calls[0][0];

    const image = post.blocks.find((b) => b.type === 'image');
    expect(image).toBeDefined();
    expect(image.image_url).toMatch(/quickchart\.io/);

    const ctxBlocks = post.blocks.filter((b) => b.type === 'context');
    // First context block is the total summary; rest are verbatims.
    expect(ctxBlocks.length).toBe(1 + standardVerbatims.length);
    expect(ctxBlocks[1].elements[0].text).toContain('great demo');
    expect(ctxBlocks[2].elements[0].text).toContain('team player');
  });

  test('Google Chat: returns a public cardsV2 with image widget', async () => {
    getReceivedStats.mockResolvedValue({ counts: standardCounts, total: 11 });
    getRecentVerbatims.mockResolvedValue(standardVerbatims);
    probeQuickChart.mockResolvedValue(true);

    const result = await handleGChatEvent({
      commonEventObject: { hostApp: 'CHAT' },
      chat: {
        user: { displayName: 'Daisy', email: 'd@x.com', name: 'users/D1' },
        appCommandPayload: {
          message: {
            slashCommand: { commandId: 1 },
            argumentText: 'leaderboard',
            annotations: [],
          },
          dialogEventType: 'REQUEST_DIALOG',
        },
      },
    });

    const msg = result.hostAppDataAction.chatDataAction.createMessageAction.message;
    expect(msg.privateMessageViewer).toBeUndefined();
    const widgets = msg.cardsV2[0].card.sections[0].widgets;
    const image = widgets.find((w) => w.image);
    expect(image.image.imageUrl).toMatch(/quickchart\.io/);
  });
});

// ---------------------------------------------------------------------------
// Scenario 6: QuickChart unavailable → text-bar fallback. Pins § 7.
// ---------------------------------------------------------------------------
describe('SCENARIO: QuickChart probe fails → text-bar fallback (no broken image)', () => {
  test('Slack: no image block, text-bar code block instead', async () => {
    getReceivedStats.mockResolvedValue({ counts: standardCounts, total: 11 });
    getRecentVerbatims.mockResolvedValue([]);
    probeQuickChart.mockResolvedValue(false);

    await slackHandler.buildAndPostLeaderboard({
      channelId: 'C1',
      userId: 'U_INV',
      responseUrl: '',
    });

    const post = mockChatPostMessage.mock.calls[0][0];
    expect(post.blocks.find((b) => b.type === 'image')).toBeUndefined();
    const codeBlock = post.blocks.find(
      (b) => b.type === 'section' && b.text?.text?.startsWith('```')
    );
    expect(codeBlock).toBeDefined();
    expect(codeBlock.text.text).toContain('Kind by Default');
  });

  test('Google Chat: no image widget, <pre> text-bar paragraph instead', async () => {
    getReceivedStats.mockResolvedValue({ counts: standardCounts, total: 11 });
    getRecentVerbatims.mockResolvedValue([]);
    probeQuickChart.mockResolvedValue(false);

    const result = await handleGChatEvent({
      commonEventObject: { hostApp: 'CHAT' },
      chat: {
        user: { displayName: 'Daisy', email: 'd@x.com', name: 'users/D1' },
        appCommandPayload: {
          message: {
            slashCommand: { commandId: 1 },
            argumentText: 'leaderboard',
            annotations: [],
          },
          dialogEventType: 'REQUEST_DIALOG',
        },
      },
    });

    const msg = result.hostAppDataAction.chatDataAction.createMessageAction.message;
    const widgets = msg.cardsV2[0].card.sections[0].widgets;
    expect(widgets.find((w) => w.image)).toBeUndefined();
    const pre = widgets.find((w) => w.textParagraph?.text?.includes('<pre>'));
    expect(pre).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Scenario 7: chat.postMessage fails (not_in_channel) → ephemeral fallback
// to the invoker explaining how to fix. Pins § 9 matrix.
// ---------------------------------------------------------------------------
describe('SCENARIO: leaderboard post fails → invoker gets ephemeral hint', () => {
  test('Slack: response_url ephemeral with /invite hint', async () => {
    getReceivedStats.mockResolvedValue({ counts: standardCounts, total: 11 });
    getRecentVerbatims.mockResolvedValue([]);
    probeQuickChart.mockResolvedValue(true);
    mockChatPostMessage.mockRejectedValueOnce(new Error('not_in_channel'));

    await slackHandler.buildAndPostLeaderboard({
      channelId: 'C1',
      userId: 'U_INV',
      responseUrl: 'https://hooks.slack.com/x',
    });

    const fetchCall = global.fetch.mock.calls.find(
      (c) => c[0] === 'https://hooks.slack.com/x'
    );
    expect(fetchCall).toBeDefined();
    const body = JSON.parse(fetchCall[1].body);
    expect(body.text).toMatch(/invite @EYYY/i);
  });
});

// ---------------------------------------------------------------------------
// Scenario 8: Google Chat multi-recipient submit creates N rows. Pins § 5.4.
// ---------------------------------------------------------------------------
describe('SCENARIO: Google Chat multi-recipient submit', () => {
  test('three <users/N> tokens in form input → three rows in batch', async () => {
    await handleGChatEvent({
      commonEventObject: {
        hostApp: 'CHAT',
        formInputs: {
          recipient: { stringInputs: { value: ['<users/A> <users/B> <users/C>'] } },
          message: { stringInputs: { value: ['team win'] } },
          valueKey: { stringInputs: { value: ['kind'] } },
        },
        parameters: {
          recipientUserIds: 'users/A,users/B,users/C',
          recipientNames: 'Alice,Bob,Carol',
        },
      },
      chat: {
        user: { displayName: 'Manager', email: 'm@x.com' },
        buttonClickedPayload: { message: { space: { name: 'spaces/X' } } },
      },
    });

    expect(saveKudosBatch).toHaveBeenCalledTimes(1);
    const [rows, opts] = saveKudosBatch.mock.calls[0];
    expect(rows).toHaveLength(3);
    expect(opts.kudosGroupId).toMatch(/^[0-9a-f-]{36}$/);
    rows.forEach((r) => expect(r.platform).toBe('google-chat'));
  });
});

// ---------------------------------------------------------------------------
// Scenario 9: `leaderboard share` is NOT a leaderboard. Pins § 8 edge case.
// ---------------------------------------------------------------------------
describe('SCENARIO: "leaderboard share" is treated as kudos text, not subcommand', () => {
  test('Slack: opens modal with the literal text in the message field', async () => {
    await slackHandler.handleSlashCommand({
      trigger_id: 'TRIG',
      channel_id: 'C1',
      user_id: 'U',
      text: 'leaderboard share',
    });

    expect(mockViewsOpen).toHaveBeenCalled();
    const view = mockViewsOpen.mock.calls[0][0].view;
    const messageBlock = view.blocks.find((b) => b.block_id === 'message_block');
    expect(messageBlock.element.initial_value).toBe('leaderboard share');
  });
});

// ---------------------------------------------------------------------------
// Scenario 10: leaderboard query uses correct identity field per platform.
// Pins the email-vs-userId routing in stats.js.
// ---------------------------------------------------------------------------
describe('SCENARIO: leaderboard queries by email (Slack) vs user_id (GChat)', () => {
  test('Slack invoker → query identity uses email', async () => {
    getReceivedStats.mockResolvedValue({ counts: emptyCounts(), total: 0 });
    getRecentVerbatims.mockResolvedValue([]);

    await slackHandler.buildAndPostLeaderboard({
      channelId: 'C',
      userId: 'U_INV',
      responseUrl: 'https://hooks.slack.com/x',
    });

    // Slack invoker.email comes from users.info → 'U_INV@x.com' per the mock.
    expect(getReceivedStats).toHaveBeenCalledWith('U_INV@x.com');
  });

  test('Google Chat invoker → query identity carries both email and userId', async () => {
    getReceivedStats.mockResolvedValue({ counts: emptyCounts(), total: 0 });
    getRecentVerbatims.mockResolvedValue([]);

    await handleGChatEvent({
      commonEventObject: { hostApp: 'CHAT' },
      chat: {
        user: { displayName: 'Daisy', email: 'd@x.com', name: 'users/D1' },
        appCommandPayload: {
          message: {
            slashCommand: { commandId: 1 },
            argumentText: 'leaderboard',
            annotations: [],
          },
          dialogEventType: 'REQUEST_DIALOG',
        },
      },
    });

    expect(getReceivedStats).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'd@x.com', userId: 'users/D1' })
    );
  });
});

function emptyCounts() {
  return { speed: 0, talent: 0, kind: 0, hightech: 0, creative: 0, clear: 0, lead: 0 };
}
