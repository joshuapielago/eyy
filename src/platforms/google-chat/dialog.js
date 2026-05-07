const { VALUES } = require('../../shared/values');

function buildRenderActionsDialog({
  submitUrl,
  recipientHint = '',
  recipientUserIds = [],
  recipientNames = [],
  prefilledMessage = '',
} = {}) {
  const valueItems = Object.entries(VALUES).map(([key, val]) => ({
    text: `${val.emoji} ${val.name}`,
    value: key,
    selected: false,
  }));

  // recipientHint is shown to the user as a placeholder text in the input.
  // recipientUserIds is metadata we round-trip through the form so the submit
  // handler can reconstruct who was tagged via the originating slash command.
  const recipientNamesString = (recipientNames || []).filter(Boolean).join(', ');

  const card = {
    header: { title: 'EYYY! Time to hype someone up!' },
    sections: [{
      widgets: [
        {
          textInput: {
            name: 'recipient',
            label: 'To (tag teammates with @)',
            type: 'MULTIPLE_LINE',
            value: recipientNamesString,
            hintText: recipientHint || 'Tag one or more teammates with @',
          },
        },
        {
          textInput: {
            name: 'message',
            label: 'What makes them awesome?',
            type: 'MULTIPLE_LINE',
            value: prefilledMessage || '',
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
                    { key: 'recipientUserIds', value: (recipientUserIds || []).join(',') },
                    { key: 'recipientNames', value: recipientNamesString },
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
