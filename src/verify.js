const { OAuth2Client } = require('google-auth-library');

const client = new OAuth2Client();

async function verifyGoogleToken(req) {
  const audience = process.env.GOOGLE_CHAT_AUDIENCE;
  if (!audience) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('GOOGLE_CHAT_AUDIENCE not set, skipping verification (dev mode)');
      return true;
    }
    console.error('GOOGLE_CHAT_AUDIENCE not set — rejecting request');
    return false;
  }

  const bearer = req.headers.authorization;
  if (!bearer || !bearer.startsWith('Bearer ')) {
    return false;
  }

  const token = bearer.substring(7);
  try {
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience,
    });
    return !!ticket;
  } catch (err) {
    console.error('Token verification failed:', err.message);
    return false;
  }
}

module.exports = { verifyGoogleToken };
