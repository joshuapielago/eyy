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

  app.get('/health', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ok', app: 'eyy' });
    } catch (err) {
      console.error('[health] database check failed:', err.message);
      res.status(503).json({ status: 'error', app: 'eyy' });
    }
  });

  return app;
}

if (require.main === module) {
  const app = buildApp();
  const PORT = process.env.PORT || 3000;

  // Validate the operator config eagerly so a bad EYY_CONFIG_PATH fails at boot
  // with a clear message, rather than erroring on every kudos request.
  try {
    const cfg = require('./shared/config').resolveConfig();
    const source = process.env.EYY_CONFIG_PATH || 'built-in defaults';
    console.log(`[config] ${cfg.values.length} values loaded (${source})`);
  } catch (err) {
    console.error('[config] Failed to load EYY config, exiting:', err.message);
    process.exit(1);
  }

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
      // Fail fast: serving with an uninitialized/broken schema silently corrupts
      // data. Exit non-zero so the platform (Railway) restarts or rolls back.
      console.error('Failed to initialize database, exiting:', err.message);
      process.exit(1);
    });
}

module.exports = { buildApp, resolvePublicBaseUrl };
