const { VALUES } = require('../../shared/values');

function buildRenderActionsDialog({ submitUrl, recipientName = '', recipientUserId = '' } = {}) {
  const valueItems = Object.entries(VALUES).map(([key, val]) => ({
    text: `${val.emoji} ${val.name}`,
    value: key,
    selected: false,
  }));

  const card = {
    header: { title: 'EYYY! Time to hype someone up!' },
    sections: [{
      widgets: [
        {
          textInput: {
            name: 'recipient',
            label: 'To',
            type: 'SINGLE_LINE',
            value: recipientName,
          },
        },
        {
          textInput: {
            name: 'message',
            label: 'What makes them awesome?',
            type: 'MULTIPLE_LINE',
          },
        },
        {
          selectionInput: {
            name: 'valueKey',
            label: 'Which LOKAL value do they embody?',
            type: 'DROPDOWN',
            items: valueItems,
          },
        },
        {
          buttonList: {
            buttons: [{
              text: 'Send the EYYY!',
              onClick: {
                action: {
                  function: submitUrl,
                  parameters: [
                    { key: 'recipientUserId', value: recipientUserId },
                  ],
                },
              },
            }],
          },
        },
      ],
    }],
  };

  return {
    action: {
      navigations: [{ pushCard: card }],
    },
  };
}

module.exports = { buildRenderActionsDialog };
