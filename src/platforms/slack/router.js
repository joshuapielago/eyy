const express = require('express');
const { rawBodySaver, slackVerifyMiddleware } = require('./verify');
const { handleSlashCommand, handleViewSubmission } = require('./handler');

function createSlackRouter() {
  const router = express.Router();

  router.use(express.urlencoded({ extended: false, verify: rawBodySaver }));
  router.use(slackVerifyMiddleware);

  router.post('/commands', async (req, res) => {
    try {
      await handleSlashCommand(req.body || {});
      // Empty 200 ack — the modal opens via views.open.
      res.status(200).send('');
    } catch (err) {
      console.error('[slack] slash command failed:', err.message);
      res.status(200).json({
        response_type: 'ephemeral',
        text: "Couldn't open the EYYY dialog — try again in a sec 🤙",
      });
    }
  });

  router.post('/interactivity', async (req, res) => {
    let payload = {};
    try {
      payload = JSON.parse(req.body?.payload || '{}');
    } catch (err) {
      console.error('[slack] interactivity payload parse failed:', err.message);
      return res.status(400).send('Bad payload');
    }

    if (payload.type === 'view_submission') {
      try {
        const result = await handleViewSubmission(payload);
        return res.json(result);
      } catch (err) {
        console.error('[slack] view_submission failed:', err.message);
        return res.json({
          response_action: 'errors',
          errors: { message_block: 'Something went wrong. Try again.' },
        });
      }
    }

    // Unhandled interaction types just ack.
    res.status(200).send('');
  });

  return router;
}

module.exports = { createSlackRouter };
