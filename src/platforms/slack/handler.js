const { buildEyyyModal, readModalSubmission, CALLBACK_ID } = require('./modal');
const { buildEyyyBlocks } = require('./message');
const { recordKudos } = require('../../shared/kudos');
const { getSlackClient } = require('./client');

const SLACK_USER_MENTION = /<@([UW][A-Z0-9]+)(?:\|[^>]*)?>/;

function parsePrefilledUser(text) {
  if (!text) return '';
  const match = text.match(SLACK_USER_MENTION);
  return match ? match[1] : '';
}

async function handleSlashCommand(body) {
  const triggerId = body.trigger_id;
  const channelId = body.channel_id || '';
  const prefilledUserId = parsePrefilledUser(body.text || '');

  const view = buildEyyyModal({ channelId, prefilledUserId });

  const client = getSlackClient();
  await client.views.open({ trigger_id: triggerId, view });

  return { ok: true };
}

async function lookupSlackUser(userId) {
  if (!userId) return { id: '', name: '', email: '' };
  try {
    const client = getSlackClient();
    const result = await client.users.info({ user: userId });
    const profile = result?.user?.profile || {};
    return {
      id: userId,
      name: profile.real_name || result?.user?.name || '',
      email: profile.email || '',
    };
  } catch (err) {
    console.error('[slack] users.info failed:', err.message);
    return { id: userId, name: '', email: '' };
  }
}

async function handleViewSubmission(payload) {
  const view = payload.view || {};
  if (view.callback_id !== CALLBACK_ID) {
    return { response_action: 'clear' };
  }

  const { recipientUserId, message, valueKey, channelId } = readModalSubmission(view);

  const senderId = payload.user?.id || '';
  const sender = await lookupSlackUser(senderId);
  const recipient = await lookupSlackUser(recipientUserId);

  const { gifUrl } = await recordKudos({
    platform: 'slack',
    sender,
    recipient,
    message,
    valueKey,
    channel: channelId,
  });

  // Post the message after acknowledging the submission so we stay under
  // Slack's 3-second response budget. If chat.postMessage fails, the kudos
  // is already saved.
  setImmediate(async () => {
    try {
      const client = getSlackClient();
      const { text, blocks } = buildEyyyBlocks({
        senderName: sender.name || 'Someone',
        recipientUserId: recipient.id,
        recipientName: recipient.name,
        message,
        valueKey,
        gifUrl,
      });
      await client.chat.postMessage({
        channel: channelId,
        text,
        blocks,
      });
    } catch (err) {
      console.error('[slack] chat.postMessage failed:', err.message);
    }
  });

  return { response_action: 'clear' };
}

module.exports = {
  handleSlashCommand,
  handleViewSubmission,
  parsePrefilledUser,
  lookupSlackUser,
};
