jest.mock('../../src/shared/db', () => ({
  saveKudos: jest.fn().mockResolvedValue({ id: 1 }),
  initDb: jest.fn().mockResolvedValue(),
  pool: { end: jest.fn() },
}));
jest.mock('../../src/shared/giphy', () => ({
  fetchRandomGif: jest.fn().mockResolvedValue('https://giphy.com/x.gif'),
}));

const mockViewsOpen = jest.fn().mockResolvedValue({ ok: true });
const mockChatPostMessage = jest.fn().mockResolvedValue({ ok: true });
const mockUsersInfo = jest.fn();

jest.mock('../../src/platforms/slack/client', () => ({
  getSlackClient: () => ({
    views: { open: mockViewsOpen },
    chat: { postMessage: mockChatPostMessage },
    users: { info: mockUsersInfo },
  }),
}));

const {
  handleSlashCommand,
  handleViewSubmission,
  parsePrefilledUser,
} = require('../../src/platforms/slack/handler');
const { saveKudos } = require('../../src/shared/db');
const { CALLBACK_ID } = require('../../src/platforms/slack/modal');

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

describe('handleSlashCommand', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('opens the modal with prefilled user and channel metadata', async () => {
    await handleSlashCommand({
      trigger_id: 'TRIG',
      channel_id: 'C1',
      text: '<@U12345|alice> hyped',
    });
    expect(mockViewsOpen).toHaveBeenCalledTimes(1);
    const call = mockViewsOpen.mock.calls[0][0];
    expect(call.trigger_id).toBe('TRIG');
    expect(call.view.callback_id).toBe(CALLBACK_ID);
    expect(call.view.private_metadata).toBe(JSON.stringify({ channelId: 'C1' }));
    const recipientBlock = call.view.blocks.find((b) => b.block_id === 'recipient_block');
    expect(recipientBlock.element.initial_user).toBe('U12345');
  });
});

describe('handleViewSubmission', () => {
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
  });

  test('records the kudos and acks the modal close', async () => {
    const payload = {
      type: 'view_submission',
      user: { id: 'USENDER' },
      view: {
        callback_id: CALLBACK_ID,
        private_metadata: JSON.stringify({ channelId: 'C42' }),
        state: {
          values: {
            recipient_block: { recipient_action: { selected_user: 'URECIP' } },
            message_block: { message_action: { value: 'great work' } },
            value_block: { value_action: { selected_option: { value: 'kind' } } },
          },
        },
      },
    };

    const ack = await handleViewSubmission(payload);
    expect(ack).toEqual({ response_action: 'clear' });
    // Drain the deferred postMessage so it doesn't leak into the next test.
    await new Promise((r) => setImmediate(r));

    expect(saveKudos).toHaveBeenCalledWith(expect.objectContaining({
      platform: 'slack',
      senderEmail: 'USENDER@x.com',
      senderName: 'Real USENDER',
      recipientEmail: 'URECIP@x.com',
      recipientName: 'Real URECIP',
      recipientUserId: 'URECIP',
      message: 'great work',
      valueKey: 'kind',
      spaceName: 'C42',
    }));
  });

  test('posts the message to the invoking channel after ack (deferred)', async () => {
    const payload = {
      type: 'view_submission',
      user: { id: 'USENDER' },
      view: {
        callback_id: CALLBACK_ID,
        private_metadata: JSON.stringify({ channelId: 'C42' }),
        state: {
          values: {
            recipient_block: { recipient_action: { selected_user: 'URECIP' } },
            message_block: { message_action: { value: 'great work' } },
            value_block: { value_action: { selected_option: { value: 'kind' } } },
          },
        },
      },
    };

    await handleViewSubmission(payload);
    // setImmediate defers the post; flush the queue.
    await new Promise((r) => setImmediate(r));
    expect(mockChatPostMessage).toHaveBeenCalledTimes(1);
    const args = mockChatPostMessage.mock.calls[0][0];
    expect(args.channel).toBe('C42');
    expect(args.blocks).toBeDefined();
  });
});
