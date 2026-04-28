const express = require('express');
const { pool, initDb } = require('./shared/db');
const { createGoogleChatRouter } = require('./platforms/google-chat/router');
const { createSlackRouter } = require('./platforms/slack/router');

function resolvePublicBaseUrl() {
  const explicit = process.env.PUBLIC_BASE_URL;
  if (explicit) return explicit.replace(/\/+$/, '');
  if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  }
  return null;
}

function buildApp() {
  const app = express();

  const baseUrl = resolvePublicBaseUrl();
  if (!baseUrl && process.env.NODE_ENV === 'production') {
    throw new Error(
      'PUBLIC_BASE_URL (or RAILWAY_PUBLIC_DOMAIN) is required in production'
    );
  }
  const submitUrl = baseUrl ? `${baseUrl}/google-chat` : '/google-chat';

  app.use('/google-chat', createGoogleChatRouter({ submitUrl }));

  if (process.env.SLACK_SIGNING_SECRET && process.env.SLACK_BOT_TOKEN) {
    app.use('/slack', createSlackRouter());
  } else {
    console.log('[slack] SLACK_SIGNING_SECRET or SLACK_BOT_TOKEN not set; Slack endpoints disabled');
  }

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', app: 'eyy' });
  });

  return app;
}

if (require.main === module) {
  const app = buildApp();
  const PORT = process.env.PORT || 3000;

  const startServer = () => {
    const server = app.listen(PORT, () => {
      console.log(`EYY server running on port ${PORT} 🤙`);
    });

    const shutdown = (signal) => {
      console.log(`${signal} received, shutting down gracefully...`);
      server.close(() => {
        pool.end().then(() => {
          console.log('Database pool closed');
          process.exit(0);
        });
      });
      setTimeout(() => process.exit(1), 10000).unref();
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  };

  initDb()
    .then(startServer)
    .catch((err) => {
      console.error('Failed to initialize database:', err.message);
      startServer();
    });
}

module.exports = { buildApp, resolvePublicBaseUrl };
