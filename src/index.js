const express = require('express');
const { buildEyyyCard } = require('./card');
const { VALUES, getRandomGiphyTerm } = require('./values');
const { fetchRandomGif } = require('./giphy');
const { initDb, saveKudos } = require('./db');
const { verifyGoogleToken } = require('./verify');

const ENDPOINT_URL = process.env.RAILWAY_PUBLIC_DOMAIN
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}/google-chat`
  : 'https://eyy-app-production.up.railway.app/google-chat';

function buildRenderActionsDialog({ recipientName = '' } = {}) {
  const valueItems = Object.entries(VALUES).map(([key, val]) => ({
    text: `${val.emoji} ${val.name}`,
    value: key,
    selected: false,
  }));

  // Try all three formats — Google Chat should accept whichever matches the API version
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
                  function: ENDPOINT_URL,
                },
              },
            }],
          },
        },
      ],
    }],
  };

  return {
    // Format from alternate-runtimes Node.js example (no renderActions wrapper)
    action: {
      navigations: [{ pushCard: card }],
    },
  };
}

async function handleEvent(rawEvent) {
  // Google Chat HTTP endpoint wraps everything:
  // { commonEventObject, authorizationEventObject, chat: { user, appCommandPayload: { message, dialogEventType, ... } } }
  const chat = rawEvent.chat || {};
  const payload = chat.appCommandPayload || {};
  const message = payload.message || {};
  const user = chat.user || rawEvent.user || {};
  const commonEvent = rawEvent.commonEventObject || {};

  // App added to a space
  if (chat.type === 'ADDED_TO_SPACE') {
    return {
      text: "EYYY! 🤙 I'm here to help you hype up your teammates!\n\nUse `/eyy @someone` to give an eyyy to a coworker.",
    };
  }

  // Slash command — open the dialog
  if (message.slashCommand || payload.dialogEventType === 'REQUEST_DIALOG') {
    const mention = (message.annotations || []).find(
      (a) => a.type === 'USER_MENTION'
    );
    const recipientName = mention?.userMention?.user?.displayName || '';
    return buildRenderActionsDialog({ recipientName });
  }

  // Dialog form submission (button click from the dialog)
  if (chat.buttonClickedPayload || payload.dialogEventType === 'SUBMIT_DIALOG') {
    return handleSubmit(rawEvent);
  }

  return { text: 'Use `/eyy @someone` to give an eyyy! 🤙' };
}

async function handleSubmit(rawEvent) {
  const chat = rawEvent.chat || {};
  const commonEvent = rawEvent.commonEventObject || {};

  // Form inputs are in commonEventObject.formInputs
  const formInputs = commonEvent.formInputs || {};
  const getInput = (name) => formInputs[name]?.stringInputs?.value?.[0] || '';

  const recipientName = getInput('recipient') || 'Someone';
  const message = getInput('message') || '';
  const valueKey = getInput('valueKey') || 'speed';

  const user = chat.user || {};
  const senderName = user.displayName || 'Someone';
  const senderEmail = user.email || '';

  // Get space name from buttonClickedPayload
  const buttonPayload = chat.buttonClickedPayload || {};
  const spaceName = buttonPayload.message?.space?.name || '';

  // Fetch a random gif for this value
  const searchTerm = getRandomGiphyTerm(valueKey);
  const gifUrl = searchTerm ? await fetchRandomGif(searchTerm) : null;

  // Save to database (don't let DB failure block the card)
  try {
    await saveKudos({
      senderEmail,
      senderName,
      recipientEmail: '',
      recipientName,
      message,
      valueKey,
      gifUrl,
      spaceName,
    });
  } catch (err) {
    console.error('Failed to save kudos:', err.message);
  }

  // Build the eyyy card
  const card = buildEyyyCard({ senderName, recipientName, message, valueKey, gifUrl });

  // Close dialog and post message using the add-ons framework format
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

// Only start the server if this file is run directly (not imported by tests)
if (require.main === module) {
  const app = express();
  app.use(express.json());

  app.post('/google-chat', async (req, res) => {
    const eventType = req.body.chat?.appCommandPayload?.dialogEventType
      || (req.body.chat?.buttonClickedPayload ? 'BUTTON_CLICKED' : 'unknown');
    console.log(`Event: ${eventType}`);

    const isValid = await verifyGoogleToken(req);
    if (!isValid) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      const response = await handleEvent(req.body);
      res.json(response);
    } catch (err) {
      console.error('Error handling event:', err);
      res.json({ text: 'Oops, something went wrong! Try again 🤙' });
    }
  });

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', app: 'eyy' });
  });

  const PORT = process.env.PORT || 3000;

  initDb()
    .then(() => {
      app.listen(PORT, () => {
        console.log(`EYY server running on port ${PORT} 🤙`);
      });
    })
    .catch((err) => {
      console.error('Failed to initialize database:', err.message);
      // Start server anyway — DB will retry on next request
      app.listen(PORT, () => {
        console.log(`EYY server running on port ${PORT} (DB init failed) 🤙`);
      });
    });
}

module.exports = { handleEvent };
