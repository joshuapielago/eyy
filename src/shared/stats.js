const { pool } = require('./db');
const { VALUES } = require('./values');

const VALUE_KEYS = Object.keys(VALUES);
const MAX_VERBATIMS = 50;

function emptyCounts() {
  return VALUE_KEYS.reduce((acc, k) => {
    acc[k] = 0;
    return acc;
  }, {});
}

function buildIdentityClause(identity) {
  if (identity?.email) {
    return { clause: 'recipient_email = $1', param: identity.email };
  }
  if (identity?.userId) {
    return { clause: 'recipient_user_id = $1', param: identity.userId };
  }
  return null;
}

async function getReceivedStats(identity) {
  // Accept either string (legacy email) or { email, userId } object.
  const id = typeof identity === 'string' ? { email: identity } : identity;
  const where = buildIdentityClause(id);
  if (!where) return { counts: emptyCounts(), total: 0 };

  const { rows } = await pool.query(
    `SELECT value_key, COUNT(*) AS n
       FROM kudos
      WHERE ${where.clause}
      GROUP BY value_key`,
    [where.param]
  );

  const counts = emptyCounts();
  let total = 0;
  for (const row of rows) {
    if (counts[row.value_key] === undefined) continue;
    const n = Number(row.n) || 0;
    counts[row.value_key] = n;
    total += n;
  }
  return { counts, total };
}

async function getRecentVerbatims(identity, limit = 5) {
  const id = typeof identity === 'string' ? { email: identity } : identity;
  const where = buildIdentityClause(id);
  if (!where) return [];

  const safeLimit = Math.max(1, Math.min(MAX_VERBATIMS, Math.floor(limit) || 5));

  const { rows } = await pool.query(
    `SELECT sender_name, message, value_key, created_at, platform
       FROM kudos
      WHERE ${where.clause}
      ORDER BY created_at DESC
      LIMIT $2`,
    [where.param, safeLimit]
  );

  return rows.map((r) => {
    const value = VALUES[r.value_key];
    return {
      sender_name: r.sender_name,
      message: r.message,
      value_key: r.value_key,
      value_name: value?.name || r.value_key,
      value_emoji: value?.emoji || '',
      created_at: r.created_at,
      platform: r.platform,
    };
  });
}

module.exports = { getReceivedStats, getRecentVerbatims };
