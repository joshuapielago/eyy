const express = require('express');
const { verifyGoogleToken } = require('./verify');
const { handleEventFactory } = require('./handler');

function createGoogleChatRouter({ submitUrl }) {
  const router = express.Router();
  router.use(express.json());

  const handleEvent = handleEventFactory({ submitUrl });

  router.post('/', async (req, res) => {
    const eventType = req.body.chat?.appCommandPayload?.dialogEventType
      || (req.body.chat?.buttonClickedPayload ? 'BUTTON_CLICKED' : 'unknown');
    console.log(`[google-chat] Event: ${eventType}`);

    const isValid = await verifyGoogleToken(req);
    if (!isValid) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      const response = await handleEvent(req.body);
      res.json(response);
    } catch (err) {
      console.error('[google-chat] Error handling event:', err);
      res.status(500).json({ text: 'Oops, something went wrong! Try again 🤙' });
    }
  });

  return router;
}

module.exports = { createGoogleChatRouter };
