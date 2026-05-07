# EYYY: Leaderboard, Prefill, and Multi-Recipient — Design

**Date:** 2026-05-07
**Status:** Draft for review
**Scope:** Three coordinated features delivered together across Slack and Google Chat.

---

## 1. Goals

Add three capabilities to EYYY without compromising the platform-agnostic core:

1. **`/eyy leaderboard`** — public, in-channel personal stats: a radar chart of received kudos against the seven LOKAL values, plus the last five verbatim kudos messages.
2. **Prefill** — `/eyy @user free-form text` opens the kudos modal with the recipient and message pre-populated.
3. **Multi-recipient** — modal-only ability to send one kudos to multiple teammates at once.

These features are coupled because they share parsing, identity resolution, and rendering work. Shipping them together avoids re-touching the same files three times.

## 2. Non-goals

- Backfilling existing Google Chat kudos with recipient emails. Historic rows have empty `recipient_email`; they remain invisible to the leaderboard. Cutover-forward accuracy only.
- A web-based leaderboard or aggregated team stats. This is per-user, in-chat only.
- Editing or deleting kudos.
- Cross-platform identity merging (a user with both Slack and Google Chat accounts gets separate leaderboards if they invoke from each).
- Time-window filtering (this-month vs all-time). v1 is all-time only.

## 3. Settled decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | Both Slack and Google Chat in v1 | User chose feature parity over phased rollout. |
| 2 | Radar = kudos *received* per LOKAL value | Most legible meaning of "stats." Pairs naturally with verbatims as "things people said about you." |
| 3 | Leaderboard posts publicly in-channel | User chose public to encourage culture-of-recognition energy. Inherits the same `bot-must-be-in-channel` constraint as the existing kudos card. |
| 4 | QuickChart.io image URL with text-bar fallback | Real radar geometry without server-side rendering. Free third-party dep with a graceful failure mode. |
| 5a | Subcommand routing on first token | `/eyy leaderboard` is the only subcommand; everything else is kudos. Predictable and easy to extend later. |
| 5b | Lenient prefill parser | First mention anywhere = recipient (stripped); rest = message. Forgiving of conversational order. |
| 6 | Multi-recipient via modal only | Slash command stays single-line; multi-select happens in the dialog where it has UI affordance. |
| 7 | Full Google Chat identity overhaul | Switch from free-text recipient to mention-aware input; resolve `<users/N>` via `chat.users.get`. |

## 4. Architecture

### File layout

```
src/
  shared/
    stats.js              # NEW — getReceivedStats(email), getRecentVerbatims(email, n)
    commands.js           # NEW — parseSlashCommand(text, opts) → {kind, recipientIds, message}
    quickchart.js         # NEW — buildRadarUrl(counts), formatTextBars(counts)
    db.js                 # CHANGE — add saveKudosBatch(rows[])
  platforms/
    slack/
      handler.js          # CHANGE — branch on parseSlashCommand kind
      modal.js            # CHANGE — multi_users_select; initial_value on message input
      message.js          # CHANGE — render multi-recipient kudos
      leaderboard.js      # NEW — Block Kit renderer for radar + verbatims
    google-chat/
      handler.js          # CHANGE — branch on parseSlashCommand kind
      dialog.js           # CHANGE — recipient becomes mention-aware; multi-mention support
      card.js             # CHANGE — render multi-recipient kudos
      leaderboard.js      # NEW — cardsV2 renderer for radar + verbatims
      identity.js         # NEW — resolveUser(id), resolveUsers(ids), parseUserMentions(text)
sql/
  schema.sql              # CHANGE — add kudos_group_id column + leaderboard indexes
tests/
  shared/{stats,commands,quickchart}.test.js                  # NEW
  google-chat/{leaderboard,identity}.test.js                  # NEW
  google-chat/{handler,dialog}.test.js                        # CHANGE — multi-recipient + leaderboard branches
  slack/{leaderboard}.test.js                                 # NEW
  slack/{handler,modal,message}.test.js                       # CHANGE — multi-recipient + leaderboard branches
```

### Why parsing lives in `shared/`

The parsing rules (lenient first-mention extraction, `leaderboard` subcommand detection) are identical across platforms. The only platform difference is the mention syntax (`<@U123|name>` vs `<users/123>`), which is injected as a regex parameter:

```js
parseSlashCommand(text, { mentionRegex: /<@([UW][A-Z0-9]+)(?:\|[^>]*)?>/ })   // Slack
parseSlashCommand(text, { mentionRegex: /<users\/([^>]+)>/ })                   // Google Chat
```

Each platform handler owns the regex; the parser owns the logic.

### Why `leaderboard.js` is per-platform

The QuickChart URL and the verbatim selection are shared. The card/message structure (Block Kit `image_block` + `section` blocks vs cardsV2 `image` widget + `decoratedText` widgets) is platform-native. Splitting matches the existing `dialog.js` / `modal.js` precedent.

## 5. Request lifecycles

### 5.1 `/eyy leaderboard`

```
1. User runs `/eyy leaderboard` in any channel/space the bot can post to.
2. Platform handler calls parseSlashCommand → { kind: "leaderboard" }.
3. Resolve invoker email:
     • Slack: client.users.info(payload.user_id).profile.email
     • Google Chat: event.user.email (already in token-verified payload)
4. stats.getReceivedStats(email) and stats.getRecentVerbatims(email, 5) fire in parallel.
5. If counts.total === 0:
     - Send ephemeral "No kudos received yet — keep being awesome 🤙" to invoker.
     - Stop. No public post.
6. quickchart.buildRadarUrl(counts) → URL.
7. Platform leaderboard.js assembles message:
     - Header: "EYYY leaderboard for <SenderName>"
     - Image block: QuickChart URL
     - Verbatims section: 5 quoted lines, each "<value emoji> "<message>" — <SenderName>"
     - Optional small footer: "<total> total · spans <platforms> · since <oldest_date>"
8. Post publicly via chat.postMessage / space message.
9. If post fails (channel access), send invoker ephemeral: "Couldn't post here — try /invite @EYYY first."
```

### 5.2 `/eyy @user message text`

```
1. parseSlashCommand("<@U123|ky> thanks for the demo")
   → { kind: "kudos", recipientIds: ["U123"], message: "thanks for the demo" }
2. Open modal/dialog:
     • Slack: views.open with multi_users_select.initial_users = ["U123"], message initial_value = "thanks..."
     • Google Chat: pushCard with mention-aware textInput value seeded to the parsed text
3. User adjusts (adds recipients, edits, picks value), submits.
4. Submit handler resolves all recipient IDs to {id, name, email} in parallel.
5. Generate kudos_group_id (UUID v4).
6. saveKudosBatch — N rows in one transaction, all sharing kudos_group_id, message, value_key, sender, gif_url.
7. Build combined card (one mention list, one message body, one value tagline, one GIF).
8. chat.postMessage / space message.
```

### 5.3 Multi-recipient in Slack

- Modal: `users_select` → `multi_users_select` with `max_selected_items: 10`.
- On submit: `view.state.values[recipient_block].recipient_action.selected_users` is a `string[]` of user IDs.
- Loop `users.info` in parallel; collect `{id, name, email}`.
- Combined message: `"<@U1> <@U2> <@U3> — eyyyy from <@SENDER>! <message> · <value tagline> · <GIF>"`.

### 5.4 Multi-recipient in Google Chat

- cardsV2 has no native multi-user picker. The recipient input stays a `textInput`, but its semantics change: the user types `@` and Google Chat's compose UI inserts mentions, which arrive in `argumentText` as `<users/N>` tokens.
- `identity.parseUserMentions(text)` returns ordered, deduplicated array of user IDs.
- `identity.resolveUsers(ids)` calls `chat.users.get` per ID in parallel; tolerates partial failure.
- For unresolved IDs: keep `recipient_user_id`, set `recipient_email = ''` and `recipient_name = ''`. Post still uses raw `<users/N>` mention tokens (Google Chat renders these as `@username` regardless).

## 6. Data model

### Schema changes

```sql
ALTER TABLE kudos
  ADD COLUMN IF NOT EXISTS kudos_group_id UUID;

CREATE INDEX IF NOT EXISTS kudos_recipient_value_idx
  ON kudos (recipient_email, value_key)
  WHERE recipient_email <> '';

CREATE INDEX IF NOT EXISTS kudos_recipient_recent_idx
  ON kudos (recipient_email, created_at DESC)
  WHERE recipient_email <> '';
```

The partial-index predicate `recipient_email <> ''` matches the leaderboard query shape and skips legacy Google Chat rows.

### `src/shared/stats.js`

```js
async function getReceivedStats(email) {
  // Returns: { counts: { speed: 0, talent: 0, kind: 0, hightech: 0,
  //                      creative: 0, clear: 0, lead: 0 },
  //            total: <integer> }
  // Always returns all 7 keys (zero-filled). Empty input → all zeros, total 0.
}

async function getRecentVerbatims(email, limit = 5) {
  // Returns: [{ sender_name, message, value_key, value_name,
  //             created_at, platform }, ...]
  // Newest first. Empty array on no data.
}
```

Implementation queries:

```sql
-- getReceivedStats
SELECT value_key, COUNT(*) AS n
FROM kudos
WHERE recipient_email = $1
GROUP BY value_key;

-- getRecentVerbatims
SELECT sender_name, message, value_key, created_at, platform
FROM kudos
WHERE recipient_email = $1
ORDER BY created_at DESC
LIMIT $2;
```

### `src/shared/db.js` extension

```js
async function saveKudosBatch(rows) {
  // rows: array of {senderEmail, senderName, recipientEmail, recipientName,
  //                 recipientUserId, message, valueKey, gifUrl, spaceName,
  //                 platform, kudosGroupId}.
  // Inserts in a single transaction; returns array of {id} in input order.
  // Caller passes kudosGroupId; if null, db generates one shared across the batch.
}
```

**Single-recipient unification.** The existing `saveKudos` becomes a thin wrapper around `saveKudosBatch([row])`, so all kudos go through one write path. Single-recipient kudos still get a `kudos_group_id` (a fresh UUID per submit), which is harmless and keeps schema reasoning uniform. Existing call sites in `src/shared/kudos.js` and the per-platform handlers continue to call `saveKudos` — no caller-facing change for single-recipient flows.

## 7. QuickChart integration

### URL build

```js
const config = {
  type: 'radar',
  data: {
    labels: ['Speed', 'Talent', 'Kind', 'High Tech', 'Creative', 'Clear', 'Lead'],
    datasets: [{
      label: senderName,
      data: [counts.speed, counts.talent, counts.kind, counts.hightech,
             counts.creative, counts.clear, counts.lead],
      backgroundColor: 'rgba(255, 165, 0, 0.3)',
      borderColor: 'rgba(255, 165, 0, 1)',
    }],
  },
  options: {
    scale: { ticks: { beginAtZero: true, stepSize: 1 } },
    legend: { display: false },
  },
};
const url = `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(config))}&w=500&h=500`;
```

### Fallback formatter

When QuickChart fails (timeout >2s, non-image content-type, or 5xx), the leaderboard renderer substitutes a text-bar block:

```
🟦🟦🟦🟦🟦🟦🟦🟦 Kind by Default · 8
🟦🟦🟦🟦🟦 Speed Is Our Advantage · 5
🟦🟦🟦 Radically Creative · 3
🟦🟦 Lead It, Own It · 2
🟦 Talent Everywhere · 1
   High Tech, High Touch · 0
   Clear as Day · 0
```

(Each block represents one kudos; max 10 blocks rendered, with a "+N more" suffix beyond that.)

### Probe-before-post

The leaderboard renderer issues a `HEAD` request to the QuickChart URL with a 1.5s timeout before posting:

- **HEAD returns 200 with `image/*` content-type** → embed the URL in an image block. Slack/Google Chat fetch the actual image at render time.
- **HEAD times out, returns non-2xx, or returns a non-image content-type** → skip the image block, render the text-bar formatter inline instead. The post still goes out, the user gets meaningful data, the failure is logged.

This adds one ~50ms (cache-hit) or ~500ms (cache-miss) request to the leaderboard latency path, which is acceptable given the leaderboard isn't latency-sensitive. The probe means the user never sees a broken-image placeholder — either the chart renders cleanly or the text bars do.

## 8. Slash command parsing rules

`parseSlashCommand(text, { mentionRegex })` returns:

```ts
type Result =
  | { kind: 'leaderboard' }
  | { kind: 'kudos', recipientIds: string[], message: string }
```

### Rules

1. Trim whitespace from `text`.
2. If first non-whitespace token (case-insensitive) is `leaderboard`, return `{ kind: 'leaderboard' }`.
3. Otherwise, find ALL matches of `mentionRegex` in order:
   - First match's user ID → `recipientIds[0]`.
   - That match (and any whitespace immediately around it) is removed from the message.
   - Remaining matches stay in the message text — the modal can decide whether to use them. (v1: only first is used as a recipient.)
4. Collapse internal whitespace runs in the message to single spaces; trim ends.
5. Truncate message to 3000 chars (Slack `plain_text_input` max) with a single "…" suffix if longer.

### Edge cases

| Input | Result |
|---|---|
| `""` | `{ kind: 'kudos', recipientIds: [], message: '' }` |
| `"leaderboard"` | `{ kind: 'leaderboard' }` |
| `"Leaderboard"` | `{ kind: 'leaderboard' }` (case-insensitive) |
| `"leaderboard share"` | `{ kind: 'kudos', recipientIds: [], message: 'leaderboard share' }` (only the lone `leaderboard` token routes; trailing text stays as kudos) |
| `"<@U1\|alice> thanks"` | `{ kind: 'kudos', recipientIds: ['U1'], message: 'thanks' }` |
| `"thanks <@U1\|alice> for the demo"` | `{ kind: 'kudos', recipientIds: ['U1'], message: 'thanks for the demo' }` |
| `"<@U1\|alice> and <@U2\|bob> for the demo"` | `{ kind: 'kudos', recipientIds: ['U1'], message: 'and <@U2\|bob> for the demo' }` (only first is extracted as recipient; remaining mention stays in message text — modal can decide) |
| `"thanks everyone"` | `{ kind: 'kudos', recipientIds: [], message: 'thanks everyone' }` |

## 9. Error handling matrix

The "make it great regardless of issues" principle: every failure has a defined user-visible behavior.

| Scenario | Behavior |
|---|---|
| QuickChart times out / 5xx (with optional probe enabled) | Render text-bar block instead. User sees no failure. Log warning. |
| QuickChart returns non-image | Same as timeout. |
| QuickChart 200 but slow image load on client | Tolerated. v1 no probe; broken-image placeholder if image truly fails. |
| Invoker has 0 received kudos | Ephemeral "No kudos received yet — keep being awesome 🤙". Stop, no public post. |
| Invoker has 1–2 kudos | Render normally. The shape *is* the message. |
| Slack `users.info` fails for invoker | Log error; ephemeral "Couldn't load your stats — try again in a moment." Stop. |
| Slack `chat.postMessage` returns `not_in_channel` / `channel_not_found` | DB write already done. Send invoker ephemeral: "Saved your kudos but couldn't post here — `/invite @EYYY` to this channel." |
| Google Chat identity lookup fails for one recipient in a multi-recipient submit | Save row with `recipient_email = ''`. Skip the failed user from leaderboard counts. Post the message normally with raw `<users/N>` tokens (Google Chat renders these as `@username`). Send invoker an ephemeral notice listing unresolved users (if any). |
| All recipients unresolvable in Google Chat | Save rows with empty emails. Post message anyway. Invoker still gets feedback that the kudos was sent. |
| Google Chat scope missing for `chat.users.get` | First failed call logs a critical error. Behavior degrades to "all recipients unresolvable" path above. Operator fixes scope and re-deploys. |
| Slash command text exceeds 3000 chars | Truncate at 3000 with "…" suffix. User sees full intent in modal — they can re-edit. |
| User selects themselves as recipient | Allowed without warning. Self-recognition is valid. |
| User submits modal with empty recipients (multi-select empty) | Slack Block Kit input validation marks the block invalid; modal stays open. |
| User submits modal with empty message | Same — input validation. |
| Duplicate submit (network retry) | Each submit generates a new `kudos_group_id`. Duplicates create duplicate rows. v1 accepts this — dedup logic without a session token is more risk than reward. |
| `/eyy` invoked in a DM with the bot | Allowed. Posts in DM. |
| `/eyy leaderboard` invoked in a DM | Allowed. Posts in DM. The "ephemeral" empty-state still resolves to a normal DM message. |

## 10. Testing approach

| Layer | New tests | Modified tests |
|---|---|---|
| `tests/shared/commands.test.js` | All 8 edge cases from § 8, both regex flavors | — |
| `tests/shared/stats.test.js` | Zero-fill, ordering, limit, empty input | — |
| `tests/shared/quickchart.test.js` | URL encoding correctness, text-bar formatter | — |
| `tests/shared/db.test.js` (or extend `kudos.test.js`) | `saveKudosBatch` returns IDs in order, all share group_id | — |
| `tests/google-chat/identity.test.js` | Mention parsing, dedup, order; `resolveUser` mock fail/success/partial | — |
| `tests/google-chat/leaderboard.test.js` | Card structure snapshot, empty-state path | — |
| `tests/google-chat/handler.test.js` | — | Add leaderboard branch + multi-recipient submit |
| `tests/google-chat/dialog.test.js` | — | Mention-aware recipient input |
| `tests/slack/leaderboard.test.js` | Block Kit structure snapshot, empty-state path | — |
| `tests/slack/handler.test.js` | — | Add leaderboard branch + multi-recipient submit (group_id assertion) |
| `tests/slack/modal.test.js` | — | `multi_users_select`, message `initial_value` |
| `tests/slack/message.test.js` | — | Multi-recipient mention list rendering |

External services (`@slack/web-api`, Google Chat API, QuickChart) are mocked. The existing tests already follow this pattern — extend, don't rebuild.

## 11. Rollout sequence

1. Schema migration (additive — new column + new indexes; safe online).
2. `src/shared/{stats,commands,quickchart}.js` + tests.
3. Google Chat `identity.js` + tests. Validate scope by deploying and running `/eyy @someone` in a test space.
4. Multi-recipient extension to `db.js` + `handler.js` (both platforms).
5. `leaderboard.js` per platform + handler dispatch.
6. Slack manifest update? **No** — `chat:write` already covers leaderboard posts. Google Chat scope: **yes** — confirm `chat.bot` is sufficient for `chat.users.get`, request additional scope if needed.
7. Smoke test: `/eyy @someone test` (single), `/eyy @a @b @c test` (multi), `/eyy leaderboard` (zero-state and populated states).
8. Deploy to Railway via `railway redeploy` after env vars and source config are confirmed.

## 12. Open questions for review

- **Self-leaderboard in DMs**: posting publicly in a DM with the bot means only the user sees it anyway. Effectively private. Acceptable behavior per § 9, but flag in case the team wants `/eyy leaderboard` in a DM to also be posted-publicly-elsewhere.
- **`max_selected_items` for multi_users_select**: 10 is a soft choice. Higher means thank-the-team broadcasts; lower keeps the message readable. Confirm 10 is fine.
- **QuickChart styling**: chart colors (orange theme) are placeholder. Brand alignment can come later — v1 ships with sensible defaults.
- **Google Chat `chat.users.get` scope**: needs validation that the existing OAuth scope reaches that endpoint. If not, this design assumes we add `https://www.googleapis.com/auth/chat.bot` (or successor); a minor manifest/scope change before rollout.
- **Google Chat dialog @-mention behavior**: this design assumes the Google Chat compose UI's `@`-mention picker activates inside a `textInput` widget within a dialog and produces `<users/N>` tokens in the submitted form value. This is the standard behavior in Google Chat *messages*, but dialog-input mention support deserves verification before lock-in. If it doesn't work, fallback is to keep the recipient as free-text input plus a separate "User ID" optional field, or to require the user to compose in the message bar (not the dialog) — both worse UX. Validate during the early implementation phase.
