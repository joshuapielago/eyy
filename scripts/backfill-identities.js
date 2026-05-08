#!/usr/bin/env node
// Hydrate the user_identity table from existing kudos rows.
//
// The dedup logic in stats.js's getTeamLeaderboard relies on user_identity
// to bridge the Slack vs Google Chat split. New kudos populate it on the fly
// (kudos.js -> learnAll), but rows written before the dedup feature shipped
// only contributed to user_identity when the same person later sent or
// invoked /eyy. Anyone who has only RECEIVED kudos since the deploy still
// has no identity row, which is why "two CJs" or "Norkissa/Kissa" can stay
// split on the leaderboard.
//
// Idempotent: re-running collapses any duplicate rows via learnIdentity's
// existing FOR UPDATE / merge logic. Safe to run repeatedly.
//
// Usage: railway run --service=eyy-app node scripts/backfill-identities.js

const { pool } = require('../src/shared/db');
const { learnIdentity } = require('../src/shared/identity');

async function loadDistinct(sql) {
  const { rows } = await pool.query(sql);
  return rows;
}

async function processBatch(label, rows, mapArgs) {
  let learned = 0;
  let skipped = 0;
  let failed = 0;
  for (const row of rows) {
    const args = mapArgs(row);
    try {
      const result = await learnIdentity(args);
      if (result) learned += 1;
      else skipped += 1;
    } catch (err) {
      failed += 1;
      console.error(`[backfill] ${label} failed for`, args, ':', err.message);
    }
  }
  console.log(`[backfill] ${label}: total=${rows.length} learned=${learned} skipped=${skipped} failed=${failed}`);
}

(async () => {
  console.log('[backfill] starting');

  // Slack recipients carry the strongest signal: email + slack_user_id + name.
  // DISTINCT ON keeps the earliest row per email so display_name stays stable.
  const slackRecipients = await loadDistinct(`
    SELECT DISTINCT ON (LOWER(BTRIM(recipient_email)))
      recipient_email AS email,
      recipient_user_id AS slack_user_id,
      recipient_name AS name
    FROM kudos
    WHERE platform = 'slack'
      AND recipient_email <> ''
    ORDER BY LOWER(BTRIM(recipient_email)), id ASC
  `);
  await processBatch('slack recipients', slackRecipients, (r) => ({
    email: r.email,
    slackUserId: r.slack_user_id || null,
    name: r.name,
  }));

  // Slack senders carry email + name only (kudos doesn't store sender_user_id).
  // Useful for hydrating name_index entries for senders who never received.
  const slackSenders = await loadDistinct(`
    SELECT DISTINCT ON (LOWER(BTRIM(sender_email)))
      sender_email AS email,
      sender_name AS name
    FROM kudos
    WHERE platform = 'slack'
      AND sender_email <> ''
    ORDER BY LOWER(BTRIM(sender_email)), id ASC
  `);
  await processBatch('slack senders', slackSenders, (r) => ({
    email: r.email,
    name: r.name,
  }));

  // Google Chat senders: email + name (sender_user_id not in kudos).
  const gcSenders = await loadDistinct(`
    SELECT DISTINCT ON (LOWER(BTRIM(sender_email)))
      sender_email AS email,
      sender_name AS name
    FROM kudos
    WHERE platform = 'google-chat'
      AND sender_email <> ''
    ORDER BY LOWER(BTRIM(sender_email)), id ASC
  `);
  await processBatch('google chat senders', gcSenders, (r) => ({
    email: r.email,
    name: r.name,
  }));

  // Google Chat recipients: google_user_id + name, no email. These rows seed
  // a google_user_id-keyed entry that future write-time learnings (when the
  // same user finally sends or invokes /eyy) will merge against by id, then
  // backfill kudos.recipient_email automatically.
  const gcRecipients = await loadDistinct(`
    SELECT DISTINCT ON (recipient_user_id)
      recipient_user_id AS google_user_id,
      recipient_name AS name
    FROM kudos
    WHERE platform = 'google-chat'
      AND recipient_user_id <> ''
    ORDER BY recipient_user_id, id ASC
  `);
  await processBatch('google chat recipients', gcRecipients, (r) => ({
    googleUserId: r.google_user_id,
    name: r.name,
  }));

  console.log('[backfill] done');
  await pool.end();
})().catch(async (err) => {
  console.error('[backfill] fatal:', err);
  try { await pool.end(); } catch {}
  process.exit(1);
});
