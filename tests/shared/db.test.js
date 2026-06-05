const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
};
const mockPool = {
  connect: jest.fn().mockResolvedValue(mockClient),
  query: jest.fn(),
};

jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => mockPool),
}));

const { saveKudos, saveKudosBatch, resolveSslConfig } = require('../../src/shared/db');

describe('resolveSslConfig', () => {
  const orig = process.env.DATABASE_SSL;
  afterEach(() => {
    if (orig === undefined) delete process.env.DATABASE_SSL;
    else process.env.DATABASE_SSL = orig;
  });

  test('DATABASE_SSL=disable turns SSL off regardless of host', () => {
    process.env.DATABASE_SSL = 'disable';
    expect(resolveSslConfig('postgres://x.railway.app/db')).toBe(false);
  });

  test('DATABASE_SSL=verify enforces full certificate verification', () => {
    process.env.DATABASE_SSL = 'verify';
    expect(resolveSslConfig('postgres://host/db')).toEqual({ rejectUnauthorized: true });
  });

  test('DATABASE_SSL=require uses TLS without certificate verification', () => {
    process.env.DATABASE_SSL = 'require';
    expect(resolveSslConfig('postgres://host/db')).toEqual({ rejectUnauthorized: false });
  });

  test('default: managed Railway hosts get TLS without cert verification (back-compat)', () => {
    delete process.env.DATABASE_SSL;
    expect(resolveSslConfig('postgres://u:p@x.railway.app:5432/db')).toEqual({ rejectUnauthorized: false });
    expect(resolveSslConfig('postgres://u:p@x.rlwy.net:5432/db')).toEqual({ rejectUnauthorized: false });
  });

  test('default: local/other hosts get no SSL', () => {
    delete process.env.DATABASE_SSL;
    expect(resolveSslConfig('postgres://localhost:5432/eyy')).toBe(false);
    expect(resolveSslConfig('')).toBe(false);
    expect(resolveSslConfig(undefined)).toBe(false);
  });
});

const baseRow = {
  senderEmail: 's@x.com',
  senderName: 'Sender',
  recipientEmail: 'r@x.com',
  recipientName: 'Recipient',
  recipientUserId: 'U2',
  message: 'great',
  valueKey: 'speed',
  gifUrl: 'https://giphy/x.gif',
  spaceName: 'C123',
  platform: 'slack',
};

describe('saveKudosBatch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockClient.query.mockReset();
  });

  test('returns empty array for empty input', async () => {
    const result = await saveKudosBatch([]);
    expect(result).toEqual([]);
    expect(mockPool.connect).not.toHaveBeenCalled();
  });

  test('inserts one row in a transaction with a generated group_id', async () => {
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 42 }] }) // INSERT
      .mockResolvedValueOnce({}); // COMMIT

    const result = await saveKudosBatch([baseRow]);

    expect(result).toEqual([{ id: 42 }]);
    expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');

    const insertCall = mockClient.query.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('INSERT INTO kudos')
    );
    expect(insertCall).toBeTruthy();
    const params = insertCall[1];
    // Last param is the group ID — should be a UUID string.
    expect(params[params.length - 1]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });

  test('uses the same group_id across all rows in a batch', async () => {
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: 2 }] })
      .mockResolvedValueOnce({ rows: [{ id: 3 }] })
      .mockResolvedValueOnce({}); // COMMIT

    await saveKudosBatch([baseRow, baseRow, baseRow]);

    const insertCalls = mockClient.query.mock.calls.filter(
      (c) => typeof c[0] === 'string' && c[0].includes('INSERT INTO kudos')
    );
    expect(insertCalls).toHaveLength(3);
    const groupIds = insertCalls.map((c) => c[1][c[1].length - 1]);
    expect(new Set(groupIds).size).toBe(1);
  });

  test('uses caller-provided kudosGroupId when supplied', async () => {
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockResolvedValueOnce({}); // COMMIT

    const myGroup = '00000000-1111-2222-3333-444444444444';
    await saveKudosBatch([baseRow], { kudosGroupId: myGroup });

    const insertCall = mockClient.query.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('INSERT INTO kudos')
    );
    const params = insertCall[1];
    expect(params[params.length - 1]).toBe(myGroup);
  });

  test('rolls back on error and rethrows', async () => {
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockRejectedValueOnce(new Error('boom')); // INSERT fails

    await expect(saveKudosBatch([baseRow])).rejects.toThrow('boom');
    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mockClient.release).toHaveBeenCalled();
  });

  test('releases the client even on success', async () => {
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockResolvedValueOnce({}); // COMMIT

    await saveKudosBatch([baseRow]);
    expect(mockClient.release).toHaveBeenCalled();
  });
});

describe('saveKudos (legacy single-row API)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockClient.query.mockReset();
  });

  test('returns the single inserted row id', async () => {
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 99 }] })
      .mockResolvedValueOnce({}); // COMMIT

    const result = await saveKudos(baseRow);
    expect(result).toEqual({ id: 99 });
  });
});
