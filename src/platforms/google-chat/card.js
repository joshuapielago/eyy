const { getValueByKey } = require('../../shared/values');
const { escapeHtml } = require('../../shared/sanitize');

const HYPE_HEADERS = [
  'EYYY! 🤙🔥🤙',
  "EYYYYYY LET'S GOOO! 🤙🎉🤙",
  "EYY EYY EYY! Someone's CRUSHING it! 🤙💪🤙",
  'EYYY! Shoutout incoming! 🤙🚀🤙',
  'BIG EYY ENERGY! 🤙⚡🤙',
];

function buildEyyyCard({ senderName, recipientName, recipientUserId, message, valueKey, gifUrl }) {
  const value = getValueByKey(valueKey);
  const hypeHeader = HYPE_HEADERS[Math.floor(Math.random() * HYPE_HEADERS.length)];

  const sender = escapeHtml(senderName);
  const recipient = escapeHtml(recipientName);
  const safeMessage = escapeHtml(message);
  const valueName = escapeHtml(value.name);
  const valueTagline = escapeHtml(value.tagline);

  const widgets = [
    {
      textParagraph: {
        text: `<b>${sender}</b> gave an eyyy to <b>${recipient}</b> 🤙`,
      },
    },
    { divider: {} },
    {
      textParagraph: {
        text: `<i>"${safeMessage}"</i>`,
      },
    },
    {
      textParagraph: {
        text: `${value.emoji} <b>${valueName}</b> · <i>"${valueTagline}"</i>`,
      },
    },
  ];

  if (gifUrl) {
    widgets.push({
      image: {
        imageUrl: gifUrl,
        altText: 'Celebratory gif',
      },
    });
  }

  return {
    text: recipientUserId
      ? `🤙 ${senderName} gave an eyyy to <${recipientUserId}>!`
      : `🤙 ${senderName} gave an eyyy to ${recipientName}!`,
    cardsV2: [
      {
        cardId: 'eyyyCard',
        card: {
          header: {
            title: hypeHeader,
            subtitle: "Someone's being awesome today",
            imageUrl: '',
            imageType: 'CIRCLE',
          },
          sections: [
            {
              widgets,
            },
          ],
        },
      },
    ],
  };
}

module.exports = { buildEyyyCard, HYPE_HEADERS };
