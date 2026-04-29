const { Pool } = require('pg');

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

async function saveKudos({
  platform,
  senderEmail,
  senderName,
  recipientEmail,
  recipientName,
  recipientUserId,
  message,
  valueKey,
  gifUrl,
  spaceName,
}) {
  const result = await pool.query(
    `INSERT INTO kudos (sender_email, sender_name, recipient_email, recipient_name, recipient_user_id, message, value_key, gif_url, space_name, platform)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id`,
    [
      senderEmail,
      senderName,
      recipientEmail,
      recipientName,
      recipientUserId || '',
      message,
      valueKey,
      gifUrl,
      spaceName,
      platform || 'google-chat',
    ]
  );
  return result.rows[0];
}

module.exports = { pool, initDb, saveKudos };
