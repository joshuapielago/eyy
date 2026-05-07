const { pool } = require('./db');

function normalizeName(name) {
  if (!name) return '';
  return String(name).trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeEmail(email) {
  if (!email) return null;
  const e = String(email).trim().toLowerCase();
  return e || null;
}

function emptyToNull(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

function mergeFields(existing, incoming) {
  // Existing values win — we never overwrite a known strong identifier.
  // Display name updates only when missing, to keep the first-observed name stable.
  return {
    email: existing.email || incoming.email,
    slack_user_id: existing.slack_user_id || incoming.slack_user_id,
    google_user_id: existing.google_user_id || incoming.google_user_id,
    display_name: existing.display_name || incoming.display_name,
    name_key: existing.name_key || incoming.name_key,
  };
}

function hasFieldConflict(row, incoming) {
  if (incoming.email && row.email && row.email !== incoming.email) return true;
  if (incoming.slack_user_id && row.slack_user_id && row.slack_user_id !== incoming.slack_user_id) return true;
  if (incoming.google_user_id && row.google_user_id && row.google_user_id !== incoming.google_user_id) return true;
  return false;
}

async function backfillKudosEmails(client, row) {
  // Once a (user_id ↔ email) link is known, fill in any prior kudos rows that
  // saved with an empty recipient_email. This makes the leaderboard's existing
  // email-based grouping see Slack and Google Chat receipts as one person.
  if (!row.email) return;
  if (row.slack_user_id) {
    await client.query(
      `UPDATE kudos
          SET recipient_email = $1
        WHERE recipient_email = ''
          AND recipient_user_id = $2`,
      [row.email, row.slack_user_id]
    );
  }
  if (row.google_user_id) {
    await client.query(
      `UPDATE kudos
          SET recipient_email = $1
        WHERE recipient_email = ''
          AND recipient_user_id = $2`,
      [row.email, row.google_user_id]
    );
  }
}

async function learnIdentity({ email, slackUserId, googleUserId, name } = {}) {
  const incoming = {
    email: normalizeEmail(email),
    slack_user_id: emptyToNull(slackUserId),
    google_user_id: emptyToNull(googleUserId),
    display_name: emptyToNull(name),
    name_key: normalizeName(name) || null,
  };

  // Need at least one strong identifier to record anything useful — a bare
  // name doesn't tell us who someone is, only that they have that name.
  const hasStrong = !!(incoming.email || incoming.slack_user_id || incoming.google_user_id);
  if (!hasStrong) return null;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const candidates = await client.query(
      `SELECT * FROM user_identity
        WHERE (email IS NOT NULL AND email = $1)
           OR (slack_user_id IS NOT NULL AND slack_user_id = $2)
           OR (google_user_id IS NOT NULL AND google_user_id = $3)
        ORDER BY id ASC
        FOR UPDATE`,
      [incoming.email, incoming.slack_user_id, incoming.google_user_id]
    );

    let primary;
    if (candidates.rows.length === 0) {
      // No strong-id match. Don't auto-merge by name during write — it's
      // tempting but causes false positives (two "Sams"). Name-based dedup
      // happens at leaderboard-read time instead.
      const inserted = await client.query(
        `INSERT INTO user_identity
           (email, slack_user_id, google_user_id, display_name, name_key)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [
          incoming.email,
          incoming.slack_user_id,
          incoming.google_user_id,
          incoming.display_name,
          incoming.name_key,
        ]
      );
      primary = inserted.rows[0];
    } else {
      // One or more existing rows match an incoming strong id. They all
      // refer to the same person — collapse them into the lowest-id row.
      primary = candidates.rows[0];
      for (let i = 1; i < candidates.rows.length; i++) {
        const dup = candidates.rows[i];
        const merged = mergeFields(primary, dup);
        primary = { ...primary, ...merged };
        await client.query('DELETE FROM user_identity WHERE id = $1', [dup.id]);
      }
      const merged = mergeFields(primary, incoming);
      const updated = await client.query(
        `UPDATE user_identity
            SET email = $2,
                slack_user_id = $3,
                google_user_id = $4,
                display_name = $5,
                name_key = $6,
                updated_at = NOW()
          WHERE id = $1
          RETURNING *`,
        [
          primary.id,
          merged.email,
          merged.slack_user_id,
          merged.google_user_id,
          merged.display_name,
          merged.name_key,
        ]
      );
      primary = updated.rows[0];
    }

    await backfillKudosEmails(client, primary);

    await client.query('COMMIT');
    return primary;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    throw err;
  } finally {
    client.release();
  }
}

async function learnFromParticipant(platform, p) {
  if (!p) return null;
  const args = {
    email: p.email,
    name: p.name,
    slackUserId: platform === 'slack' ? p.id : null,
    googleUserId: platform === 'google-chat' ? p.id : null,
  };
  try {
    return await learnIdentity(args);
  } catch (err) {
    console.error('[identity] learnIdentity failed:', err.message);
    return null;
  }
}

module.exports = {
  normalizeName,
  learnIdentity,
  learnFromParticipant,
  hasFieldConflict, // exported for tests
};
