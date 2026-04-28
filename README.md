# EYYY

A peer recognition app for LOKAL. Give your teammates a shoutout tied to a company value, complete with a celebratory GIF. Works in **Google Chat** and **Slack**.

## How it works

1. A user types `/eyy @someone` in Google Chat or Slack.
2. A dialog/modal opens to compose the recognition — pick the recipient, write a message, choose a LOKAL value.
3. The app posts a rich card/message to the channel with the kudos, the value tagline, and a random GIF.
4. Every recognition is saved to PostgreSQL for posterity (tagged with the originating platform).

## LOKAL Values

| Key | Value | Tagline |
|-----|-------|---------|
| `speed` | Speed Is Our Advantage | Move fast, win first |
| `talent` | Talent Everywhere | Great people come from unexpected places |
| `kind` | Kind by Default | Assume good intent, respond with grace |
| `hightech` | High Tech, High Touch | AI for efficiency, humans for excellence |
| `creative` | Radically Creative | Constraints spark our best ideas |
| `clear` | Clear as Day | If it's not clear, it's not done |
| `lead` | Lead It, Own It | Lead from your seat, own your impact |

## Tech stack

- **Runtime:** Node.js (CommonJS)
- **Server:** Express 5
- **Database:** PostgreSQL via `pg`
- **GIFs:** Giphy SDK (`@giphy/js-fetch-api`)
- **Auth:** Google OAuth2 ID-token verification (`google-auth-library`); Slack signing-secret HMAC
- **Slack API:** `@slack/web-api`
- **Tests:** Jest
- **Hosting:** Railway

## Project structure

```
src/
  index.js                            # Express app: mounts routers, /health, lifecycle
  shared/
    values.js                         # LOKAL value definitions and utilities
    giphy.js                          # Giphy API integration
    db.js                             # Postgres pool and saveKudos
    sanitize.js                       # escapeHtml, escapeSlackMrkdwn
    kudos.js                          # platform-agnostic recordKudos pipeline
  platforms/
    google-chat/
      router.js                       # POST /google-chat
      verify.js                       # Google OAuth2 token verification
      handler.js                      # event routing + submit handling
      dialog.js                       # cardsV2 dialog builder
      card.js                         # cardsV2 message builder
    slack/
      router.js                       # POST /slack/commands, /slack/interactivity
      verify.js                       # signing-secret HMAC + raw-body capture
      handler.js                      # slash command + view_submission handling
      modal.js                        # Block Kit modal builder
      message.js                      # Block Kit message builder
      client.js                       # @slack/web-api wrapper
tests/
  shared/{values,giphy,sanitize,kudos}.test.js
  google-chat/{handler,card}.test.js
  slack/{verify,modal,message,handler}.test.js
sql/
  schema.sql                          # kudos table + indexes (incl. platform column)
```

## Setup

### Prerequisites

- Node.js 18+
- PostgreSQL database
- [Giphy API key](https://developers.giphy.com/)
- A Google Cloud project with the Chat API enabled (for Google Chat)
- A Slack app with a signing secret + bot token (for Slack)

### Install and run

```bash
cp .env.example .env
# Fill in your environment variables

npm install
npm start
```

### Environment variables

```
PORT=3000                              # Server port (default: 3000)
DATABASE_URL=postgresql://localhost/eyy # PostgreSQL connection string
GIPHY_API_KEY=your_giphy_api_key       # Giphy developer API key
PUBLIC_BASE_URL=https://your-domain    # Required in production. Used to build the Google Chat dialog submit URL.
GOOGLE_CHAT_AUDIENCE=https://your-domain/google-chat  # Token verification audience
SLACK_SIGNING_SECRET=                  # Required to enable Slack
SLACK_BOT_TOKEN=xoxb-...               # Required to enable Slack
```

`PUBLIC_BASE_URL` is preferred. Railway deployments may set `RAILWAY_PUBLIC_DOMAIN` instead, which is used as a fallback.

The Slack endpoints (`/slack/commands`, `/slack/interactivity`) are only mounted when both `SLACK_SIGNING_SECRET` and `SLACK_BOT_TOKEN` are set, so Google-Chat-only deployments require no Slack config.

### Database

The `kudos` table is created (and migrated for the `platform` column) automatically on startup. The schema lives in `sql/schema.sql`:

```sql
CREATE TABLE IF NOT EXISTS kudos (
  id SERIAL PRIMARY KEY,
  sender_email TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  recipient_name TEXT NOT NULL,
  recipient_user_id TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL,
  value_key TEXT NOT NULL,
  gif_url TEXT,
  space_name TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'google-chat',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

`space_name` carries Google Chat space IDs and Slack channel IDs. `platform` distinguishes the source.

## Google Chat configuration

1. Create a Google Cloud project and enable the Chat API.
2. Configure the app as an **HTTP endpoint** pointing to `https://<PUBLIC_BASE_URL>/google-chat`.
3. Add a slash command `/eyy` with a description like "Give someone an eyyy!".
4. Set the app visibility to your organization.
5. Set `GOOGLE_CHAT_AUDIENCE` to the same URL you registered.

## Slack configuration

1. Create a Slack app at <https://api.slack.com/apps>.
2. **Bot Token Scopes** (OAuth & Permissions): `commands`, `chat:write`, `users:read`, `users:read.email`.
3. **Slash Commands** → create `/eyy` with Request URL `https://<PUBLIC_BASE_URL>/slack/commands` and Escape channels/users/groups **on**.
4. **Interactivity & Shortcuts** → enable, Request URL `https://<PUBLIC_BASE_URL>/slack/interactivity`.
5. Install the app to your workspace; invite the bot to channels where you want it to post.
6. Copy the **Signing Secret** to `SLACK_SIGNING_SECRET` and the **Bot User OAuth Token** (`xoxb-…`) to `SLACK_BOT_TOKEN`.

## Testing

```bash
npm test
```

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/google-chat` | Google Chat webhook (receives all events) |
| `POST` | `/slack/commands` | Slack slash command webhook |
| `POST` | `/slack/interactivity` | Slack interactivity webhook (modal submits) |
| `GET`  | `/health` | Health check — returns `{ status: "ok" }` |

## License

ISC
