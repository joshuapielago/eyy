const { pool } = require('./db');
const { listValueDefs, getValueDef } = require('./config');

const MAX_VERBATIMS = 50;

function emptyCounts() {
  return listValueDefs().reduce((acc, v) => {
    acc[v.key] = 0;
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
    const value = getValueDef(r.value_key);
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
  //
  // Identity resolution is layered: a kudos row's canonical key prefers its
  // own recipient_email, then a learned email via user_identity (matched by
  // slack_user_id or google_user_id), then a learned email by unambiguous
  // exact name match, then a learned email by unambiguous *substring* name
  // match (so "Kissa" bridges to "Norkissa" when one display name is a
  // longer/shorter form of the other), then user_id, then a normalized name.
  // The unambiguous-name and loose-name CTEs both guard with HAVING
  // COUNT(DISTINCT email) = 1 so two people who happen to share or contain
  // the same token never get merged.
  const safeLimit = Math.max(1, Math.min(50, Math.floor(limit) || 10));

  const { rows } = await pool.query(
    `WITH name_index AS (
       SELECT name_key, MIN(email) AS email
         FROM user_identity
        WHERE email IS NOT NULL AND name_key IS NOT NULL
        GROUP BY name_key
       HAVING COUNT(DISTINCT email) = 1
     ),
     loose_name AS (
       SELECT k.name_key, MIN(u.email) AS email
         FROM (SELECT DISTINCT LOWER(BTRIM(recipient_name)) AS name_key
                 FROM kudos
                WHERE recipient_name <> ''
                  AND LENGTH(BTRIM(recipient_name)) >= 4) k
         JOIN user_identity u
           ON u.email IS NOT NULL
          AND u.name_key IS NOT NULL
          AND LENGTH(u.name_key) >= 4
          AND k.name_key <> u.name_key
          AND (POSITION(k.name_key IN u.name_key) > 0
               OR POSITION(u.name_key IN k.name_key) > 0)
        GROUP BY k.name_key
       HAVING COUNT(DISTINCT u.email) = 1
     ),
     resolved AS (
       SELECT
         k.recipient_name,
         k.recipient_email,
         k.recipient_user_id,
         k.value_key,
         COALESCE(
           NULLIF(k.recipient_email, ''),
           ui_id.email,
           ni.email,
           ln.email,
           NULLIF(k.recipient_user_id, ''),
           NULLIF(LOWER(BTRIM(k.recipient_name)), '')
         ) AS identity_key
       FROM kudos k
       LEFT JOIN user_identity ui_id
         ON k.recipient_user_id <> ''
        AND (ui_id.slack_user_id = k.recipient_user_id OR ui_id.google_user_id = k.recipient_user_id)
        AND ui_id.email IS NOT NULL
       LEFT JOIN name_index ni
         ON k.recipient_name <> ''
        AND ni.name_key = LOWER(BTRIM(k.recipient_name))
       LEFT JOIN loose_name ln
         ON k.recipient_name <> ''
        AND ln.name_key = LOWER(BTRIM(k.recipient_name))
       WHERE k.recipient_email <> '' OR k.recipient_user_id <> '' OR k.recipient_name <> ''
     ),
     totals AS (
       SELECT identity_key, COUNT(*) AS total_n
         FROM resolved
        WHERE identity_key IS NOT NULL
        GROUP BY identity_key
        ORDER BY total_n DESC
        LIMIT $1
     ),
     by_value AS (
       SELECT
         r.identity_key,
         r.value_key,
         COUNT(*) AS n,
         ROW_NUMBER() OVER (PARTITION BY r.identity_key ORDER BY COUNT(*) DESC) AS rn
       FROM resolved r
       WHERE r.identity_key IN (SELECT identity_key FROM totals)
       GROUP BY r.identity_key, r.value_key
     ),
     names AS (
       SELECT DISTINCT ON (identity_key)
         identity_key,
         recipient_name,
         recipient_email,
         recipient_user_id
       FROM resolved
       WHERE identity_key IN (SELECT identity_key FROM totals)
         AND recipient_name <> ''
       ORDER BY identity_key,
         CASE WHEN recipient_email <> '' THEN 0 ELSE 1 END,
         CASE WHEN recipient_user_id <> '' THEN 0 ELSE 1 END,
         recipient_name
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
    const value = getValueDef(r.top_value);
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
