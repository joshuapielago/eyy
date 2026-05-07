jest.mock('../../src/shared/db', () => ({
  pool: { query: jest.fn() },
}));

const { pool } = require('../../src/shared/db');
const { getReceivedStats, getRecentVerbatims } = require('../../src/shared/stats');

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

  test('queries by email when both email and userId given (email wins)', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    await getReceivedStats({ email: 'a@b.com', userId: 'users/x' });
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/recipient_email = \$1/);
    expect(params).toEqual(['a@b.com']);
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
