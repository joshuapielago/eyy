const { Pool } = require('pg');
const { randomUUID } = require('crypto');

// SSL config is env-driven so customers can enforce full certificate
// verification (DATABASE_SSL=verify) when their managed Postgres provides a CA,
// while the default preserves the current Railway-compatible behavior.
//   disable -> no TLS
//   require -> TLS, no cert verification
//   verify  -> TLS with full cert verification
//   (unset) -> TLS-without-verify for managed Railway hosts, off otherwise
function resolveSslConfig(databaseUrl = '') {
  const mode = process.env.DATABASE_SSL;
  if (mode === 'disable') return false;
  if (mode === 'verify') return { rejectUnauthorized: true };
  if (mode === 'require') return { rejectUnauthorized: false };

  const url = databaseUrl || '';
  if (url.includes('.railway.app') || url.includes('.rlwy.net')) {
    return { rejectUnauthorized: false };
  }
  return false;
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: resolveSslConfig(process.env.DATABASE_URL),
  max: Number(process.env.DB_POOL_MAX) || 10,
  idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS) || 30000,
  connectionTimeoutMillis: Number(process.env.DB_CONNECT_TIMEOUT_MS) || 5000,
});

async function initDb() {
  const schema = require('fs').readFileSync(
    require('path').join(__dirname, '..', '..', 'sql', 'schema.sql'),
    'utf8'
  );
  await pool.query(schema);
}

const INSERT_SQL = `
  INSERT INTO kudos (
    sender_email, sender_name,
    recipient_email, recipient_name, recipient_user_id,
    message, value_key, gif_url, space_name, platform, kudos_group_id
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
  RETURNING id
`;

async function saveKudosBatch(rows, { kudosGroupId } = {}) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const groupId = kudosGroupId || randomUUID();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ids = [];
    for (const row of rows) {
      const result = await client.query(INSERT_SQL, [
        row.senderEmail,
        row.senderName,
        row.recipientEmail,
        row.recipientName,
        row.recipientUserId || '',
        row.message,
        row.valueKey,
        row.gifUrl,
        row.spaceName,
        row.platform || 'google-chat',
        groupId,
      ]);
      ids.push({ id: result.rows[0].id });
    }
    await client.query('COMMIT');
    return ids;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    throw err;
  } finally {
    client.release();
  }
}

async function saveKudos(row) {
  const [result] = await saveKudosBatch([row]);
  return result;
}

module.exports = { pool, initDb, saveKudos, saveKudosBatch, resolveSslConfig };
