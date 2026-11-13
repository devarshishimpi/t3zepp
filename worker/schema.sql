-- D1 schema for T3 Zepp multi-account persistent device keys and pairing sessions

CREATE TABLE IF NOT EXISTS devices (
  device_key TEXT PRIMARY KEY,
  t3_base_url TEXT NOT NULL,
  t3_access_token TEXT NOT NULL,
  label TEXT DEFAULT 'My T3 Code',
  created_at INTEGER NOT NULL,
  last_used_at INTEGER,
  request_count INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS pairing_sessions (
  pairing_code TEXT PRIMARY KEY,
  device_key TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  claimed INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (device_key) REFERENCES devices(device_key) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_devices_last_used ON devices(last_used_at);
CREATE INDEX IF NOT EXISTS idx_pairing_expires ON pairing_sessions(expires_at);

CREATE TABLE IF NOT EXISTS pairing_rate_limits (
  bucket_key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  window_ends_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pairing_rate_limits_expiry ON pairing_rate_limits(window_ends_at);
