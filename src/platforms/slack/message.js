const { getValueByKey } = require('../../shared/values');
const { escapeSlackMrkdwn } = require('../../shared/sanitize');

const HYPE_HEADERS = [
  'EYYY! 🤙🔥🤙',
  "EYYYYYY LET'S GOOO! 🤙🎉🤙",
  "EYY EYY EYY! Someone's CRUSHING it! 🤙💪🤙",
  'EYYY! Shoutout incoming! 🤙🚀🤙',
  'BIG EYY ENERGY! 🤙⚡🤙',
];

function buildEyyyBlocks({ senderName, recipientUserId, recipientName, message, valueKey, gifUrl }) {
  const value = getValueByKey(valueKey);
  const hypeHeader = HYPE_HEADERS[Math.floor(Math.random() * HYPE_HEADERS.length)];

  const safeSender = escapeSlackMrkdwn(senderName);
  const safeMessage = escapeSlackMrkdwn(message);
  const recipientRef = recipientUserId
    ? `<@${recipientUserId}>`
    : `*${escapeSlackMrkdwn(recipientName || 'a teammate')}*`;

  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: hypeHeader, emoji: true },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${safeSender}* gave an eyyy to ${recipientRef} 🤙`,
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

  const fallbackText = recipientUserId
    ? `🤙 ${senderName} gave an eyyy to <@${recipientUserId}>!`
    : `🤙 ${senderName} gave an eyyy to ${recipientName || 'a teammate'}!`;

  return { text: fallbackText, blocks };
}

module.exports = { buildEyyyBlocks, HYPE_HEADERS };
