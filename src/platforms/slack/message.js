const { getValueByKey } = require('../../shared/values');
const { escapeSlackMrkdwn } = require('../../shared/sanitize');

const HYPE_HEADERS = [
  'EYYY! 🤙🔥🤙',
  "EYYYYYY LET'S GOOO! 🤙🎉🤙",
  "EYY EYY EYY! Someone's CRUSHING it! 🤙💪🤙",
  'EYYY! Shoutout incoming! 🤙🚀🤙',
  'BIG EYY ENERGY! 🤙⚡🤙',
];

function formatRecipientsForBlocks(recipients) {
  // recipients: array of { id, name } — id is the Slack user ID (no <@> wrap).
  return recipients
    .map((r) =>
      r.id ? `<@${r.id}>` : `*${escapeSlackMrkdwn(r.name || 'a teammate')}*`
    )
    .join(' ');
}

function formatRecipientsForFallback(recipients) {
  return recipients
    .map((r) => (r.id ? `<@${r.id}>` : r.name || 'a teammate'))
    .join(' ');
}

function buildEyyyBlocks({
  senderName,
  recipients = [],
  // Backward-compat single-recipient fields:
  recipientUserId,
  recipientName,
  message,
  valueKey,
  gifUrl,
}) {
  const value = getValueByKey(valueKey);
  const hypeHeader = HYPE_HEADERS[Math.floor(Math.random() * HYPE_HEADERS.length)];

  const resolvedRecipients = recipients.length > 0
    ? recipients
    : [{ id: recipientUserId || '', name: recipientName || '' }];

  const safeSender = escapeSlackMrkdwn(senderName);
  const safeMessage = escapeSlackMrkdwn(message);
  const recipientList = formatRecipientsForBlocks(resolvedRecipients);
  const verb = resolvedRecipients.length > 1 ? 'gave eyyys to' : 'gave an eyyy to';

  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: hypeHeader, emoji: true },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${safeSender}* ${verb} ${recipientList} 🤙`,
      },
    },
    { type: 'divider' },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `_"${safeMessage}"_`,
      },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `${value.emoji} *${escapeSlackMrkdwn(value.name)}* · _"${escapeSlackMrkdwn(value.tagline)}"_`,
        },
      ],
    },
  ];

  if (gifUrl) {
    blocks.push({
      type: 'image',
      image_url: gifUrl,
      alt_text: 'Celebratory gif',
    });
  }

  const fallbackText = `🤙 ${senderName} ${verb} ${formatRecipientsForFallback(resolvedRecipients)}!`;

  return { text: fallbackText, blocks };
}

module.exports = { buildEyyyBlocks, HYPE_HEADERS };
