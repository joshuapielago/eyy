const crypto = require('crypto');
const { verifySlackRequest, rawBodySaver } = require('../../src/platforms/slack/verify');

const SECRET = 'test-signing-secret';

function sign(body, ts, secret = SECRET) {
  return 'v0=' + crypto.createHmac('sha256', secret).update(`v0:${ts}:${body}`).digest('hex');
}

function makeReq({ body, ts, signature, headers = {} } = {}) {
  return {
    rawBody: body,
    headers: {
      'x-slack-request-timestamp': ts,
      'x-slack-signature': signature,
      ...headers,
    },
  };
}

describe('verifySlackRequest', () => {
  const orig = process.env.SLACK_SIGNING_SECRET;
  const origNodeEnv = process.env.NODE_ENV;
  beforeEach(() => {
    process.env.SLACK_SIGNING_SECRET = SECRET;
    process.env.NODE_ENV = 'test';
  });
  afterAll(() => {
    process.env.SLACK_SIGNING_SECRET = orig;
    if (origNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = origNodeEnv;
  });

  test('accepts a fresh, well-signed request', () => {
    const body = 'token=x&team_id=T1';
    const ts = String(Math.floor(Date.now() / 1000));
    expect(verifySlackRequest(makeReq({ body, ts, signature: sign(body, ts) }))).toBe(true);
  });

  test('rejects a stale timestamp (>5 min old)', () => {
    const body = 'token=x';
    const ts = String(Math.floor(Date.now() / 1000) - 60 * 6);
    expect(verifySlackRequest(makeReq({ body, ts, signature: sign(body, ts) }))).toBe(false);
  });

  test('rejects a wrong signature', () => {
    const body = 'token=x';
    const ts = String(Math.floor(Date.now() / 1000));
    const bad = sign(body, ts, 'other-secret');
    expect(verifySlackRequest(makeReq({ body, ts, signature: bad }))).toBe(false);
  });

  test('rejects a tampered body', () => {
    const body = 'token=x';
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = sign(body, ts);
    expect(verifySlackRequest(makeReq({ body: 'token=y', ts, signature: sig }))).toBe(false);
  });

  test('rejects when headers are missing', () => {
    expect(verifySlackRequest({ rawBody: '', headers: {} })).toBe(false);
  });

  test('rejects when signing secret is missing in production', () => {
    delete process.env.SLACK_SIGNING_SECRET;
    process.env.NODE_ENV = 'production';
    expect(verifySlackRequest(makeReq({ body: '', ts: '1', signature: 'v0=00' }))).toBe(false);
  });
});

describe('rawBodySaver', () => {
  test('attaches the raw body string to the request', () => {
    const req = {};
    rawBodySaver(req, null, Buffer.from('hello'));
    expect(req.rawBody).toBe('hello');
  });

  test('handles empty buffer', () => {
    const req = {};
    rawBodySaver(req, null, Buffer.alloc(0));
    expect(req.rawBody).toBe('');
  });
});
