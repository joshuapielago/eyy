const { Pool } = require('pg');
const { randomUUID } = require('crypto');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('.railway.app')
    ? { rejectUnauthorized: false }
    : false,
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

module.exports = { pool, initDb, saveKudos, saveKudosBatch };
