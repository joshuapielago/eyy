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
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add column if upgrading from previous schema
DO $$ BEGIN
  ALTER TABLE kudos ADD COLUMN IF NOT EXISTS recipient_user_id TEXT NOT NULL DEFAULT '';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_kudos_sender_email ON kudos (sender_email);
CREATE INDEX IF NOT EXISTS idx_kudos_recipient_user_id ON kudos (recipient_user_id);
CREATE INDEX IF NOT EXISTS idx_kudos_space_name ON kudos (space_name);
CREATE INDEX IF NOT EXISTS idx_kudos_created_at ON kudos (created_at);
