jest.mock('../src/shared/db', () => ({
  pool: { query: jest.fn() },
  initDb: jest.fn().mockResolvedValue(),
  saveKudos: jest.fn().mockResolvedValue({ id: 1 }),
  saveKudosBatch: jest.fn().mockResolvedValue([{ id: 1 }]),
}));

const request = require('supertest');
const { pool } = require('../src/shared/db');
const { buildApp } = require('../src/index');

describe('buildApp HTTP surface', () => {
  let app;
  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  test('GET /health returns 200 and pings the database', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ ok: 1 }] });
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(pool.query).toHaveBeenCalled();
  });

  test('GET /health returns 503 when the database is unreachable', async () => {
    pool.query.mockRejectedValueOnce(new Error('db down'));
    const res = await request(app).get('/health');
    expect(res.status).toBe(503);
    expect(res.body.status).not.toBe('ok');
  });
});
