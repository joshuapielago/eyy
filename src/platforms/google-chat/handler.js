const { buildEyyyCard } = require('./card');
const { buildRenderActionsDialog } = require('./dialog');
const { getValueByKey } = require('../../shared/values');
const { recordKudos, DEFAULT_VALUE_KEY } = require('../../shared/kudos');

function handleEventFactory({ submitUrl }) {
  async function handleEvent(rawEvent) {
    const chat = rawEvent.chat || {};
    const payload = chat.appCommandPayload || {};
    const message = payload.message || {};

    if (message.slashCommand || payload.dialogEventType === 'REQUEST_DIALOG') {
      const mention = (message.annotations || []).find(
        (a) => a.type === 'USER_MENTION'
      );
      const recipientName = mention?.userMention?.user?.displayName || '';
      const recipientUserId = mention?.userMention?.user?.name || '';
      return buildRenderActionsDialog({ submitUrl, recipientName, recipientUserId });
    }

    if (chat.type === 'ADDED_TO_SPACE') {
      return {
        text: "EYYY! 🤙 I'm here to help you hype up your teammates!\n\nUse `/eyy @someone` to give an eyyy to a coworker.",
      };
    }

    if (chat.buttonClickedPayload || payload.dialogEventType === 'SUBMIT_DIALOG') {
      return handleSubmit(rawEvent);
    }

    return { text: 'Use `/eyy @someone` to give an eyyy! 🤙' };
  }

  return handleEvent;
}

async function handleSubmit(rawEvent) {
  const chat = rawEvent.chat || {};
  const commonEvent = rawEvent.commonEventObject || {};

  const formInputs = commonEvent.formInputs || {};
  const getInput = (name) => formInputs[name]?.stringInputs?.value?.[0] || '';

  const recipientName = getInput('recipient') || 'Someone';
  const message = getInput('message') || '';
  const rawValueKey = getInput('valueKey') || DEFAULT_VALUE_KEY;
  const valueKey = getValueByKey(rawValueKey) ? rawValueKey : DEFAULT_VALUE_KEY;

  const params = commonEvent.parameters || {};
  const recipientUserId = params.recipientUserId || '';

  const user = chat.user || {};
  const senderName = user.displayName || 'Someone';
  const senderEmail = user.email || '';

  const buttonPayload = chat.buttonClickedPayload || {};
  const spaceName = buttonPayload.message?.space?.name || '';

  const { gifUrl } = await recordKudos({
    platform: 'google-chat',
    sender: { name: senderName, email: senderEmail },
    recipient: { id: recipientUserId, name: recipientName },
    message,
    valueKey,
    channel: spaceName,
  });

  const card = buildEyyyCard({ senderName, recipientName, recipientUserId, message, valueKey, gifUrl });

  return {
    hostAppDataAction: {
      chatDataAction: {
        createMessageAction: {
          message: card,
        },
      },
    },
  };
}

module.exports = { handleEventFactory, handleSubmit };
