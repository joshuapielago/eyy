const { getValueByKey } = require('./values');

const HYPE_HEADERS = [
  'EYYY! 🤙🔥🤙',
  "EYYYYYY LET'S GOOO! 🤙🎉🤙",
  "EYY EYY EYY! Someone's CRUSHING it! 🤙💪🤙",
  'EYYY! Shoutout incoming! 🤙🚀🤙',
  'BIG EYY ENERGY! 🤙⚡🤙',
];

function buildEyyyCard({ senderName, recipientName, message, valueKey, gifUrl }) {
  const value = getValueByKey(valueKey);
  const hypeHeader = HYPE_HEADERS[Math.floor(Math.random() * HYPE_HEADERS.length)];

  const widgets = [
    {
      textParagraph: {
        text: `<b>${senderName}</b> gave an eyyy to <b>${recipientName}</b> 🤙`,
      },
    },
    { divider: {} },
    {
      textParagraph: {
        text: `<i>"${message}"</i>`,
      },
    },
    {
      textParagraph: {
        text: `${value.emoji} <b>${value.name}</b> · <i>"${value.tagline}"</i>`,
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
    text: `🤙 ${senderName} gave an eyyy to ${recipientName}!`,
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
