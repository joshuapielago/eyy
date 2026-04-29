const { VALUES } = require('../../shared/values');

const CALLBACK_ID = 'eyy_submit';
const BLOCK_RECIPIENT = 'recipient_block';
const BLOCK_MESSAGE = 'message_block';
const BLOCK_VALUE = 'value_block';
const ACTION_RECIPIENT = 'recipient_action';
const ACTION_MESSAGE = 'message_action';
const ACTION_VALUE = 'value_action';

function buildEyyyModal({ channelId, prefilledUserId } = {}) {
  const valueOptions = Object.entries(VALUES).map(([key, val]) => ({
    text: { type: 'plain_text', text: `${val.emoji} ${val.name}`, emoji: true },
    value: key,
  }));

  const recipientElement = {
    type: 'users_select',
    action_id: ACTION_RECIPIENT,
    placeholder: { type: 'plain_text', text: 'Pick a teammate', emoji: true },
  };
  if (prefilledUserId) {
    recipientElement.initial_user = prefilledUserId;
  }

  return {
    type: 'modal',
    callback_id: CALLBACK_ID,
    private_metadata: JSON.stringify({ channelId: channelId || '' }),
    title: { type: 'plain_text', text: 'EYYY!', emoji: true },
    submit: { type: 'plain_text', text: 'Send the EYYY!', emoji: true },
    close: { type: 'plain_text', text: 'Cancel', emoji: true },
    blocks: [
      {
        type: 'input',
        block_id: BLOCK_RECIPIENT,
        label: { type: 'plain_text', text: 'To', emoji: true },
        element: recipientElement,
      },
      {
        type: 'input',
        block_id: BLOCK_MESSAGE,
        label: { type: 'plain_text', text: 'What makes them awesome?', emoji: true },
        element: {
          type: 'plain_text_input',
          action_id: ACTION_MESSAGE,
          multiline: true,
        },
      },
      {
        type: 'input',
        block_id: BLOCK_VALUE,
        label: { type: 'plain_text', text: 'Which LOKAL value do they embody?', emoji: true },
        element: {
          type: 'static_select',
          action_id: ACTION_VALUE,
          placeholder: { type: 'plain_text', text: 'Pick one', emoji: true },
          options: valueOptions,
        },
      },
    ],
  };
}

function readModalSubmission(view) {
  const values = view?.state?.values || {};
  const recipientUserId =
    values[BLOCK_RECIPIENT]?.[ACTION_RECIPIENT]?.selected_user || '';
  const message =
    values[BLOCK_MESSAGE]?.[ACTION_MESSAGE]?.value || '';
  const valueKey =
    values[BLOCK_VALUE]?.[ACTION_VALUE]?.selected_option?.value || '';

  let channelId = '';
  try {
    const meta = JSON.parse(view?.private_metadata || '{}');
    channelId = meta.channelId || '';
  } catch {
    channelId = '';
  }

  return { recipientUserId, message, valueKey, channelId };
}

module.exports = {
  buildEyyyModal,
  readModalSubmission,
  CALLBACK_ID,
  BLOCK_RECIPIENT,
  BLOCK_MESSAGE,
  BLOCK_VALUE,
  ACTION_RECIPIENT,
  ACTION_MESSAGE,
  ACTION_VALUE,
};
