# Self-hosting EYYY

Run your own EYYY for your Slack and/or Google Chat workspace. **You host it** —
no third-party servers, no sign-up, your data stays in your database.

One deployment serves one workspace. Slack and Google Chat are both optional —
enable either or both.

## 1. Prerequisites

- **Node 20+** (or Docker)
- A **PostgreSQL** database
- A public **HTTPS URL** for your deployment (Slack & Google Chat call it)
- *(optional)* a [Giphy API key](https://developers.giphy.com/) for GIFs

## 2. Get the code and define your values

```bash
git clone https://github.com/joshuapielago/eyy.git
cd eyy
npm install

# Your values, taglines, emojis, and GIFs — no code changes needed:
cp eyy.config.example.json eyy.config.json
$EDITOR eyy.config.json

# Your environment (secrets + connection settings):
cp .env.example .env
$EDITOR .env        # set DATABASE_URL, PUBLIC_BASE_URL, GIPHY_API_KEY, EYY_CONFIG_PATH
```

In `eyy.config.json`, each value's GIF can be a **search** (`"mode": "search"`,
random Giphy result from your terms) or a **fixed link** (`"mode": "url"`, always
sends that exact GIF/image — bring your own).

## 3. Run it

**Node:**
```bash
npm start
```

**Docker:**
```bash
docker build -t eyyy .
docker run -p 3000:3000 --env-file .env \
  -v "$(pwd)/eyy.config.json:/app/eyy.config.json" eyyy
```

The database schema is created automatically on first start. Verify:
`curl https://YOUR_DOMAIN/health` → `{"status":"ok"}`.

> Any Node host works (Railway, Render, Fly.io, a VM). Point the platform at your
> public URL and set the env vars there.

## 4. Connect Slack (optional)

1. <https://api.slack.com/apps> → **Create New App** → **From a manifest**.
2. Paste [`deploy/slack-app-manifest.yaml`](deploy/slack-app-manifest.yaml),
   replacing every `YOUR_DOMAIN` with your public host.
3. **Install to Workspace**, then copy into your `.env` and redeploy:
   - **Signing Secret** → `SLACK_SIGNING_SECRET`
   - **Bot User OAuth Token** (`xoxb-…`) → `SLACK_BOT_TOKEN`
4. Invite the bot to a channel and run `/eyy @teammate great work`.

## 5. Connect Google Chat (optional)

1. In a Google Cloud project, **enable the Google Chat API**.
2. Configure the Chat app as an **HTTP endpoint**: `https://YOUR_DOMAIN/google-chat`.
3. Add a slash command `/eyy`.
4. Set `GOOGLE_CHAT_AUDIENCE` to that same URL in your `.env` and redeploy.

## 6. Customize anytime

Edit `eyy.config.json` and restart — values and GIFs are read at startup. Secrets
(`GIPHY_API_KEY`, bot tokens, `DATABASE_URL`) always live in env vars, never in the
config file.
