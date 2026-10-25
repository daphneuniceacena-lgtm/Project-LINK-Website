-- ════════════════════════════════════════════════════════════════════
-- PROJECT LINK — Cloudflare D1 Schema
-- Mirrors the old Google Sheets tabs 1:1 so the migration is lossless.
-- Run with:  wrangler d1 execute link-db --remote --file=schema.sql
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS users (
  username TEXT PRIMARY KEY,
  password TEXT NOT NULL,
  role     TEXT NOT NULL DEFAULT 'student',   -- staff roles: 'council' or 'admin' (SWC)
  name     TEXT,
  initial  TEXT,
  avatar   TEXT DEFAULT ''                    -- profile picture URL (uploaded via the Worker)
);

CREATE TABLE IF NOT EXISTS posts (
  id         TEXT PRIMARY KEY,
  author     TEXT,
  initial    TEXT,
  role       TEXT,
  org        TEXT,
  time       TEXT,
  badge      TEXT,
  heading    TEXT,
  text       TEXT,
  media_urls TEXT DEFAULT '[]',   -- JSON array string, same as MediaURLs before
  video_url  TEXT DEFAULT '',
  img_layout TEXT DEFAULT 'auto',
  avatar_pic TEXT DEFAULT '',
  likes      INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS carousel (
  id      TEXT PRIMARY KEY,
  type    TEXT DEFAULT 'photo',
  src     TEXT,
  caption TEXT DEFAULT '',
  time    TEXT
);

CREATE TABLE IF NOT EXISTS concerns (
  id         TEXT PRIMARY KEY,
  date       TEXT,
  student_no TEXT DEFAULT '',
  name       TEXT,
  category   TEXT,
  urgency    TEXT,
  concern    TEXT,
  file_url   TEXT DEFAULT '',
  anonymous  TEXT DEFAULT 'No',
  status     TEXT DEFAULT 'Received',
  user       TEXT DEFAULT '',
  archived   INTEGER DEFAULT 0,               -- 1 = hidden from the public board, kept for records
  created_at INTEGER DEFAULT (unixepoch())
);

-- No Google Form anymore, so we add submitEval so the frontend/a simple
-- form can write here directly. Existing GetEvals shape is unchanged.
CREATE TABLE IF NOT EXISTS evals (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp   TEXT,
  event       TEXT,
  rating      TEXT,
  enjoyed     TEXT,
  improvement TEXT,
  comment     TEXT,
  name        TEXT
);

CREATE TABLE IF NOT EXISTS appointments (
  id         TEXT PRIMARY KEY,
  date       TEXT,
  time       TEXT,
  student_no TEXT DEFAULT '',
  email      TEXT DEFAULT '',
  name       TEXT,
  category   TEXT,
  concern    TEXT,
  status     TEXT DEFAULT 'Pending',
  archived   INTEGER DEFAULT 0,               -- 1 = archived by the SWC; frees the time slot
  created_at INTEGER DEFAULT (unixepoch())
);
-- Speeds up the "is this date/time already booked?" check done on every
-- booking attempt (see handleBookAppointment in worker.js).
CREATE INDEX IF NOT EXISTS idx_appointments_date_time ON appointments(date, time);

CREATE TABLE IF NOT EXISTS resources (
  id          TEXT PRIMARY KEY,
  name        TEXT,
  url         TEXT,
  date        TEXT,
  uploaded_by TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS team (
  type        TEXT NOT NULL,          -- 'member' (Council members)
  key         TEXT NOT NULL,          -- matches frontend MEMBERS "i"
  photo       TEXT DEFAULT '',
  description TEXT DEFAULT '',
  updated_by  TEXT DEFAULT '',
  updated_at  TEXT,
  PRIMARY KEY (type, key)
);

-- One row per (post, voter): each voter can like a post once. Created
-- automatically on first use too, so running this is optional.
CREATE TABLE IF NOT EXISTS post_likes (
  post_id    TEXT NOT NULL,
  voter      TEXT NOT NULL,
  created_at INTEGER DEFAULT (unixepoch()),
  PRIMARY KEY (post_id, voter)
);

-- Request counters for the Worker's rate limiter (created automatically on
-- first use too, so running this is optional).
CREATE TABLE IF NOT EXISTS rate_limits (
  k            TEXT PRIMARY KEY,
  count        INTEGER NOT NULL,
  window_start INTEGER NOT NULL
);

-- Staff login sessions. Only a SHA-256 hash of the random token is stored,
-- so a leaked database does not leak usable session tokens.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  username   TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(username);

-- Makes double-booking impossible even if two students click at the same
-- instant. (If you already have duplicate active bookings, resolve those
-- first or this statement will fail; the Worker still checks in code.)
DROP INDEX IF EXISTS uq_active_slot;
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_slot_v2
  ON appointments(date, time) WHERE status IN ('Booked','Pending') AND archived = 0;

-- Lasallian Insights events, managed by the Council. (The Worker also creates
-- this table and seeds the original four events on first use.)
CREATE TABLE IF NOT EXISTS events (
  id          TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  description TEXT DEFAULT '',
  link        TEXT DEFAULT '',
  qr          TEXT DEFAULT '',
  archived    INTEGER DEFAULT 0,
  sort_order  INTEGER DEFAULT 0,
  created_at  INTEGER DEFAULT (unixepoch())
);

-- Guidance counselors (edited by the SWC) are NOT created here on purpose:
-- the Worker creates the `counselors` table itself on first use and seeds the
-- original five (keeping any photo/description already saved for them).

-- Editable page content (currently the "About SWC" tab, key 'about_swc').
CREATE TABLE IF NOT EXISTS site_content (
  k          TEXT PRIMARY KEY,
  value      TEXT DEFAULT '',
  updated_by TEXT DEFAULT '',
  updated_at TEXT
);

-- Dates / times the SWC marked unavailable. time = '' means the whole day.
CREATE TABLE IF NOT EXISTS unavailable_slots (
  id         TEXT PRIMARY KEY,
  date       TEXT NOT NULL,
  time       TEXT NOT NULL DEFAULT '',
  reason     TEXT DEFAULT '',
  created_by TEXT DEFAULT '',
  created_at INTEGER DEFAULT (unixepoch())
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_unavailable_date_time ON unavailable_slots(date, time);

-- NO default admin/password is seeded any more (a default login in a public
-- repo is the first thing attackers try). Create staff accounts with the
-- commands in README → "Setting staff passwords". Passwords you set there
-- as plain text are converted to a salted hash automatically at first login.
