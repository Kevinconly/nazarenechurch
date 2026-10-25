CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  email_normalized TEXT NOT NULL UNIQUE CHECK (email_normalized = lower(trim(email_normalized))),
  password_hash TEXT NOT NULL CHECK (password_hash LIKE '$2%'),
  role TEXT NOT NULL CHECK (role IN ('Contributor', 'Editor', 'Administrator')),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS users_role_active_idx ON users (role, active);

CREATE TABLE IF NOT EXISTS auth_sessions (
  sid VARCHAR(64) NOT NULL PRIMARY KEY,
  sess JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL
);

CREATE INDEX IF NOT EXISTS auth_sessions_expire_idx ON auth_sessions (expire);
