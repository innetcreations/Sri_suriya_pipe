'use strict';
/**
 * Supabase mirror - keeps a copy of ALL your website text data (pages, products, settings, themes, users, enquiries...)
 * in a Supabase table, and restores it when the website starts on a host that forgets its files (Vercel, free web hosts).
 *
 * How it works (simple on purpose):
 *   - The website keeps using its own SQLite database for speed.
 *   - After every admin change or new enquiry, the whole content is saved to ONE row of the table  public.ssp_state  (see docs/supabase/schema.sql).
 *   - On start-up, and before admin requests, the website checks that row and loads it when it is newer.
 *   - Pictures are NOT stored here: only their web addresses (text) are. The pictures live on Google Drive or in the assets folder.
 *   - Visitor statistics are NOT mirrored (they change on every visit). Use Turso or a host with a permanent disk if you need durable statistics.
 *
 * It needs two environment variables (server only - never put them in the browser):
 *   SUPABASE_URL          https://YOUR-PROJECT-REF.supabase.co
 *   SUPABASE_SERVICE_KEY  the "secret" key (or legacy "service_role" key) from Supabase -> Project Settings -> API Keys
 *
 * Honest limits: if two admins save within about one second on different servers, the later save wins ("last writer wins").
 * Every failure is logged and the website keeps working from its local copy.
 */
const crypto = require('crypto');
const path = require('path');
const cfg = require('./config');
const db = require('./db');
const cache = require('./cache');
const { MODELS } = require('./schema');

const enabled = !!(cfg.SUPABASE_URL && cfg.SUPABASE_KEY);
if (cfg.SUPABASE_URL && !cfg.SUPABASE_KEY) console.warn('[supabase] SUPABASE_URL is set but SUPABASE_SERVICE_KEY is empty - the mirror is OFF.');
if (enabled && cfg.isProd && !/^https:\/\//.test(cfg.SUPABASE_URL)) console.warn('[supabase] SUPABASE_URL should start with https://');

const CORE = ['users', 'sessions', 'settings', 'themes', 'media', 'enquiries', 'audit_log', 'login_events'];
const CAPS = { enquiries: 3000, audit_log: 400, login_events: 300 };   // only the newest rows of these are mirrored (keeps the snapshot small)
const tables = () => [...CORE, ...Object.keys(MODELS)];
const MAX_BYTES = 6 * 1024 * 1024;
const st = { lastError: '', lastErrorAt: 0, lastPushAt: 0, lastPullAt: 0, pushes: 0, pulls: 0, bytes: 0 };
let chain = Promise.resolve();
let downUntil = 0; let lastCheck = 0; let lastHash = ''; let lastLog = 0; let started = false;
let knowsRemote = false;   // true once we have really read Supabase; until then this server must never overwrite it with default content

// ---------------------------------------------------------------- local bookkeeping (never mirrored)
function stateTable() { db.exec('CREATE TABLE IF NOT EXISTS mirror_state(k TEXT PRIMARY KEY, v TEXT)'); }
const getS = (k) => { const r = db.prepare('SELECT v FROM mirror_state WHERE k=?').get(k); return r ? r.v : ''; };
const setS = (k, v) => db.prepare('INSERT INTO mirror_state(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v').run(k, String(v));
const localVersion = () => parseInt(getS('version'), 10) || 0;
const isDirty = () => getS('dirty') === '1';

function fail(msg) {
  st.lastError = msg; st.lastErrorAt = Date.now();
  if (Date.now() - lastLog > 60000) { lastLog = Date.now(); console.error('[supabase]', msg); }
}
const serial = (fn) => { const run = chain.then(fn, fn); chain = run.catch(() => {}); return run; };

// ---------------------------------------------------------------- REST helper (PostgREST)
async function rest(method, query, { body, prefer } = {}) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 9000);
  const headers = { apikey: cfg.SUPABASE_KEY, 'Content-Type': 'application/json' };
  // New-style keys (sb_secret_...) are NOT JWTs and must only travel in "apikey"; the legacy service_role key is a JWT and also works as a Bearer token.
  if (cfg.SUPABASE_KEY.startsWith('eyJ')) headers.Authorization = `Bearer ${cfg.SUPABASE_KEY}`;
  if (prefer) headers.Prefer = prefer;
  try {
    const res = await fetch(`${cfg.SUPABASE_URL}/rest/v1/${query}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: ctl.signal });
    const text = await res.text(); let json = null; try { json = text ? JSON.parse(text) : null; } catch { /* not json */ }
    return { status: res.status, ok: res.ok, json, text: text.slice(0, 300) };
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? 'Supabase did not answer in time' : `Supabase is not reachable (${(e.cause && (e.cause.code || e.cause.message)) || e.message})`);
  } finally { clearTimeout(t); }
}
function explain(r) {
  if (r.status === 401 || r.status === 403) return 'Supabase rejected the key. Use the secret / service_role key (not the publishable / anon key) in SUPABASE_SERVICE_KEY.';
  if (r.status === 404 || /PGRST205|does not exist|schema cache/i.test(r.text)) return 'The table ssp_state does not exist yet. In Supabase open SQL Editor and run docs/supabase/schema.sql.';
  return `Supabase answered ${r.status}: ${r.text.slice(0, 160)}`;
}
async function remoteMeta() {
  const r = await rest('GET', 'ssp_state?id=eq.main&select=version,updated_at');
  if (!r.ok) throw new Error(explain(r));
  knowsRemote = true;
  return Array.isArray(r.json) && r.json[0] ? { version: Number(r.json[0].version) || 0, updated_at: r.json[0].updated_at } : null;
}

// ---------------------------------------------------------------- snapshot
const scrub = (v) => (typeof v === 'string' ? v.replace(/\u0000/g, '') : v);   // Postgres JSON cannot hold NUL characters
function snapshot() {
  const out = {};
  for (const t of tables()) {
    let rows;
    if (t === 'sessions') rows = db.prepare('SELECT * FROM sessions WHERE expires_at > ?').all(Date.now());
    else if (CAPS[t]) rows = db.prepare(`SELECT * FROM "${t}" ORDER BY id DESC LIMIT ?`).all(CAPS[t]).reverse();
    else rows = db.prepare(`SELECT * FROM "${t}"`).all();
    out[t] = rows.map((r) => { const o = {}; for (const k of Object.keys(r)) o[k] = scrub(r[k]); return o; });
  }
  return out;
}
const hashOf = (snap) => crypto.createHash('sha256').update(JSON.stringify(snap)).digest('hex');

function apply(payload) {
  if (!payload || payload.v !== 1 || !payload.tables || typeof payload.tables !== 'object') throw new Error('The saved snapshot has an unknown format.');
  const T = payload.tables;
  if (!Array.isArray(T.users) || !T.users.length || !Array.isArray(T.settings)) throw new Error('The saved snapshot has no users or settings - refusing to load it (that would lock you out).');
  const names = tables().filter((t) => Array.isArray(T[t]));
  db.transaction(() => {
    try { db.pragma('defer_foreign_keys = ON'); } catch { /* not every driver allows it */ }
    for (const t of [...names].reverse()) db.prepare(`DELETE FROM "${t}"`).run();
    for (const t of names) {
      const have = new Set(db.prepare(`PRAGMA table_info("${t}")`).all().map((c) => c.name));
      const rows = T[t]; if (!rows.length) continue;
      const cols = Object.keys(rows[0]).filter((c) => have.has(c));
      if (!cols.length) continue;
      const ins = db.prepare(`INSERT OR REPLACE INTO "${t}"(${cols.map((c) => `"${c}"`).join(',')}) VALUES(${cols.map(() => '?').join(',')})`);
      for (const r of rows) ins.run(...cols.map((c) => (r[c] === undefined ? null : r[c])));
    }
  })();
  cache.clear();   // every cached page / setting is rebuilt from the freshly loaded data
}

// ---------------------------------------------------------------- pull / push
async function pullNow({ backup = false } = {}) {
  const r = await rest('GET', 'ssp_state?id=eq.main&select=version,payload');
  if (!r.ok) throw new Error(explain(r));
  const row = Array.isArray(r.json) ? r.json[0] : null;
  if (!row) throw new Error('Supabase has no saved copy yet (the ssp_state table is empty).');
  if (backup) { try { await db.backup(path.join(cfg.DATA_DIR, `before-supabase-restore-${new Date().toISOString().replace(/[:.]/g, '-')}.db`)); } catch (e) { console.warn('[supabase] could not make a safety copy:', e.message); } }
  apply(row.payload);
  setS('version', Number(row.version) || 0); setS('dirty', '0');
  lastHash = hashOf(snapshot()); st.lastPullAt = Date.now(); st.pulls++; st.lastError = '';
  return Number(row.version) || 0;
}

async function pushNow({ force = false } = {}) {
  // A brand-new server that has never talked to Supabase only holds default content: saving it would erase the real copy.
  if (!localVersion() && !knowsRemote) throw new Error('Not saved: this server has not been able to read Supabase yet, so it will not overwrite it.');
  const snap = snapshot(); const hash = hashOf(snap);
  if (!force && !isDirty() && hash === lastHash) return { skipped: true };
  const body = JSON.stringify({ v: 1, app: 'sri-suriya', tables: snap });
  if (body.length > MAX_BYTES) throw new Error(`The data is ${(body.length / 1048576).toFixed(1)} MB - too big for the Supabase mirror (limit ${MAX_BYTES / 1048576} MB). Delete old enquiries / audit entries.`);
  setS('dirty', '1');   // remembered until the save really reached Supabase, so a pull can never throw this change away
  const payload = JSON.parse(body);
  let expected = localVersion();
  for (let attempt = 0; attempt < 2; attempt++) {
    let r;
    if (!expected) r = await rest('POST', 'ssp_state', { body: { id: 'main', version: 1, payload }, prefer: 'return=representation' });
    else r = await rest('PATCH', `ssp_state?id=eq.main&version=eq.${expected}`, { body: { version: expected + 1, payload, updated_at: new Date().toISOString() }, prefer: 'return=representation' });
    if (r.ok && Array.isArray(r.json) && r.json.length) {
      setS('version', Number(r.json[0].version) || expected + 1); setS('dirty', '0'); lastHash = hash;
      st.lastPushAt = Date.now(); st.pushes++; st.bytes = body.length; st.lastError = '';
      return { pushed: true, bytes: body.length };
    }
    if (r.status === 409 || (r.ok && Array.isArray(r.json) && !r.json.length)) {   // somebody else saved first -> last writer wins: re-read the current version and save again
      const meta = await remoteMeta(); expected = meta ? meta.version : 0; continue;
    }
    throw new Error(explain(r));
  }
  throw new Error('Could not save to Supabase: another change kept arriving. It will be retried.');
}

// ---------------------------------------------------------------- public API
// Called once at start-up, BEFORE the default content is seeded: restores the saved copy on a fresh / empty host.
async function start() {
  if (!enabled || started) return; started = true;
  stateTable();
  try {
    const meta = await remoteMeta(); const lv = localVersion();
    if (meta && !isDirty() && (lv === 0 || meta.version > lv)) {
      const used = db.prepare('SELECT COUNT(*) n FROM users').get().n > 0;
      const v = await pullNow({ backup: lv === 0 && used && !cfg.IS_VERCEL });
      console.log(`[supabase] restored the website data from Supabase (version ${v}).`);
    } else if (meta) { lastHash = hashOf(snapshot()); }
  } catch (e) { fail(e.message); downUntil = Date.now() + 30000; }
}
// Called after start-up seeding: first connection (empty Supabase) or content that seeding added is saved.
async function finish() {
  if (!enabled) return;
  try { await serial(() => pushNow()); console.log('[supabase] connected - the website data is saved in Supabase.'); } catch (e) { fail(e.message); }
}
// Before a request: make sure this server has the newest copy. gapMs = how recently we may already have checked.
function ensureFresh(gapMs = 0, { force = false } = {}) {
  if (!enabled) return Promise.resolve();
  return serial(async () => {
    const now = Date.now();
    if (!force && (now < downUntil || now - lastCheck < gapMs)) return;
    try {
      lastCheck = now;
      if (isDirty()) return;   // we hold changes that are not saved yet - never overwrite them
      const meta = await remoteMeta();
      if (meta && meta.version > localVersion()) await pullNow();
      downUntil = 0;
    } catch (e) { fail(e.message); downUntil = Date.now() + 30000; }
  });
}
function pushSoon(opts) {
  if (!enabled) return Promise.resolve();
  return serial(() => pushNow(opts)).catch((e) => { fail(e.message); });
}
function middleware(req, res, next) {
  if (!enabled) return next();
  const p = req.path; const isAdmin = p === cfg.ADMIN_PATH || p.startsWith(cfg.ADMIN_PATH + '/');
  const write = !['GET', 'HEAD', 'OPTIONS'].includes(req.method) && (isAdmin || p === '/api/enquiry');
  if (!write && (p === '/healthz' || p.startsWith('/api/'))) return next();
  const gap = write ? 0 : isAdmin ? 1500 : cfg.DB_SYNC_SECONDS * 1000;
  const go = () => {
    if (write) {
      if (cfg.IS_VERCEL) {   // a serverless function may be frozen right after the answer, so the save finishes BEFORE the answer is sent
        const end = res.end;
        res.end = function patched(...a) { res.end = end; pushSoon().finally(() => end.apply(res, a)); return res; };
      } else res.on('finish', () => { pushSoon(); });
    }
    next();
  };
  const p1 = ensureFresh(gap);
  if (write || isAdmin || cfg.IS_VERCEL) p1.then(go, go); else { p1.catch(() => {}); next(); }
}
function status() {
  return { enabled, host: cfg.SUPABASE_URL.replace(/^https?:\/\//, '').slice(0, 60), version: enabled ? localVersion() : 0, dirty: enabled ? isDirty() : false, ...st, paused: Date.now() < downUntil };
}
async function check() {   // "Test connection" button
  if (!enabled) return { ok: false, error: 'Not configured: set SUPABASE_URL and SUPABASE_SERVICE_KEY.' };
  try { stateTable(); const m = await remoteMeta(); return { ok: true, remote: m, local: localVersion() }; } catch (e) { return { ok: false, error: e.message }; }
}
const forcePush = () => serial(() => pushNow({ force: true }));
const forcePull = () => serial(() => pullNow({ backup: !cfg.IS_VERCEL }));
// Long-running servers: retry unsaved changes every minute.
if (enabled) { const t = setInterval(() => { try { if (started && isDirty() && Date.now() >= downUntil) pushSoon(); } catch { /* ignore */ } }, 60000); if (t.unref) t.unref(); }

module.exports = { enabled, start, finish, ensureFresh, pushSoon, middleware, status, check, forcePush, forcePull };
