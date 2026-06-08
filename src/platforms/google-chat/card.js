const { getValueDef, listValueDefs } = require('../../shared/config');
const { escapeHtml } = require('../../shared/sanitize');

const HYPE_HEADERS = [
  'EYYY! 🤙🔥🤙',
  "EYYYYYY LET'S GOOO! 🤙🎉🤙",
  "EYY EYY EYY! Someone's CRUSHING it! 🤙💪🤙",
  'EYYY! Shoutout incoming! 🤙🚀🤙',
  'BIG EYY ENERGY! 🤙⚡🤙',
];

function formatRecipientsHtml(recipients) {
  // recipients: [{ id, name }]. id may be 'users/123' or empty.
  // Google Chat renders <users/N> tokens natively; for entries without an id
  // we fall back to the escaped display name.
  return recipients
    .map((r) => {
      if (r.id) return `<users/${stripUsersPrefix(r.id)}>`;
      const safe = escapeHtml(r.name || 'a teammate');
      return `<b>${safe}</b>`;
    })
    .join(' ');
}

function stripUsersPrefix(id) {
  return String(id).startsWith('users/') ? String(id).slice('users/'.length) : String(id);
}

function buildEyyyCard({
  senderName,
  recipients,
  // Backward-compat single-recipient fields:
  recipientName,
  recipientUserId,
  message,
  valueKey,
  gifUrl,
}) {
  const value = getValueDef(valueKey) || listValueDefs()[0];
  const hypeHeader = HYPE_HEADERS[Math.floor(Math.random() * HYPE_HEADERS.length)];

  const resolvedRecipients = Array.isArray(recipients) && recipients.length > 0
    ? recipients
    : [{ id: recipientUserId || '', name: recipientName || '' }];

  const sender = escapeHtml(senderName);
  const safeMessage = escapeHtml(message);
  const valueName = escapeHtml(value.name);
  const valueTagline = escapeHtml(value.tagline);
  const recipientList = formatRecipientsHtml(resolvedRecipients);
  const verb = resolvedRecipients.length > 1 ? 'gave eyyys to' : 'gave an eyyy to';

  const widgets = [
    {
      textParagraph: {
        text: `<b>${sender}</b> ${verb} ${recipientList} 🤙`,
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

  const fallbackNames = resolvedRecipients
    .map((r) => r.name || (r.id ? `<${r.id}>` : 'a teammate'))
    .join(', ');

  return {
    text: `🤙 ${senderName} ${verb} ${fallbackNames}!`,
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

module.exports = { buildEyyyCard, HYPE_HEADERS, formatRecipientsHtml };
