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
  MAX_RECIPIENTS,
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

  test('uses multi_users_select for the recipient picker with max_selected_items cap', () => {
    const view = buildEyyyModal({ channelId: 'C1' });
    const recipient = view.blocks.find((b) => b.block_id === BLOCK_RECIPIENT);
    expect(recipient.element.type).toBe('multi_users_select');
    expect(recipient.element.max_selected_items).toBe(MAX_RECIPIENTS);
  });

  test('sets initial_users when prefilledUserIds provided', () => {
    const view = buildEyyyModal({ channelId: 'C1', prefilledUserIds: ['U999', 'U888'] });
    const recipient = view.blocks.find((b) => b.block_id === BLOCK_RECIPIENT);
    expect(recipient.element.initial_users).toEqual(['U999', 'U888']);
  });

  test('caps initial_users to MAX_RECIPIENTS', () => {
    const many = Array.from({ length: MAX_RECIPIENTS + 5 }, (_, i) => `U${i}`);
    const view = buildEyyyModal({ channelId: 'C1', prefilledUserIds: many });
    const recipient = view.blocks.find((b) => b.block_id === BLOCK_RECIPIENT);
    expect(recipient.element.initial_users).toHaveLength(MAX_RECIPIENTS);
  });

  test('omits initial_users when not prefilled', () => {
    const view = buildEyyyModal({ channelId: 'C1' });
    const recipient = view.blocks.find((b) => b.block_id === BLOCK_RECIPIENT);
    expect(recipient.element.initial_users).toBeUndefined();
  });

  test('sets initial_value on message input when prefilledMessage provided', () => {
    const view = buildEyyyModal({ channelId: 'C1', prefilledMessage: 'thanks for the demo' });
    const messageBlock = view.blocks.find((b) => b.block_id === BLOCK_MESSAGE);
    expect(messageBlock.element.initial_value).toBe('thanks for the demo');
  });

  test('omits initial_value when no prefilledMessage', () => {
    const view = buildEyyyModal({ channelId: 'C1' });
    const messageBlock = view.blocks.find((b) => b.block_id === BLOCK_MESSAGE);
    expect(messageBlock.element.initial_value).toBeUndefined();
  });
});

describe('readModalSubmission', () => {
  test('extracts multi-recipient ids, message, value, and channelId', () => {
    const view = {
      private_metadata: JSON.stringify({ channelId: 'C123' }),
      state: {
        values: {
          [BLOCK_RECIPIENT]: { [ACTION_RECIPIENT]: { selected_users: ['U222', 'U333'] } },
          [BLOCK_MESSAGE]: { [ACTION_MESSAGE]: { value: 'Awesome work' } },
          [BLOCK_VALUE]: { [ACTION_VALUE]: { selected_option: { value: 'kind' } } },
        },
      },
    };
    expect(readModalSubmission(view)).toEqual({
      recipientUserIds: ['U222', 'U333'],
      message: 'Awesome work',
      valueKey: 'kind',
      channelId: 'C123',
    });
  });

  test('returns empty fields when state is missing', () => {
    expect(readModalSubmission({})).toEqual({
      recipientUserIds: [],
      message: '',
      valueKey: '',
      channelId: '',
    });
  });

  test('returns empty array when selected_users absent', () => {
    const view = {
      state: {
        values: {
          [BLOCK_RECIPIENT]: { [ACTION_RECIPIENT]: {} },
        },
      },
    };
    expect(readModalSubmission(view).recipientUserIds).toEqual([]);
  });
});
