-- Accounts. password_hash is empty for Google-only accounts.
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  name text NOT NULL DEFAULT '',
  password_hash text,
  google_sub text UNIQUE,
  verified boolean NOT NULL DEFAULT false,
  avatar_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Everything the app syncs, one row per item. `collection` is the kind of item, `key` is the
-- app's own id for it and `data` is the item as JSON.
CREATE TABLE items (
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  collection text NOT NULL,
  key text NOT NULL,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, collection, key)
);

-- Progress photos and profile pictures.
CREATE TABLE files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  key text NOT NULL,
  content_type text NOT NULL,
  data bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, key)
);
