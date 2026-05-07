jest.mock('../../src/shared/db', () => {
  const client = {
    query: jest.fn(),
    release: jest.fn(),
  };
  return {
    pool: {
      connect: jest.fn().mockResolvedValue(client),
    },
    __client: client,
  };
});

const { pool, __client: client } = require('../../src/shared/db');
const { normalizeName, learnIdentity } = require('../../src/shared/identity');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('normalizeName', () => {
  test('lowercases and trims', () => {
    expect(normalizeName('  Joshua Pielago  ')).toBe('joshua pielago');
  });

  test('collapses internal whitespace', () => {
    expect(normalizeName('Joshua    Pielago')).toBe('joshua pielago');
  });

  test('returns empty string for falsy input', () => {
    expect(normalizeName('')).toBe('');
    expect(normalizeName(null)).toBe('');
    expect(normalizeName(undefined)).toBe('');
  });
});

// Helper: queue mock query responses in order. Each call to client.query
// pulls the next response.
function queueResponses(...responses) {
  let i = 0;
  client.query.mockImplementation(() => {
    const r = responses[i++];
    if (r === undefined) return Promise.resolve({ rows: [] });
    if (r instanceof Error) return Promise.reject(r);
    return Promise.resolve(r);
  });
}

describe('learnIdentity', () => {
  test('does nothing without any strong identifier', async () => {
    const result = await learnIdentity({ name: 'Joshua' });
    expect(result).toBeNull();
    expect(pool.connect).not.toHaveBeenCalled();
  });

  test('inserts a new row when no strong-id match exists', async () => {
    queueResponses(
      { rows: [] }, // BEGIN
      { rows: [] }, // SELECT candidates
      { rows: [{ id: 7, email: 'j@x.com', slack_user_id: 'U1', google_user_id: null, display_name: 'Joshua', name_key: 'joshua' }] }, // INSERT
      { rowCount: 0 }, // backfill slack
      { rows: [] }    // COMMIT
    );

    const result = await learnIdentity({
      email: 'J@x.com', // tests email normalization
      slackUserId: 'U1',
      name: 'Joshua',
    });

    expect(result.id).toBe(7);
    // INSERT was called with normalized email
    const insertCall = client.query.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].startsWith('INSERT INTO user_identity')
    );
    expect(insertCall[1]).toEqual(['j@x.com', 'U1', null, 'Joshua', 'joshua']);
  });

  test('merges incoming fields into a single matching row without overwriting strong ids', async () => {
    const existing = {
      id: 12,
      email: 'j@x.com',
      slack_user_id: 'U1',
      google_user_id: null,
      display_name: 'Joshua',
      name_key: 'joshua',
    };
    const merged = { ...existing, google_user_id: 'users/abc' };

    queueResponses(
      { rows: [] },           // BEGIN
      { rows: [existing] },   // candidates lookup
      { rows: [merged] },     // UPDATE returning *
      { rowCount: 0 },        // backfill slack
      { rowCount: 1 },        // backfill google
      { rows: [] }            // COMMIT
    );

    const result = await learnIdentity({
      email: 'j@x.com',
      googleUserId: 'users/abc',
      name: 'Joshua P.',
    });

    expect(result.id).toBe(12);
    expect(result.google_user_id).toBe('users/abc');

    // Verify UPDATE preserved the original email + slack id (existing fields win)
    const updateCall = client.query.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].startsWith('UPDATE user_identity')
    );
    // params: [id, email, slack, google, displayName, nameKey]
    expect(updateCall[1][0]).toBe(12);
    expect(updateCall[1][1]).toBe('j@x.com');     // existing email kept
    expect(updateCall[1][2]).toBe('U1');           // existing slack kept
    expect(updateCall[1][3]).toBe('users/abc');    // new google added
  });

  test('collapses two rows that turn out to be the same person', async () => {
    // Scenario: a Slack-only row exists ({email, slack}); a Google-Chat-only
    // row exists ({google}); learnIdentity fires with all three identifiers,
    // matching both rows. They must merge into one.
    const slackRow = {
      id: 5,
      email: 'j@x.com',
      slack_user_id: 'U1',
      google_user_id: null,
      display_name: 'Joshua',
      name_key: 'joshua',
    };
    const googleRow = {
      id: 11,
      email: null,
      slack_user_id: null,
      google_user_id: 'users/abc',
      display_name: 'Joshua P.',
      name_key: 'joshua p.',
    };
    const finalRow = {
      ...slackRow,
      google_user_id: 'users/abc',
    };

    queueResponses(
      { rows: [] },                    // BEGIN
      { rows: [slackRow, googleRow] }, // candidates: both match
      { rowCount: 1 },                 // DELETE googleRow
      { rows: [finalRow] },            // UPDATE returning *
      { rowCount: 0 },                 // backfill slack
      { rowCount: 2 },                 // backfill google (interesting — backfills happen)
      { rows: [] }                     // COMMIT
    );

    const result = await learnIdentity({
      email: 'j@x.com',
      slackUserId: 'U1',
      googleUserId: 'users/abc',
      name: 'Joshua',
    });

    expect(result.id).toBe(5);
    expect(result.google_user_id).toBe('users/abc');

    // Verify the DELETE was for googleRow.id
    const deleteCall = client.query.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].startsWith('DELETE FROM user_identity')
    );
    expect(deleteCall[1]).toEqual([11]);
  });

  test('backfills kudos.recipient_email for the linked user_id once email is known', async () => {
    const inserted = {
      id: 1,
      email: 'j@x.com',
      slack_user_id: null,
      google_user_id: 'users/abc',
      display_name: 'Joshua',
      name_key: 'joshua',
    };

    queueResponses(
      { rows: [] },        // BEGIN
      { rows: [] },        // candidates
      { rows: [inserted] }, // INSERT
      { rowCount: 4 },     // backfill google match
      { rows: [] }         // COMMIT
    );

    await learnIdentity({
      email: 'j@x.com',
      googleUserId: 'users/abc',
      name: 'Joshua',
    });

    // Find the backfill UPDATE on kudos
    const backfillCall = client.query.mock.calls.find(
      (c) => typeof c[0] === 'string' && /UPDATE kudos/.test(c[0])
    );
    expect(backfillCall).toBeDefined();
    expect(backfillCall[1]).toEqual(['j@x.com', 'users/abc']);
  });

  test('skips kudos backfill when email is not yet known', async () => {
    // E.g., Google Chat recipient observation: name + google_user_id, no email.
    const inserted = {
      id: 9,
      email: null,
      slack_user_id: null,
      google_user_id: 'users/x',
      display_name: 'Sam',
      name_key: 'sam',
    };

    queueResponses(
      { rows: [] },        // BEGIN
      { rows: [] },        // candidates
      { rows: [inserted] }, // INSERT
      { rows: [] }         // COMMIT
    );

    await learnIdentity({ googleUserId: 'users/x', name: 'Sam' });

    const backfillCall = client.query.mock.calls.find(
      (c) => typeof c[0] === 'string' && /UPDATE kudos/.test(c[0])
    );
    expect(backfillCall).toBeUndefined();
  });

  test('rolls back transaction on error', async () => {
    queueResponses(
      { rows: [] },                          // BEGIN
      new Error('connection lost')           // candidates fails
    );

    await expect(
      learnIdentity({ email: 'j@x.com' })
    ).rejects.toThrow('connection lost');

    const rollback = client.query.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0] === 'ROLLBACK'
    );
    expect(rollback).toBeDefined();
    expect(client.release).toHaveBeenCalled();
  });
});
