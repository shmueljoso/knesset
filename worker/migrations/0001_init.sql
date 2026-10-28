-- המשכן – מסד הנתונים ב-Cloudflare D1 (SQLite).
-- מוחל עם: npx wrangler d1 migrations apply hamishkan --remote

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE COLLATE NOCASE,
  pass_hash TEXT,
  salt TEXT,
  anonymous INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL UNIQUE COLLATE NOCASE CHECK (length(display_name) BETWEEN 2 AND 24)
);

CREATE TABLE IF NOT EXISTS cloud_saves (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slot TEXT NOT NULL CHECK (length(slot) BETWEEN 1 AND 40),
  name TEXT NOT NULL,
  player TEXT NOT NULL,
  week INTEGER NOT NULL,
  career_id TEXT NOT NULL DEFAULT '',
  data TEXT NOT NULL,
  gz INTEGER NOT NULL DEFAULT 1,
  bytes INTEGER NOT NULL DEFAULT 0,
  client_version TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, slot)
);

CREATE TABLE IF NOT EXISTS scores (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  career_id TEXT NOT NULL,
  player_name TEXT NOT NULL,
  total INTEGER NOT NULL CHECK (total BETWEEN 0 AND 1000),
  peak INTEGER NOT NULL,
  impact INTEGER NOT NULL,
  country INTEGER NOT NULL,
  standing INTEGER NOT NULL,
  peak_label TEXT NOT NULL DEFAULT '',
  ending TEXT NOT NULL DEFAULT '',
  years REAL NOT NULL DEFAULT 0,
  laws INTEGER NOT NULL DEFAULT 0,
  pm_week INTEGER,
  scenario TEXT NOT NULL DEFAULT '',
  challenge TEXT,
  edited INTEGER NOT NULL DEFAULT 0,
  client_version TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, career_id)
);
CREATE INDEX IF NOT EXISTS scores_total ON scores(edited, total DESC);
CREATE INDEX IF NOT EXISTS scores_challenge ON scores(challenge, total DESC);
