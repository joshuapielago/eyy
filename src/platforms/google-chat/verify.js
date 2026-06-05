const { OAuth2Client } = require('google-auth-library');

const client = new OAuth2Client();

// Google signs every inbound Chat request with this exact service account.
// verifyIdToken already enforces the signature, issuer, and audience; pinning
// the email is what stops a forged-but-Google-signed token (minted from any
// other Google OAuth client with our endpoint URL as the audience) from
// impersonating Chat. See Google Chat "Verify requests" docs.
const CHAT_ISSUER_EMAIL = 'chat@system.gserviceaccount.com';

async function verifyGoogleToken(req) {
  const audience = process.env.GOOGLE_CHAT_AUDIENCE;
  if (!audience) {
    if (process.env.NODE_ENV === 'production') {
      console.error('GOOGLE_CHAT_AUDIENCE not set — rejecting request (production)');
      return false;
    }
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
    const payload = ticket && ticket.getPayload();
    if (!payload) return false;
    if (payload.email !== CHAT_ISSUER_EMAIL || payload.email_verified !== true) {
      console.error(
        'Token rejected: not issued by Google Chat service account',
        payload.email
      );
      return false;
    }
    return true;
  } catch (err) {
    console.error('Token verification failed:', err.message);
    return false;
  }
}

module.exports = { verifyGoogleToken };
