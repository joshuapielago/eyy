const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('railway')
    ? { rejectUnauthorized: false }
    : false,
});

async function initDb() {
  const schema = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'sql', 'schema.sql'),
    'utf8'
  );
  await pool.query(schema);
}

async function saveKudos({ senderEmail, senderName, recipientEmail, recipientName, message, valueKey, gifUrl, spaceName }) {
  const result = await pool.query(
    `INSERT INTO kudos (sender_email, sender_name, recipient_email, recipient_name, message, value_key, gif_url, space_name)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [senderEmail, senderName, recipientEmail, recipientName, message, valueKey, gifUrl, spaceName]
  );
  return result.rows[0];
}

module.exports = { pool, initDb, saveKudos };
