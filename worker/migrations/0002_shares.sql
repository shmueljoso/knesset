-- קישורי שיתוף: כנסת מהעורך / תרחיש שמישהו שלח לחבר
CREATE TABLE IF NOT EXISTS shares (
  code TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  data TEXT NOT NULL,
  user_id TEXT,
  created_at INTEGER NOT NULL
);
