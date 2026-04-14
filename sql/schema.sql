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
