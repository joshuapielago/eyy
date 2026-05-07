jest.mock('../../src/shared/db', () => ({
  pool: { query: jest.fn() },
}));

const { pool } = require('../../src/shared/db');
const {
  getReceivedStats,
  getRecentVerbatims,
  getTeamLeaderboard,
} = require('../../src/shared/stats');

describe('getReceivedStats', () => {
  beforeEach(() => jest.clearAllMocks());

  test('zero-fills all 7 value keys when no rows match', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const result = await getReceivedStats('me@x.com');
    expect(result.total).toBe(0);
    expect(Object.keys(result.counts).sort()).toEqual(
      ['clear', 'creative', 'hightech', 'kind', 'lead', 'speed', 'talent']
    );
    Object.values(result.counts).forEach((v) => expect(v).toBe(0));
  });

  test('aggregates counts and returns total', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [
        { value_key: 'kind', n: '5' },
        { value_key: 'speed', n: '3' },
        { value_key: 'lead', n: '1' },
      ],
    });
    const result = await getReceivedStats('me@x.com');
    expect(result.counts.kind).toBe(5);
    expect(result.counts.speed).toBe(3);
    expect(result.counts.lead).toBe(1);
    expect(result.counts.creative).toBe(0);
    expect(result.total).toBe(9);
  });

  test('ignores unknown value_keys defensively', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [
        { value_key: 'kind', n: '2' },
        { value_key: 'no_such_value', n: '99' },
      ],
    });
    const result = await getReceivedStats('me@x.com');
    expect(result.counts.kind).toBe(2);
    expect(result.total).toBe(2);
  });

  test('passes the email to the query and uses recipient_email predicate', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    await getReceivedStats('daisy@lkl.ai');
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/recipient_email = \$1/);
    expect(sql).toMatch(/value_key/i);
    expect(params).toEqual(['daisy@lkl.ai']);
  });

  test('returns zero counts and total 0 for empty email', async () => {
    const result = await getReceivedStats('');
    expect(result.total).toBe(0);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('queries by user_id when given { userId }', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ value_key: 'kind', n: '4' }] });
    const result = await getReceivedStats({ userId: 'users/abc' });
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/recipient_user_id = \$1/);
    expect(params).toEqual(['users/abc']);
    expect(result.counts.kind).toBe(4);
    expect(result.total).toBe(4);
  });

  test('uses OR clause across email and user_id when both given', async () => {
    // Critical for Google Chat invokers: their event payload includes email,
    // but Google Chat kudos rows store recipient_email = ''. Without ORing
    // recipient_user_id, the leaderboard would always be empty for them.
    pool.query.mockResolvedValueOnce({ rows: [{ value_key: 'kind', n: '3' }] });
    await getReceivedStats({ email: 'a@b.com', userId: 'users/x' });
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/recipient_email = \$1 OR recipient_user_id = \$2/);
    expect(params).toEqual(['a@b.com', 'users/x']);
  });

  test('verbatims also OR across email and user_id with shifted LIMIT param', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    await getRecentVerbatims({ email: 'a@b.com', userId: 'users/x' }, 7);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/recipient_email = \$1 OR recipient_user_id = \$2/);
    expect(sql).toMatch(/LIMIT \$3/);
    expect(params).toEqual(['a@b.com', 'users/x', 7]);
  });

  test('returns empty counts when both email and userId are missing', async () => {
    const result = await getReceivedStats({});
    expect(result.total).toBe(0);
    expect(pool.query).not.toHaveBeenCalled();
  });
});

describe('getRecentVerbatims', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns rows with all expected fields, newest first', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [
        {
          sender_name: 'Alice',
          message: 'great work',
          value_key: 'kind',
          created_at: new Date('2026-05-01'),
          platform: 'slack',
        },
        {
          sender_name: 'Bob',
          message: 'killer demo',
          value_key: 'creative',
          created_at: new Date('2026-04-15'),
          platform: 'google-chat',
        },
      ],
    });
    const result = await getRecentVerbatims('me@x.com', 5);
    expect(result).toHaveLength(2);
    expect(result[0].sender_name).toBe('Alice');
    expect(result[0].value_name).toBe('Kind by Default');
    expect(result[0].value_emoji).toBe('💛');
  });

  test('returns empty array on no data', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const result = await getRecentVerbatims('me@x.com', 5);
    expect(result).toEqual([]);
  });

  test('passes the email and limit to the query', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    await getRecentVerbatims('jp@lkl.ai', 3);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/recipient_email = \$1/);
    expect(sql).toMatch(/ORDER BY created_at DESC/i);
    expect(sql).toMatch(/LIMIT \$2/);
    expect(params).toEqual(['jp@lkl.ai', 3]);
  });

  test('clamps limit to a sane range', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    await getRecentVerbatims('me@x.com', 999);
    expect(pool.query.mock.calls[0][1][1]).toBeLessThanOrEqual(50);
  });

  test('returns empty array for empty email', async () => {
    const result = await getRecentVerbatims('', 5);
    expect(result).toEqual([]);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('queries by user_id when given { userId }', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    await getRecentVerbatims({ userId: 'users/abc' }, 3);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/recipient_user_id = \$1/);
    expect(params).toEqual(['users/abc', 3]);
  });
});

describe('getTeamLeaderboard', () => {
  beforeEach(() => jest.clearAllMocks());

  test('joins user_identity for canonicalization and unambiguous-name fallback', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    await getTeamLeaderboard({ limit: 5 });
    const [sql] = pool.query.mock.calls[0];
    // Joins to user_identity by user_id (Slack OR Google)
    expect(sql).toMatch(/LEFT JOIN user_identity/);
    expect(sql).toMatch(/slack_user_id = k\.recipient_user_id OR ui_id\.google_user_id = k\.recipient_user_id/);
    // The unambiguous-name CTE must filter to one-email-per-name to avoid
    // false merges of two people who share a display name.
    expect(sql).toMatch(/HAVING COUNT\(DISTINCT email\) = 1/);
    // Canonical key prefers email > learned email > user_id > name
    expect(sql).toMatch(/COALESCE/);
  });

  test('returns ranked entries with name, total, top value', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [
        {
          identity_key: 'alice@x.com',
          total_n: '12',
          recipient_name: 'Alice',
          recipient_email: 'alice@x.com',
          recipient_user_id: 'UA',
          top_value: 'kind',
        },
        {
          identity_key: 'bob@x.com',
          total_n: '7',
          recipient_name: 'Bob',
          recipient_email: 'bob@x.com',
          recipient_user_id: 'UB',
          top_value: 'speed',
        },
      ],
    });

    const result = await getTeamLeaderboard({ limit: 10 });
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      name: 'Alice',
      total: 12,
      topValueKey: 'kind',
      topValueEmoji: '💛',
      topValueName: 'Kind by Default',
    });
    expect(result[1].name).toBe('Bob');
  });

  test('clamps limit to a sane range', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    await getTeamLeaderboard({ limit: 9999 });
    const [, params] = pool.query.mock.calls[0];
    expect(params[0]).toBeLessThanOrEqual(50);
  });

  test('default limit is 10', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    await getTeamLeaderboard();
    expect(pool.query.mock.calls[0][1][0]).toBe(10);
  });

  test('returns empty array when no rows', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const result = await getTeamLeaderboard({ limit: 5 });
    expect(result).toEqual([]);
  });

  test('handles missing top_value gracefully', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{
        identity_key: 'x',
        total_n: '1',
        recipient_name: 'X',
        recipient_email: '',
        recipient_user_id: 'UX',
        top_value: null,
      }],
    });
    const result = await getTeamLeaderboard({ limit: 5 });
    expect(result[0].topValueKey).toBeNull();
    expect(result[0].topValueEmoji).toBe('');
  });
});
