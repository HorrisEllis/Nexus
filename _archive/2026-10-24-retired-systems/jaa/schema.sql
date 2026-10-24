-- ═══════════════════════════════════════════════════════════════════════════
-- Guardian v8 — Schema
-- Jaa SQL DDL  (run via Jaa FileStore / SQLite-compatible)
-- SISO-compliant: every table has UUID + hook fields
-- §2.1 persistence is golden rule — nothing stored in temp
-- ═══════════════════════════════════════════════════════════════════════════

-- ── sessions ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
  id           TEXT PRIMARY KEY,          -- uuid
  chat_id      TEXT NOT NULL,             -- from URL
  chat_url     TEXT NOT NULL,
  provider     TEXT NOT NULL,             -- claude | chatgpt | gemini
  account      TEXT,                      -- email or hostname
  name         TEXT,                      -- session name (from greeting)
  token_total  INTEGER DEFAULT 0,
  started_ts   INTEGER NOT NULL,
  updated_ts   INTEGER NOT NULL,
  meta         TEXT DEFAULT '{}'          -- JSON blob
);

CREATE INDEX IF NOT EXISTS idx_sessions_chat_id  ON sessions(chat_id);
CREATE INDEX IF NOT EXISTS idx_sessions_provider ON sessions(provider);
CREATE INDEX IF NOT EXISTS idx_sessions_account  ON sessions(account);

-- ── artifacts ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS artifacts (
  id           TEXT PRIMARY KEY,          -- uuid
  hash         TEXT NOT NULL UNIQUE,      -- content hash
  name         TEXT NOT NULL DEFAULT 'artifact',
  type         TEXT NOT NULL DEFAULT 'code_block',
  lang         TEXT,
  content      TEXT NOT NULL,
  context      TEXT,                      -- surrounding message snippet
  chat_url     TEXT NOT NULL,
  chat_id      TEXT NOT NULL,
  account      TEXT,
  job_id       TEXT,
  session_id   TEXT,
  direction    TEXT DEFAULT 'output',     -- output | input
  provider     TEXT DEFAULT 'claude',
  seen_count   INTEGER DEFAULT 1,
  ts           INTEGER NOT NULL,
  last_seen    INTEGER NOT NULL,
  tags         TEXT DEFAULT '[]',         -- JSON array
  meta         TEXT DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_artifacts_hash     ON artifacts(hash);
CREATE INDEX IF NOT EXISTS idx_artifacts_chat_id  ON artifacts(chat_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_lang     ON artifacts(lang);
CREATE INDEX IF NOT EXISTS idx_artifacts_ts       ON artifacts(ts);
CREATE INDEX IF NOT EXISTS idx_artifacts_account  ON artifacts(account);
CREATE INDEX IF NOT EXISTS idx_artifacts_session  ON artifacts(session_id);

-- Full-text search index (if SQLite FTS5 available)
-- CREATE VIRTUAL TABLE IF NOT EXISTS artifacts_fts USING fts5(name, content, lang, tokenize='porter ascii');

-- ── gaps ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gaps (
  id           TEXT PRIMARY KEY,
  type         TEXT NOT NULL,             -- GAP_TYPE enum
  domain       TEXT,                      -- DOMAIN enum
  reason       TEXT,                      -- GAP_REASON enum
  description  TEXT,
  score        REAL NOT NULL DEFAULT 0.5, -- 0.0–1.0 magnitude
  status       TEXT DEFAULT 'open',       -- open | narrowing | widening | closed | ignored
  job_id       TEXT,
  chat_id      TEXT,
  session_id   TEXT,
  account      TEXT,
  provider     TEXT,
  evidence     TEXT DEFAULT '{}',         -- JSON: what triggered this gap
  opened_ts    INTEGER NOT NULL,
  closed_ts    INTEGER,
  meta         TEXT DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_gaps_chat_id  ON gaps(chat_id);
CREATE INDEX IF NOT EXISTS idx_gaps_type     ON gaps(type);
CREATE INDEX IF NOT EXISTS idx_gaps_domain   ON gaps(domain);
CREATE INDEX IF NOT EXISTS idx_gaps_status   ON gaps(status);
CREATE INDEX IF NOT EXISTS idx_gaps_score    ON gaps(score);

-- ── ledger_entries ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ledger_entries (
  id           TEXT PRIMARY KEY,
  ledger_type  TEXT NOT NULL,             -- upgrade | idea | event
  category     TEXT NOT NULL,             -- UPGRADE | IDEA | EVENT | GAP | SYSTEM | INPUT | OUTPUT
  msg          TEXT NOT NULL,
  chat_url     TEXT,
  chat_id      TEXT,
  account      TEXT,
  provider     TEXT,
  job_id       TEXT,
  session_id   TEXT,
  source       TEXT DEFAULT 'guardian',   -- guardian-ws | guardian-userscript | cli | api
  meta         TEXT DEFAULT '{}',         -- JSON
  proof        TEXT,                      -- JSON: for upgrades
  ts           INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ledger_category  ON ledger_entries(category);
CREATE INDEX IF NOT EXISTS idx_ledger_chat_id   ON ledger_entries(chat_id);
CREATE INDEX IF NOT EXISTS idx_ledger_ts        ON ledger_entries(ts);
CREATE INDEX IF NOT EXISTS idx_ledger_account   ON ledger_entries(account);

-- ── timeline_events ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS timeline_events (
  id           TEXT PRIMARY KEY,
  channel      TEXT NOT NULL,             -- SISO channel/event type
  person_id    TEXT,                      -- account or session_id
  pair_id      TEXT,                      -- for relational events
  chat_id      TEXT,
  session_id   TEXT,
  payload      TEXT NOT NULL DEFAULT '{}',-- JSON
  ts           INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_timeline_channel   ON timeline_events(channel);
CREATE INDEX IF NOT EXISTS idx_timeline_person_id ON timeline_events(person_id);
CREATE INDEX IF NOT EXISTS idx_timeline_ts        ON timeline_events(ts);

-- ── jobs ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS jobs (
  id           TEXT PRIMARY KEY,
  provider     TEXT NOT NULL,
  command      TEXT,
  prompt       TEXT,
  response     TEXT,
  status       TEXT DEFAULT 'pending',    -- pending | delivered | streaming | complete | failed
  chat_url     TEXT,
  chat_id      TEXT,
  account      TEXT,
  session_id   TEXT,
  chars        INTEGER DEFAULT 0,
  gap_count    INTEGER DEFAULT 0,
  token_est    INTEGER DEFAULT 0,
  source       TEXT DEFAULT 'guardian',
  started_ts   INTEGER NOT NULL,
  completed_ts INTEGER,
  meta         TEXT DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_jobs_status   ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_provider ON jobs(provider);
CREATE INDEX IF NOT EXISTS idx_jobs_ts       ON jobs(started_ts);

-- ── downloads ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS downloads (
  id           TEXT PRIMARY KEY,
  filename     TEXT NOT NULL,
  href         TEXT,
  mime_type    TEXT,
  size         INTEGER,
  chat_url     TEXT,
  chat_id      TEXT,
  account      TEXT,
  job_id       TEXT,
  session_id   TEXT,
  provider     TEXT,
  dropzone_url TEXT,                      -- URL on the dropzone server if uploaded
  ts           INTEGER NOT NULL
);

-- ── pa_sessions (Prompt Archaeology) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pa_sessions (
  id           TEXT PRIMARY KEY,
  job_id       TEXT,
  chat_id      TEXT,
  session_id   TEXT,
  account      TEXT,
  provider     TEXT,
  total_tokens INTEGER DEFAULT 0,
  tps_avg      REAL DEFAULT 0,            -- tokens per second average
  pause_count  INTEGER DEFAULT 0,
  entropy_avg  REAL DEFAULT 0,
  burst_count  INTEGER DEFAULT 0,
  hypotheses   TEXT DEFAULT '[]',         -- JSON array
  structure_events TEXT DEFAULT '[]',     -- JSON array
  raw_chunks   TEXT DEFAULT '[]',         -- JSON array (capped)
  ts           INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pa_chat_id    ON pa_sessions(chat_id);
CREATE INDEX IF NOT EXISTS idx_pa_session_id ON pa_sessions(session_id);

-- ── settings (runtime config) ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
  key          TEXT PRIMARY KEY,
  value        TEXT NOT NULL,
  updated_ts   INTEGER NOT NULL
);

-- Bootstrap defaults
INSERT OR IGNORE INTO settings VALUES('session_greeting_enabled', 'true', 0);
INSERT OR IGNORE INTO settings VALUES('session_greeting_text', 'Guardian session initialising. Please ask me: "What are we calling this session?" — then wait for my answer before we begin.', 0);
INSERT OR IGNORE INTO settings VALUES('scan_debounce_ms', '1500', 0);
INSERT OR IGNORE INTO settings VALUES('artifact_max', '500', 0);
INSERT OR IGNORE INTO settings VALUES('gap_min_score', '0.25', 0);
INSERT OR IGNORE INTO settings VALUES('gap_taxonomy_version', '3.0.0', 0);
INSERT OR IGNORE INTO settings VALUES('pa_enabled', 'true', 0);
INSERT OR IGNORE INTO settings VALUES('memory_auto_push', 'true', 0);
INSERT OR IGNORE INTO settings VALUES('dropzone_auto_upload', 'true', 0);
INSERT OR IGNORE INTO settings VALUES('stream_log_level', 'EVENTS', 0);
INSERT OR IGNORE INTO settings VALUES('lan_host', '0.0.0.0', 0);
INSERT OR IGNORE INTO settings VALUES('greeting_delay_ms', '1200', 0);
INSERT OR IGNORE INTO settings VALUES('poll_interval_ms', '500', 0);
INSERT OR IGNORE INTO settings VALUES('stable_count_threshold', '5', 0);
