'use strict';
const path = require('path');
const cfg = require('./config');

// Two interchangeable SQLite drivers with the same synchronous API:
//   better-sqlite3 - default: a local file in DATA_DIR (fast; needs a host with a writable disk)
//   libsql         - used when TURSO_DATABASE_URL is set: the same API, but the data lives in a cloud database
//                    (Turso). A small local copy is kept for fast reads and every write goes to the cloud.
//                    This is what lets the site + admin run on Vercel, whose disk is read-only.
const wantLibsql = cfg.DB_DRIVER === 'libsql' || (cfg.DB_DRIVER === 'auto' && !!cfg.TURSO_URL);
if (cfg.DB_DRIVER === 'auto' && cfg.TURSO_URL && !cfg.TURSO_TOKEN) console.warn('[db] TURSO_DATABASE_URL is set but TURSO_AUTH_TOKEN is empty.');
const isReplica = wantLibsql && !!cfg.TURSO_URL;
let raw;
if (wantLibsql) {
  const Libsql = require('libsql');
  raw = isReplica
    ? new Libsql(path.join(cfg.DATA_DIR, 'replica.db'), { syncUrl: cfg.TURSO_URL, authToken: cfg.TURSO_TOKEN })
    : new Libsql(path.join(cfg.DATA_DIR, 'app.db'));
} else {
  raw = new (require('better-sqlite3'))(path.join(cfg.DATA_DIR, 'app.db'));
}

// ---- cloud replica helpers (no-ops for a plain local database)
let lastSync = 0;
function syncNow() {
  if (!isReplica) return false;
  try { const r = raw.sync(); if (r && typeof r.catch === 'function') r.catch((e) => console.error('[db] sync failed:', e.message)); lastSync = Date.now(); return true; }
  catch (e) { console.error('[db] sync failed:', e.message); return false; }
}
const syncIfStale = () => { if (isReplica && Date.now() - lastSync > cfg.DB_SYNC_SECONDS * 1000) syncNow(); };

// libsql returns an extra enumerable "_metadata" key on .get() rows; strip it so both drivers behave the same.
function wrapStatement(st) {
  return { get: (...a) => { const r = st.get(...a); if (r && '_metadata' in r) delete r._metadata; return r; }, all: (...a) => st.all(...a), run: (...a) => st.run(...a), iterate: (...a) => st.iterate(...a) };
}
const db = wantLibsql ? {
  prepare: (sql) => wrapStatement(raw.prepare(sql)),
  exec: (sql) => raw.exec(sql),
  pragma: (p, o) => raw.pragma(p, o),
  transaction: (fn) => raw.transaction(fn),
  backup: async (dest) => { raw.exec(`VACUUM INTO '${String(dest).replace(/'/g, "''")}'`); }, // libsql has no .backup(); VACUUM INTO makes the same consistent copy
  close: () => raw.close(),
} : raw;
Object.defineProperties(db, { isReplica: { value: isReplica }, driver: { value: wantLibsql ? 'libsql' : 'better-sqlite3' }, syncNow: { value: syncNow }, syncIfStale: { value: syncIfStale } });
if (isReplica) { syncNow(); const t = setInterval(syncNow, cfg.DB_SYNC_SECONDS * 1000); if (t.unref) t.unref(); }

const tryPragma = (p) => { try { db.pragma(p); } catch (e) { if (!isReplica) throw e; /* some pragmas are not allowed on a cloud replica */ } };
tryPragma('journal_mode = WAL');
tryPragma('synchronous = NORMAL');
tryPragma('foreign_keys = ON');
tryPragma('busy_timeout = 8000');
tryPragma('cache_size = -24000');
tryPragma('temp_store = MEMORY');
tryPragma('mmap_size = 134217728');

// Add a column to an existing table only when it is missing (safe to run on every start).
db.addColumn = (table, col, ddl) => {
  if (!db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${ddl}`);
};

// Core (non-content) tables. Content tables are generated from src/schema.js so adding a field
// there is enough: missing columns are added automatically on the next start.
db.exec(`
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE, name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'editor', pass_hash TEXT NOT NULL, totp_secret TEXT, totp_enabled INTEGER NOT NULL DEFAULT 0,
  failed_logins INTEGER NOT NULL DEFAULT 0, locked_until INTEGER NOT NULL DEFAULT 0, must_change_password INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, last_login_at TEXT, pw_changed_at TEXT
);
CREATE TABLE IF NOT EXISTS sessions(
  id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, stage TEXT NOT NULL DEFAULT 'ok',
  csrf TEXT NOT NULL, created_at INTEGER NOT NULL, last_seen INTEGER NOT NULL, expires_at INTEGER NOT NULL, ip TEXT, ua TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_exp ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT, updated_at TEXT);
CREATE TABLE IF NOT EXISTS themes(
  id INTEGER PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'custom',
  dark INTEGER NOT NULL DEFAULT 0, vars TEXT NOT NULL DEFAULT '{}', particles TEXT NOT NULL DEFAULT '{}',
  sound_pack TEXT NOT NULL DEFAULT 'water', pipes TEXT NOT NULL DEFAULT '[]', custom_css TEXT NOT NULL DEFAULT '',
  visitor INTEGER NOT NULL DEFAULT 1, sort INTEGER NOT NULL DEFAULT 0, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS enquiries(
  id INTEGER PRIMARY KEY, ref TEXT NOT NULL UNIQUE, type TEXT NOT NULL DEFAULT 'quote', name TEXT NOT NULL, phone TEXT NOT NULL,
  email TEXT, product TEXT, size TEXT, color TEXT, qty TEXT, location TEXT, message TEXT, items TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'new', notes TEXT NOT NULL DEFAULT '', spam INTEGER NOT NULL DEFAULT 0,
  lang TEXT, source TEXT, ip_hash TEXT, created_at TEXT NOT NULL, updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_enq_created ON enquiries(created_at);
CREATE INDEX IF NOT EXISTS idx_enq_status ON enquiries(status);
CREATE TABLE IF NOT EXISTS analytics_daily(day TEXT NOT NULL, path TEXT NOT NULL, views INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(day,path));
CREATE TABLE IF NOT EXISTS analytics_uniques(day TEXT NOT NULL, vh TEXT NOT NULL, PRIMARY KEY(day,vh));
CREATE TABLE IF NOT EXISTS analytics_ref(day TEXT NOT NULL, host TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(day,host));
CREATE TABLE IF NOT EXISTS analytics_dev(day TEXT NOT NULL, kind TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(day,kind));
CREATE TABLE IF NOT EXISTS audit_log(id INTEGER PRIMARY KEY, ts TEXT NOT NULL, user_id INTEGER, user_email TEXT, action TEXT NOT NULL, entity TEXT, entity_id TEXT, detail TEXT, ip TEXT);
CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log(ts);
CREATE TABLE IF NOT EXISTS media(
  id INTEGER PRIMARY KEY, file TEXT NOT NULL UNIQUE, original TEXT, mime TEXT, kind TEXT, size INTEGER, alt TEXT NOT NULL DEFAULT '', uploaded_by INTEGER, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS chat_log(id INTEGER PRIMARY KEY, ts TEXT NOT NULL, q TEXT, matched INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS analytics_dim(day TEXT NOT NULL, dim TEXT NOT NULL, val TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(day,dim,val));
CREATE TABLE IF NOT EXISTS analytics_time(day TEXT NOT NULL, path TEXT NOT NULL, secs INTEGER NOT NULL DEFAULT 0, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(day,path));
CREATE TABLE IF NOT EXISTS analytics_visits(
  id INTEGER PRIMARY KEY, ts TEXT NOT NULL, path TEXT, dev TEXT, os TEXT, browser TEXT, country TEXT, city TEXT, ref TEXT, lang TEXT, ret INTEGER NOT NULL DEFAULT 0, vh TEXT
);
CREATE INDEX IF NOT EXISTS idx_visits_ts ON analytics_visits(ts);
CREATE TABLE IF NOT EXISTS login_events(
  id INTEGER PRIMARY KEY, ts TEXT NOT NULL, user_id INTEGER, email TEXT, ok INTEGER NOT NULL DEFAULT 0, note TEXT, ip TEXT, device TEXT, os TEXT, browser TEXT, country TEXT
);
CREATE INDEX IF NOT EXISTS idx_login_ts ON login_events(ts);
`);
db.addColumn('media', 'source', "TEXT NOT NULL DEFAULT 'local'");   // local | drive | link
db.addColumn('media', 'thumb', "TEXT NOT NULL DEFAULT ''");

module.exports = db;
