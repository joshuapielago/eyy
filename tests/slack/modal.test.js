const {
  buildEyyyModal,
  readModalSubmission,
  CALLBACK_ID,
  BLOCK_RECIPIENT,
  BLOCK_MESSAGE,
  BLOCK_VALUE,
  ACTION_RECIPIENT,
  ACTION_MESSAGE,
  ACTION_VALUE,
} = require('../../src/platforms/slack/modal');

describe('buildEyyyModal', () => {
  test('produces a modal view with three input blocks and the value options', () => {
    const view = buildEyyyModal({ channelId: 'C1' });
    expect(view.type).toBe('modal');
    expect(view.callback_id).toBe(CALLBACK_ID);
    expect(view.private_metadata).toBe(JSON.stringify({ channelId: 'C1' }));

    const ids = view.blocks.map((b) => b.block_id);
    expect(ids).toEqual([BLOCK_RECIPIENT, BLOCK_MESSAGE, BLOCK_VALUE]);

    const valueBlock = view.blocks.find((b) => b.block_id === BLOCK_VALUE);
    expect(valueBlock.element.options).toHaveLength(7);
  });

  test('sets initial_user when prefilled', () => {
    const view = buildEyyyModal({ channelId: 'C1', prefilledUserId: 'U999' });
    const recipient = view.blocks.find((b) => b.block_id === BLOCK_RECIPIENT);
    expect(recipient.element.initial_user).toBe('U999');
  });

  test('omits initial_user when not prefilled', () => {
    const view = buildEyyyModal({ channelId: 'C1' });
    const recipient = view.blocks.find((b) => b.block_id === BLOCK_RECIPIENT);
    expect(recipient.element.initial_user).toBeUndefined();
  });
});

describe('readModalSubmission', () => {
  test('extracts inputs and channelId', () => {
    const view = {
      private_metadata: JSON.stringify({ channelId: 'C123' }),
      state: {
        values: {
          [BLOCK_RECIPIENT]: { [ACTION_RECIPIENT]: { selected_user: 'U222' } },
          [BLOCK_MESSAGE]: { [ACTION_MESSAGE]: { value: 'Awesome work' } },
          [BLOCK_VALUE]: { [ACTION_VALUE]: { selected_option: { value: 'kind' } } },
        },
      },
    };
    expect(readModalSubmission(view)).toEqual({
      recipientUserId: 'U222',
      message: 'Awesome work',
      valueKey: 'kind',
      channelId: 'C123',
    });
  });

  test('returns empty fields when state is missing', () => {
    expect(readModalSubmission({})).toEqual({
      recipientUserId: '',
      message: '',
      valueKey: '',
      channelId: '',
    });
  });
});
