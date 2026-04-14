const { OAuth2Client } = require('google-auth-library');

const client = new OAuth2Client();

async function verifyGoogleToken(req) {
  const projectNumber = process.env.GOOGLE_CHAT_PROJECT_NUMBER;
  if (!projectNumber) {
    console.warn('GOOGLE_CHAT_PROJECT_NUMBER not set, skipping verification');
    return true;
  }

  const bearer = req.headers.authorization;
  if (!bearer || !bearer.startsWith('Bearer ')) {
    return false;
  }

  const token = bearer.substring(7);
  try {
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: projectNumber,
    });
    return !!ticket;
  } catch (err) {
    console.error('Token verification failed:', err.message);
    return false;
  }
}

module.exports = { verifyGoogleToken };
