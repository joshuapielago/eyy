const express = require('express');
const { buildDialog } = require('./dialog');
const { buildEyyyCard } = require('./card');
const { getRandomGiphyTerm } = require('./values');
const { fetchRandomGif } = require('./giphy');
const { initDb, saveKudos } = require('./db');
const { verifyGoogleToken } = require('./verify');

async function handleEvent(event) {
  // Google Chat HTTP endpoint nests slash command data inside appCommandPayload
  const payload = event.appCommandPayload || event;
  const message = payload.message || event.message;

  // App added to a space
  if (event.type === 'ADDED_TO_SPACE') {
    return {
      text: "EYYY! 🤙 I'm here to help you hype up your teammates!\n\nUse `/eyy @someone` to give an eyyy to a coworker.",
    };
  }

  // Slash command — open the dialog
  if (message?.slashCommand || payload.dialogEventType === 'REQUEST_DIALOG') {
    const mention = message?.annotations?.find(
      (a) => a.type === 'USER_MENTION'
    );
    const recipientName = mention?.userMention?.user?.displayName || '';
    return buildDialog({ recipientName });
  }

  // Dialog form submission
  if (payload.dialogEventType === 'SUBMIT_DIALOG' || event.type === 'CARD_CLICKED') {
    const invokedFunction = event.common?.invokedFunction;
    if (invokedFunction === 'submitEyyy') {
      return handleSubmit(event);
    }
  }

  return { text: 'Use `/eyy @someone` to give an eyyy! 🤙' };
}

async function handleSubmit(event) {
  const formInputs = event.common?.formInputs || {};
  const recipientName = formInputs.recipient?.stringInputs?.value?.[0] || 'Someone';
  const message = formInputs.message?.stringInputs?.value?.[0] || '';
  const valueKey = formInputs.valueKey?.stringInputs?.value?.[0] || 'speed';

  const senderName = event.user?.displayName || 'Someone';
  const senderEmail = event.user?.email || '';
  const spaceName = event.space?.name || '';

  // Fetch a random gif for this value
  const searchTerm = getRandomGiphyTerm(valueKey);
  const gifUrl = searchTerm ? await fetchRandomGif(searchTerm) : null;

  // Save to database (don't let DB failure block the card)
  try {
    await saveKudos({
      senderEmail,
      senderName,
      recipientEmail: '', // Not always available from form input
      recipientName,
      message,
      valueKey,
      gifUrl,
      spaceName,
    });
  } catch (err) {
    console.error('Failed to save kudos:', err.message);
  }

  // Build and return the eyyy card
  const card = buildEyyyCard({ senderName, recipientName, message, valueKey, gifUrl });
  return {
    actionResponse: {
      type: 'NEW_MESSAGE',
    },
    ...card,
  };
}

// Only start the server if this file is run directly (not imported by tests)
if (require.main === module) {
  const app = express();
  app.use(express.json());

  app.post('/google-chat', async (req, res) => {
    console.log('TOP KEYS:', Object.keys(req.body));
    console.log('appCommandPayload keys:', Object.keys(req.body.appCommandPayload || {}));
    console.log('message keys:', Object.keys(req.body.message || {}));
    console.log('event.type:', req.body.type);
    console.log('event.dialogEventType:', req.body.dialogEventType);

    const isValid = await verifyGoogleToken(req);
    if (!isValid) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      const response = await handleEvent(req.body);
      console.log('Response:', JSON.stringify(response, null, 2));
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
