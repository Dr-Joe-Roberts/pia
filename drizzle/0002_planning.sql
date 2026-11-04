CREATE TABLE pia_preferences (
  user_id TEXT PRIMARY KEY NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  data_json TEXT NOT NULL,
  last_backup_at TEXT
);
CREATE TABLE pia_notifications (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  task_id TEXT,
  created_at TEXT NOT NULL,
  read_at TEXT,
  PRIMARY KEY (user_id, id)
);
CREATE INDEX pia_notifications_user ON pia_notifications(user_id, created_at);
ALTER TABLE files ADD COLUMN object_key TEXT;
