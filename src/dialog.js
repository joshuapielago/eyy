const { VALUES } = require('./values');

function buildDialog({ recipientName = '' } = {}) {
  const valueItems = Object.entries(VALUES).map(([key, val]) => ({
    text: `${val.emoji} ${val.name} — ${val.tagline}`,
    value: key,
    selected: false,
  }));

  return {
    actionResponse: {
      type: 'DIALOG',
      dialogAction: {
        dialog: {
          body: {
            sections: [
              {
                header: 'EYYY! 🤙 Time to hype someone up!',
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
                      label: 'What makes them awesome? 🤙',
                      type: 'MULTIPLE_LINE',
                      hintText: 'e.g. Shipped the entire landing page in one night like an absolute legend',
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
                      buttons: [
                        {
                          text: '🤙 Send the EYYY!',
                          onClick: {
                            action: {
                              function: 'submitEyyy',
                            },
                          },
                        },
                      ],
                    },
                  },
                ],
              },
            ],
          },
        },
      },
    },
  };
}

module.exports = { buildDialog };
