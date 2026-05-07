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
  // When both email and userId are given (typical Google Chat invoker), match
  // EITHER. This is required because Google Chat rows save recipient_email = ''
  // and only populate recipient_user_id; an email-only WHERE would always
  // return zero results for Google Chat kudos. ORing both also lets a
  // Google-Chat invoker who has Slack-given kudos see them in their leaderboard.
  const email = identity?.email || '';
  const userId = identity?.userId || '';
  if (email && userId) {
    return {
      clause: '(recipient_email = $1 OR recipient_user_id = $2)',
      params: [email, userId],
    };
  }
  if (email) {
    return { clause: 'recipient_email = $1', params: [email] };
  }
  if (userId) {
    return { clause: 'recipient_user_id = $1', params: [userId] };
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
    where.params
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
  const limitPlaceholder = `$${where.params.length + 1}`;

  const { rows } = await pool.query(
    `SELECT sender_name, message, value_key, created_at, platform
       FROM kudos
      WHERE ${where.clause}
      ORDER BY created_at DESC
      LIMIT ${limitPlaceholder}`,
    [...where.params, safeLimit]
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

async function getTeamLeaderboard({ limit = 10 } = {}) {
  // Top N recipients by total kudos count, all-time, both platforms combined.
  // Identity_key coalesces email > user_id > name so Slack and Google Chat
  // rows for the same person merge when they share an email but stay separate
  // when only one identity field is populated.
  const safeLimit = Math.max(1, Math.min(50, Math.floor(limit) || 10));

  const { rows } = await pool.query(
    `WITH unified AS (
       SELECT
         CASE
           WHEN recipient_email <> '' THEN recipient_email
           WHEN recipient_user_id <> '' THEN recipient_user_id
           ELSE recipient_name
         END AS identity_key,
         recipient_name,
         recipient_email,
         recipient_user_id,
         value_key
       FROM kudos
       WHERE recipient_email <> '' OR recipient_user_id <> '' OR recipient_name <> ''
     ),
     totals AS (
       SELECT identity_key, COUNT(*) AS total_n
       FROM unified
       GROUP BY identity_key
       ORDER BY total_n DESC
       LIMIT $1
     ),
     by_value AS (
       SELECT
         u.identity_key,
         u.value_key,
         COUNT(*) AS n,
         ROW_NUMBER() OVER (PARTITION BY u.identity_key ORDER BY COUNT(*) DESC) AS rn
       FROM unified u
       WHERE u.identity_key IN (SELECT identity_key FROM totals)
       GROUP BY u.identity_key, u.value_key
     ),
     names AS (
       SELECT DISTINCT ON (identity_key)
         identity_key,
         recipient_name,
         recipient_email,
         recipient_user_id
       FROM unified
       WHERE identity_key IN (SELECT identity_key FROM totals)
         AND recipient_name <> ''
     )
     SELECT
       t.identity_key,
       t.total_n,
       n.recipient_name,
       n.recipient_email,
       n.recipient_user_id,
       (SELECT value_key FROM by_value WHERE identity_key = t.identity_key AND rn = 1) AS top_value
     FROM totals t
     LEFT JOIN names n ON n.identity_key = t.identity_key
     ORDER BY t.total_n DESC`,
    [safeLimit]
  );

  return rows.map((r) => {
    const value = VALUES[r.top_value];
    return {
      identityKey: r.identity_key,
      name: r.recipient_name || r.identity_key,
      email: r.recipient_email || '',
      userId: r.recipient_user_id || '',
      total: Number(r.total_n) || 0,
      topValueKey: r.top_value || null,
      topValueEmoji: value?.emoji || '',
      topValueName: value?.name || '',
    };
  });
}

module.exports = { getReceivedStats, getRecentVerbatims, getTeamLeaderboard };
