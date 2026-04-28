# Build a Basecamp → Slack bridge in `joshuapielago/Judoflip`

Self-contained handoff. Paste this into the first prompt of a new `judoflip` Claude session that has push access to `joshuapielago/Judoflip`.

## Context

We're replacing [enjoyfieldtrip.com](https://enjoyfieldtrip.com) (Field Trip by Union Code), a paid SaaS that forwards Basecamp activity into Slack. LOKAL wants to drop the dependency and own a small in-house replacement. Decisions already made:

- **New repo** — `joshuapielago/Judoflip` (already created, empty).
- **Slack only** — no Google Chat target.
- **Single workspace** — hard-coded for LOKAL. No signup, billing, or multi-tenancy.
- **All Basecamp event types** — subscribe to everything, format everything.

## How Field Trip works (theory)

1. Basecamp 3/4 supports outgoing webhooks per-project ([bc3-api docs](https://github.com/basecamp/bc3-api/blob/master/sections/webhooks.md)).
2. On every event (`message_created`, `comment_created`, `todo_completed`, `schedule_entry_created`, `document_created`, `upload_created`, `kanban_card_*`, `vault_*`, etc.) Basecamp `POST`s JSON: `{ id, kind, details, created_at, recording, creator }`.
3. The integration is the URL that receives that POST — it looks up which Slack channel maps to the originating Basecamp project, formats the payload into a Slack message, and posts it.
4. Reliability: Basecamp retries up to 10× with exponential backoff. Only 2xx counts as delivered. **No HMAC** — auth has to be a hard-to-guess URL token.

That's the whole moat. The replacement is ~300 lines of Node.

## Architecture

```
Basecamp project ──POST──▶ /basecamp/webhook?token=… ──▶ format(kind, payload) ──▶ Slack channel
   (webhook URL)            (Express, Railway)            (Block Kit blocks)        (incoming webhook URL)
```

- **Slack delivery:** per-channel **incoming webhook URLs**, not a Slack app + bot token. Single workspace = no OAuth needed.
- **Project → channel mapping:** JSON env var `BASECAMP_PROJECT_MAP` mapping Basecamp `bucket_id` → Slack incoming-webhook URL. Reload requires redeploy.
- **Auth:** shared secret in URL query (`?token=…`), checked on every request. Basecamp doesn't sign payloads.
- **Storage:** none for v1. Add a Postgres `deliveries` audit table later if needed.
- **Hosting:** Railway.

## File layout

```
package.json
.env.example
README.md
src/
  index.js     # Express server, POST /basecamp/webhook, GET /health
  config.js    # Env parsing: WEBHOOK_TOKEN, BASECAMP_PROJECT_MAP
  format.js    # kind → Slack Block Kit blocks; generic fallback
  slack.js     # POST to incoming webhook URL (built-in fetch)
tests/
  format.test.js   # one fixture per event kind
  index.test.js    # token check, unknown project, happy path (slack mocked)
fixtures/
  message_created.json
  comment_created.json
  todo_completed.json
  …            # captured from Basecamp's "Recent deliveries" UI
```

Dependencies: `express`, `html-to-text`, `jest` (dev). Use built-in `fetch` (Node 18+).

## Implementation notes

- **`src/format.js`** is the meat. Switch on `payload.kind`. Each branch returns `{ text, blocks }`. Helpers: `recordingUrl(payload)`, `creatorLine(payload)`, `truncate(html→text, 280)`. Always include a generic fallback that posts `kind` + creator + recording link so unknown event types still surface in Slack.
- **`src/slack.js`** is one function: `postToSlack(webhookUrl, message)` — `fetch(url, { method:'POST', body: JSON.stringify(message) })`. Treat non-2xx as an error and log; don't retry — Basecamp will retry us.
- **`src/index.js`** validates the token, reads `payload.bucket?.id` (or `payload.recording.bucket.id`), looks up the channel, calls `format()`, calls `postToSlack()`, returns 200. On unknown bucket: log and 200 (don't make Basecamp retry forever).
- **HTML stripping:** Basecamp content fields are Trix HTML. Use `html-to-text` to convert to mrkdwn-friendly text.
- **Tests:** save 5–10 real payloads as fixtures. Assert each renders non-empty `text` and the expected blocks shape.

## Setup / rollout

1. `npm init`, install deps, scaffold files per layout above.
2. Capture real Basecamp webhook payloads (Basecamp UI shows last 25 deliveries per webhook).
3. Write Jest tests against fixtures.
4. Deploy to Railway.
5. In Slack: create one **Incoming Webhook** per channel that should receive Basecamp activity.
6. Set Railway env vars:
   - `WEBHOOK_TOKEN=<long-random>`
   - `BASECAMP_PROJECT_MAP={"12345678":"https://hooks.slack.com/services/…","87654321":"…"}`
7. In Basecamp, per project: **Set up tools → Webhooks → New webhook**, URL `https://judoflip.up.railway.app/basecamp/webhook?token=<WEBHOOK_TOKEN>`, leave types unchecked (= all).
8. Trigger a test event → confirm it lands in Slack.

## Verification

- **Unit:** `npm test` — every fixture renders without throwing; blocks have correct shape.
- **Smoke (post-deploy):** `curl -X POST 'https://…/basecamp/webhook?token=…' -H 'Content-Type: application/json' -d @fixtures/message_created.json` → 200 + Slack post.
- **Negative:** wrong token → 401. Unknown bucket → 200 + log line, no Slack post.
- **End-to-end:** post a message in a mapped Basecamp project, expect Slack message within ~1 minute.

## Out of scope for v1

- No web UI, no signup, no Stripe.
- No per-channel filtering of event types (channel gets everything from its project).
- No multi-tenant DB, no team admin.
- No Basecamp 2 support — only 3/4.

## References

- [Basecamp 3 webhook contract](https://github.com/basecamp/bc3-api/blob/master/sections/webhooks.md)
- [Slack incoming webhooks](https://api.slack.com/messaging/webhooks)
- [Slack Block Kit](https://api.slack.com/block-kit)
- [Field Trip — Union Code blog post (2017)](https://medium.com/unioncode/field-trip-connecting-basecamp-and-slack-since-2017-c27bea3a1de7)
