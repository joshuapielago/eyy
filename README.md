# EYYY

A Google Chat app for peer recognition at LOKAL. Give your teammates a shoutout tied to company values, complete with celebratory GIFs.

## How it works

1. A user types `/eyy @someone` in Google Chat
2. A dialog opens to compose the recognition — pick the recipient, write a message, choose a LOKAL value
3. The app posts a rich card to the channel with the kudos, a value tagline, and a random GIF
4. Every recognition is saved to PostgreSQL for posterity

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
- **Auth:** Google OAuth2 token verification (`google-auth-library`)
- **Tests:** Jest
- **Hosting:** Railway

## Project structure

```
src/
  index.js     # Express server, event routing, dialog builder
  card.js      # Google Chat card (cardsV2) builder
  values.js    # LOKAL value definitions and utilities
  giphy.js     # Giphy API integration
  db.js        # PostgreSQL connection pool and queries
  verify.js    # Google Chat token verification
  dialog.js    # Legacy dialog format (unused)
tests/
  handler.test.js
  card.test.js
  values.test.js
  dialog.test.js
  giphy.test.js
sql/
  schema.sql   # kudos table definition
```

## Setup

### Prerequisites

- Node.js 18+
- PostgreSQL database
- [Giphy API key](https://developers.giphy.com/)
- Google Cloud project with Chat API enabled

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
GOOGLE_CHAT_AUDIENCE=https://your-domain/google-chat  # Token verification audience
```

Railway deployments also use `RAILWAY_PUBLIC_DOMAIN` to construct the webhook URL.

### Database

The `kudos` table is created automatically on startup. The schema lives in `sql/schema.sql`:

```sql
CREATE TABLE IF NOT EXISTS kudos (
  id SERIAL PRIMARY KEY,
  sender_email TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  recipient_name TEXT NOT NULL,
  message TEXT NOT NULL,
  value_key TEXT NOT NULL,
  gif_url TEXT,
  space_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Google Chat configuration

1. Create a Google Cloud project and enable the Chat API
2. Configure the app as an **HTTP endpoint** pointing to `https://your-domain/google-chat`
3. Add a slash command `/eyy` with a description like "Give someone an eyyy!"
4. Set the app visibility to your organization

## Testing

```bash
npm test
```

Runs 27 tests across handler, card, values, dialog, and giphy modules.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/google-chat` | Google Chat webhook (receives all events) |
| `GET` | `/health` | Health check — returns `{ status: "ok" }` |

## License

ISC
