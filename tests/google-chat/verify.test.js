const mockVerifyIdToken = jest.fn();
jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn(() => ({ verifyIdToken: mockVerifyIdToken })),
}));

const { verifyGoogleToken } = require('../../src/platforms/google-chat/verify');

function reqWith(token) {
  return { headers: { authorization: `Bearer ${token}` } };
}

describe('verifyGoogleToken', () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    mockVerifyIdToken.mockReset();
    process.env.GOOGLE_CHAT_AUDIENCE = 'https://app.test/google-chat';
    process.env.NODE_ENV = 'production';
  });

  afterAll(() => {
    process.env = origEnv;
  });

  test('accepts a token issued by the Google Chat service account', async () => {
    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({
        iss: 'https://accounts.google.com',
        email: 'chat@system.gserviceaccount.com',
        email_verified: true,
      }),
    });
    await expect(verifyGoogleToken(reqWith('tok'))).resolves.toBe(true);
    expect(mockVerifyIdToken).toHaveBeenCalledWith({
      idToken: 'tok',
      audience: 'https://app.test/google-chat',
    });
  });

  test('rejects a Google-signed token from any other account (request forgery)', async () => {
    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({
        iss: 'https://accounts.google.com',
        email: 'attacker@evil.iam.gserviceaccount.com',
        email_verified: true,
      }),
    });
    await expect(verifyGoogleToken(reqWith('forged'))).resolves.toBe(false);
  });

  test('rejects when the service-account email is not verified', async () => {
    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({
        email: 'chat@system.gserviceaccount.com',
        email_verified: false,
      }),
    });
    await expect(verifyGoogleToken(reqWith('tok'))).resolves.toBe(false);
  });

  test('rejects when verifyIdToken throws (bad signature or audience)', async () => {
    mockVerifyIdToken.mockRejectedValue(new Error('Invalid token'));
    await expect(verifyGoogleToken(reqWith('tok'))).resolves.toBe(false);
  });

  test('rejects when the Authorization header is missing', async () => {
    await expect(verifyGoogleToken({ headers: {} })).resolves.toBe(false);
    expect(mockVerifyIdToken).not.toHaveBeenCalled();
  });

  test('rejects when GOOGLE_CHAT_AUDIENCE is unset in production', async () => {
    delete process.env.GOOGLE_CHAT_AUDIENCE;
    await expect(verifyGoogleToken(reqWith('tok'))).resolves.toBe(false);
  });
});
