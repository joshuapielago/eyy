const crypto = require('crypto');

const FIVE_MINUTES_SECONDS = 60 * 5;
const SIGNATURE_VERSION = 'v0';

function rawBodySaver(req, _res, buf) {
  if (buf && buf.length) {
    req.rawBody = buf.toString('utf8');
  } else {
    req.rawBody = '';
  }
}

function verifySlackRequest(req) {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[slack] SLACK_SIGNING_SECRET not set — rejecting request (production)');
      return false;
    }
    if (process.env.NODE_ENV === 'development') {
      console.warn('[slack] SLACK_SIGNING_SECRET not set, skipping verification (dev mode)');
      return true;
    }
    console.error('[slack] SLACK_SIGNING_SECRET not set — rejecting request');
    return false;
  }

  const timestamp = req.headers['x-slack-request-timestamp'];
  const signature = req.headers['x-slack-signature'];
  if (!timestamp || !signature) return false;

  const tsNum = Number(timestamp);
  if (!Number.isFinite(tsNum)) return false;
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - tsNum) > FIVE_MINUTES_SECONDS) return false;

  const body = typeof req.rawBody === 'string' ? req.rawBody : '';
  const baseString = `${SIGNATURE_VERSION}:${timestamp}:${body}`;
  const expected = `${SIGNATURE_VERSION}=` + crypto
    .createHmac('sha256', signingSecret)
    .update(baseString)
    .digest('hex');

  const expectedBuf = Buffer.from(expected, 'utf8');
  const givenBuf = Buffer.from(signature, 'utf8');
  if (expectedBuf.length !== givenBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, givenBuf);
}

function slackVerifyMiddleware(req, res, next) {
  if (verifySlackRequest(req)) return next();
  return res.status(401).send('Invalid Slack signature');
}

module.exports = { rawBodySaver, verifySlackRequest, slackVerifyMiddleware };
