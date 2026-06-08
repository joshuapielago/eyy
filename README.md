# EYYY 🤙

A self-hosted **peer-recognition (kudos) bot** for **Slack** and **Google Chat**.
Teammates give each other a shoutout tied to one of *your* company values, with a
celebratory GIF — posted right in the channel.

You run it yourself: clone, set your values, deploy, connect your workspace.
Nothing is sent to a third party; your data lives in your own database.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/joshuapielago/eyy)

> **New here? → Read [SETUP.md](SETUP.md) for the full step-by-step.**

## Features

- **Slack and Google Chat** from one codebase (enable either or both)
- **Your own values** — define them in a config file, no code changes
- **Your own GIFs** — your Giphy key, your search terms, or a fixed link per value
- **Leaderboards** — a personal radar chart + a team ranking (`/eyy leaderboard`)
- **Multi-recipient** kudos, cross-platform identity matching, Postgres-backed history

## How it works

1. A user types `/eyy @someone` in Slack or Google Chat.
2. A modal/dialog opens — pick recipients, write a message, choose a value.
3. The bot posts a rich card with the kudos, the value, and a GIF.
4. Every recognition is stored in PostgreSQL (tagged by platform).

### Slash command flavors

- `/eyy` — open an empty modal
- `/eyy @ky` — modal with `@ky` pre-selected
- `/eyy @ky thanks for the demo` — pre-selected recipient + pre-filled message
- `/eyy leaderboard` — post the team leaderboard
- `/eyy me` — your personal radar chart of kudos received

## Customize your values & GIFs

Copy [`eyy.config.example.json`](eyy.config.example.json) to `eyy.config.json`,
edit it, and set `EYY_CONFIG_PATH=./eyy.config.json`. Each value has a name,
emoji, tagline, and a GIF that is either a Giphy **search** or a fixed **link**:

```json
{
  "brandName": "EYYY",
  "values": [
    { "key": "teamwork", "name": "Team Player", "emoji": "🤝", "tagline": "We win together",
      "gif": { "mode": "search", "terms": ["teamwork", "high five"] } },
    { "key": "kindness", "name": "Kind by Default", "emoji": "💛", "tagline": "Assume good intent",
      "gif": { "mode": "url", "url": "https://media.giphy.com/media/your-own.gif" } }
  ],
  "giphy": { "rating": "pg" }
}
```

Secrets (Giphy key, bot tokens, DB URL) stay in environment variables — never in
this file. With no config file, a neutral built-in starter set is used.

## Deploy

Each deployment serves one workspace. Options:

- **Render** — click the button above (provisions the app + a free Postgres).
- **Docker** — `docker build -t eyyy . && docker run -p 3000:3000 --env-file .env eyyy`
- **Any Node host** (Railway, Fly.io, a VM) — `npm ci && npm start`.

See [SETUP.md](SETUP.md) for connecting Slack (a ready-to-paste app manifest lives
in [`deploy/slack-app-manifest.yaml`](deploy/slack-app-manifest.yaml)) and Google Chat.

## Configuration (environment variables)

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `PUBLIC_BASE_URL` | prod | Public HTTPS URL of this deployment |
| `EYY_CONFIG_JSON` | no | Inline JSON config — easiest on PaaS; wins over `EYY_CONFIG_PATH` |
| `EYY_CONFIG_PATH` | no | Path to your `eyy.config.json` file (else built-in defaults) |
| `GIPHY_API_KEY` | no | Your Giphy key (no key → no search GIFs) |
| `DATABASE_SSL` | no | `disable` \| `require` \| `verify` (default auto-detects managed hosts) |
| `SLACK_SIGNING_SECRET` + `SLACK_BOT_TOKEN` | for Slack | Enables the Slack endpoints |
| `GOOGLE_CHAT_AUDIENCE` | for Google Chat | The endpoint URL used as the token audience |
| `PORT` | no | Server port (default 3000) |
| `NODE_ENV` | no | `production`; `development` skips signature/token checks locally |

The database schema is created automatically on first start.

## Tech stack

Node.js (CommonJS) · Express 5 · PostgreSQL (`pg`) · Giphy (`@giphy/js-fetch-api`) ·
`@slack/web-api` · `google-auth-library` · Jest.

## Project structure

```
src/
  index.js                  # Express app: routers, /health, lifecycle
  shared/
    config.js               # operator config engine (values + GIFs)
    values.js               # built-in default value set (sample)
    kudos.js                # platform-agnostic recordKudos pipeline
    giphy.js  db.js  stats.js  identity.js  quickchart.js  sanitize.js  commands.js
  platforms/
    slack/        router · verify · handler · modal · message · leaderboard · client
    google-chat/  router · verify · handler · dialog · card · leaderboard · identity
deploy/slack-app-manifest.yaml   # paste-to-create Slack app
eyy.config.example.json          # your-values template
sql/schema.sql                   # kudos + user_identity tables
```

## Testing

```bash
npm test
```

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/google-chat` | Google Chat webhook |
| `POST` | `/slack/commands` | Slack slash command |
| `POST` | `/slack/interactivity` | Slack modal submits |
| `GET`  | `/health` | Health check (pings the DB; 503 if down) |

## License

ISC
