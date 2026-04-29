const { WebClient } = require('@slack/web-api');

let cachedClient = null;

function getSlackClient() {
  if (cachedClient) return cachedClient;
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) {
    throw new Error('SLACK_BOT_TOKEN is not set');
  }
  cachedClient = new WebClient(token);
  return cachedClient;
}

function resetSlackClientForTests() {
  cachedClient = null;
}

module.exports = { getSlackClient, resetSlackClientForTests };
