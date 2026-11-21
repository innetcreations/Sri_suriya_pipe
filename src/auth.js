'use strict';
const crypto = require('crypto');
const { promisify } = require('util');
const QRCode = require('qrcode');
const db = require('./db');
const cfg = require('./config');
const settings = require('./settings');
const audit = require('./audit');
const { rand, sha, hmac, safeEq, nowISO, clean } = require('./util');

const scrypt = promisify(crypto.scrypt);
const N = 32768; const R = 8; const PAR = 1;
const COOKIE = cfg.HTTPS ? '__Host-ssp_s' : 'ssp_s';
const PRE_COOKIE = cfg.HTTPS ? '__Host-ssp_lt' : 'ssp_lt';
const ROLES = { viewer: 1, editor: 2, admin: 3, superadmin: 4 };
const ROLE_LABEL = { viewer: 'Viewer (read-only)', editor: 'Editor (content)', admin: 'Admin (content + settings)', superadmin: 'Super admin (everything)' };

// ───────────────────────── passwords
async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(pw, salt, 64, { N, r: R, p: PAR, maxmem: 128 * 1024 * 1024 });
  return `scrypt$${N}$${R}$${PAR}$${salt.toString('base64')}$${key.toString('base64')}`;
}
async function verifyPassword(pw, stored) {
  try {
    const [alg, n, r, p, s, h] = String(stored).split('$');
    if (alg !== 'scrypt') return false;
    const key = await scrypt(pw, Buffer.from(s, 'base64'), 64, { N: +n, r: +r, p: +p, maxmem: 128 * 1024 * 1024 });
    const want = Buffer.from(h, 'base64');
    return key.length === want.length && crypto.timingSafeEqual(key, want);
  } catch { return false; }
}
let DUMMY; // verifying against this makes "unknown e-mail" take as long as "wrong password"
const dummyHash = async () => (DUMMY || (DUMMY = await hashPassword(rand(12))));

const COMMON = new Set(['password', 'password123', 'admin123', 'administrator', 'qwerty123', '123456789', '1234567890', 'letmein', 'welcome123', 'iloveyou', 'sriSuriya'.toLowerCase()]);
function checkPassword(pw, email = '') {
  pw = String(pw || '');
  if (pw.length < 12) return 'Password must be at least 12 characters.';
  if (pw.length > 200) return 'Password is too long.';
  const low = pw.toLowerCase();
  if (COMMON.has(low) || /^(.)\1+$/.test(pw) || /^(0123456789|abcdefghij|qwertyuiop)/i.test(pw)) return 'That password is too easy to guess.';
  const local = String(email).split('@')[0].toLowerCase();
  if (local.length >= 4 && low.includes(local)) return 'Password must not contain your email name.';
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  if (classes < 2) return 'Use a mix of letters, numbers or symbols.';
  return null;
}

// ───────────────────────── login history (shown in Admin -> Login & devices). Stores device LABELS, never the raw User-Agent.
const insLogin = db.prepare('INSERT INTO login_events(ts,user_id,email,ok,note,ip,device,os,browser,country) VALUES(?,?,?,?,?,?,?,?,?,?)');
function recordLogin(req, { user = null, email = '', ok = false, note = '' } = {}) {
  try {
    const { parseUA, geo } = require('./ua'); const d = parseUA(req.get && req.get('user-agent')); const g = geo(req);
    insLogin.run(nowISO(), user ? user.id : null, clean(email || (user && user.email) || '', 200), ok ? 1 : 0, clean(note, 120), clean(req.ip || '', 64), d.device, d.os, d.browser, g.country);
  } catch (e) { console.error('[auth] login history failed', e.message); }
}

// ───────────────────────── sessions
const insSess = db.prepare('INSERT INTO sessions(id,user_id,stage,csrf,created_at,last_seen,expires_at,ip,ua) VALUES(?,?,?,?,?,?,?,?,?)');
const selSess = db.prepare('SELECT s.*, u.email, u.name, u.role, u.active, u.totp_enabled, u.must_change_password FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=?');
const hours = () => Math.max(1, Math.min(72, settings.num('session_hours', 12)));
const idleMs = () => Math.max(5, Math.min(1440, settings.num('session_idle_min', 120))) * 60000;

function cookieOpts(maxAgeMs) {
  return { httpOnly: true, sameSite: 'strict', secure: cfg.HTTPS, path: '/', maxAge: maxAgeMs };
}
function startSession(res, user, req, stage = 'ok') {
  const token = rand(32); const now = Date.now();
  const life = stage === '2fa' ? 5 * 60000 : hours() * 3600000;
  const csrf = rand(24);
  insSess.run(sha(token), user.id, stage, csrf, now, now, now + life, req.ip, clean(req.get('user-agent') || '', 200));
  res.cookie(COOKIE, token, cookieOpts(life));
  return { token, csrf };
}
function endSession(req, res) {
  const t = req.cookies && req.cookies[COOKIE];
  if (t) db.prepare('DELETE FROM sessions WHERE id=?').run(sha(t));
  res.clearCookie(COOKIE, { path: '/', httpOnly: true, sameSite: 'strict', secure: cfg.HTTPS });
}
// Reads the session cookie. Sets req.user / req.sess (full session) or req.pending (password ok, awaiting 2FA).
function loadSession(req, res, next) {
  try {
    const t = req.cookies && req.cookies[COOKIE];
    if (t && typeof t === 'string' && t.length < 100) {
      const s = selSess.get(sha(t)); const now = Date.now();
      if (s && s.expires_at > now && s.active && (s.stage !== 'ok' || s.last_seen + idleMs() > now)) {
        if (s.stage === 'ok') {
          req.user = { id: s.user_id, email: s.email, name: s.name, role: s.role, totp: !!s.totp_enabled, mustChange: !!s.must_change_password };
          req.sess = s;
          if (now - s.last_seen > 60000) db.prepare('UPDATE sessions SET last_seen=? WHERE id=?').run(now, s.id);
        } else req.pending = { id: s.user_id, email: s.email, sessId: s.id, csrf: s.csrf };
      } else if (s) db.prepare('DELETE FROM sessions WHERE id=?').run(s.id);
    }
  } catch (e) { console.error('[auth] session error', e.message); }
  next();
}
const requireAuth = (loginUrl) => (req, res, next) => {
  if (req.user) return next();
  if (req.method === 'GET' && !req.xhr) return res.redirect(loginUrl + '?next=' + encodeURIComponent(req.originalUrl.slice(0, 200)));
  return res.status(401).json({ error: 'Session expired. Please sign in again.' });
};
const requireRole = (min) => (req, res, next) => {
  if (req.user && ROLES[req.user.role] >= ROLES[min]) return next();
  audit.log(req, 'forbidden', 'route', '', `${req.method} ${req.originalUrl.slice(0, 120)}`);
  return res.status(403).type('html').send(`<!doctype html><meta charset=utf-8><title>Forbidden</title><body style="font-family:system-ui;padding:3rem"><h1>403 – Not allowed</h1><p>Your role (${req.user ? req.user.role : 'none'}) cannot do this. Ask a super admin.</p><p><a href="javascript:history.back()">Go back</a></p>`);
};
const can = (user, min) => !!user && ROLES[user.role] >= ROLES[min];

// CSRF: token bound to the server-side session. Required for every state-changing admin request.
function verifyCsrf(req) {
  const tok = req.get('x-csrf-token') || (req.body && req.body._csrf) || '';
  const want = (req.sess && req.sess.csrf) || (req.pending && req.pending.csrf) || '';
  return !!want && !!tok && safeEq(tok, want);
}
// Login form protection (no session yet): double-submit cookie signed with the server secret.
function issueLoginToken(res) {
  const r = rand(18);
  res.cookie(PRE_COOKIE, r, cookieOpts(30 * 60000));
  return hmac('login:' + r);
}
function verifyLoginToken(req) {
  const r = req.cookies && req.cookies[PRE_COOKIE]; const f = req.body && req.body._lt;
  return !!r && !!f && safeEq(hmac('login:' + r), f);
}

// ───────────────────────── login flow
const selUser = db.prepare('SELECT * FROM users WHERE email=? COLLATE NOCASE');
async function attemptLogin(email, password, req) {
  email = clean(email, 200).toLowerCase();
  const u = email ? selUser.get(email) : null;
  const now = Date.now();
  if (!u) { await verifyPassword(String(password).slice(0, 200), await dummyHash()); audit.log(req, 'login_failed', 'user', '', `unknown: ${email.slice(0, 60)}`); recordLogin(req, { email, note: 'unknown email' }); return { error: 'Invalid email or password.' }; }
  if (!u.active) { await dummyHash(); recordLogin(req, { user: u, note: 'account disabled' }); return { error: 'This account is disabled.' }; }
  if (u.locked_until > now) { audit.log({ ip: req.ip, user: u }, 'login_locked', 'user', u.id); recordLogin(req, { user: u, note: 'account locked' }); return { error: `Too many failed attempts. Try again in ${Math.ceil((u.locked_until - now) / 60000)} minute(s).` }; }
  const ok = await verifyPassword(String(password).slice(0, 200), u.pass_hash);
  if (!ok) {
    const f = u.failed_logins + 1;
    const lock = f >= 10 ? now + 3600000 : f >= 5 ? now + 900000 : 0;
    db.prepare('UPDATE users SET failed_logins=?, locked_until=? WHERE id=?').run(f, lock, u.id);
    audit.log({ ip: req.ip, user: u }, 'login_failed', 'user', u.id, `attempt ${f}`); recordLogin(req, { user: u, note: `wrong password (attempt ${f})` });
    return { error: lock ? 'Too many failed attempts. The account is temporarily locked.' : 'Invalid email or password.' };
  }
  db.prepare('UPDATE users SET failed_logins=0, locked_until=0 WHERE id=?').run(u.id);
  return { user: u };
}
function completeLogin(user, req, res) {
  // Rotate: remove any previous session cookie, issue a fresh one.
  endSession(req, res);
  const s = startSession(res, user, req, 'ok');
  db.prepare('UPDATE users SET last_login_at=? WHERE id=?').run(nowISO(), user.id);
  audit.log({ ip: req.ip, user }, 'login', 'user', user.id);
  recordLogin(req, { user, ok: true, note: 'signed in' });
  return s;
}

// ───────────────────────── TOTP (RFC 6238) – works with Google Authenticator, Authy, Microsoft Authenticator…
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function b32enc(buf) { let bits = ''; for (const b of buf) bits += b.toString(2).padStart(8, '0'); let o = ''; for (let i = 0; i < bits.length; i += 5) o += B32[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)]; return o; }
function b32dec(s) { let bits = ''; for (const c of String(s).replace(/=+$/, '').toUpperCase()) { const i = B32.indexOf(c); if (i < 0) continue; bits += i.toString(2).padStart(5, '0'); } const out = []; for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2)); return Buffer.from(out); }
function totpAt(secret, counter) {
  const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', b32dec(secret)).update(b).digest();
  const o = h[h.length - 1] & 15;
  return String(((h[o] & 0x7f) << 24 | h[o + 1] << 16 | h[o + 2] << 8 | h[o + 3]) % 1000000).padStart(6, '0');
}
const usedCounters = new Map();
function verifyTotp(userId, secret, code) {
  code = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(code) || !secret) return false;
  const c = Math.floor(Date.now() / 30000);
  for (const d of [0, -1, 1]) {
    if (safeEq(totpAt(secret, c + d), code)) {
      if ((usedCounters.get(userId) || 0) >= c + d) return false; // replay protection
      usedCounters.set(userId, c + d); return true;
    }
  }
  return false;
}
const newTotpSecret = () => b32enc(crypto.randomBytes(20));
async function totpQr(email, secret) {
  const issuer = 'Sri Suriya Admin';
  const uri = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&digits=6&period=30`;
  return { uri, dataUrl: await QRCode.toDataURL(uri, { margin: 1, width: 220 }) };
}

// ───────────────────────── users
async function createUser({ email, name, role = 'editor', password, mustChange = true }) {
  email = clean(email, 200).toLowerCase();
  if (!/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(email)) throw new Error('Invalid email');
  if (!ROLES[role]) throw new Error('Invalid role');
  const err = checkPassword(password, email); if (err) throw new Error(err);
  const hash = await hashPassword(password);
  const r = db.prepare('INSERT INTO users(email,name,role,pass_hash,must_change_password,created_at,pw_changed_at) VALUES(?,?,?,?,?,?,?)').run(email, clean(name, 80), role, hash, mustChange ? 1 : 0, nowISO(), nowISO());
  return Number(r.lastInsertRowid);
}
async function setPassword(userId, password, { mustChange = false } = {}) {
  const hash = await hashPassword(password);
  db.prepare('UPDATE users SET pass_hash=?, must_change_password=?, failed_logins=0, locked_until=0, pw_changed_at=? WHERE id=?').run(hash, mustChange ? 1 : 0, nowISO(), userId);
  db.prepare('DELETE FROM sessions WHERE user_id=?').run(userId); // sign out everywhere
}

// First start: create the owner account. Password comes from env or is generated and printed ONCE.
async function ensureAdmin() {
  if (db.prepare('SELECT COUNT(*) n FROM users').get().n > 0) return null;
  const email = cfg.ADMIN_EMAIL || 'admin@localhost.local';
  let pw = cfg.ADMIN_PASSWORD; let generated = !pw; let note = null;
  if (pw) { // a weak ADMIN_PASSWORD in .env must not crash the first start – explain and generate a strong one instead
    const bad = checkPassword(pw, email);
    if (bad) { note = `ADMIN_PASSWORD in .env was rejected (${bad}) – a random password was generated instead.`; pw = null; generated = true; }
  }
  if (!pw) pw = rand(12).replace(/[^A-Za-z0-9]/g, 'x') + 'aA1!';
  const id = await createUser({ email, name: 'Owner', role: 'superadmin', password: pw, mustChange: generated });
  return { id, email, password: generated ? pw : null, note };
}

function pruneSessions() { db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now()); }

// Optional admin IP allow-list (setting or ADMIN_IP_ALLOW env)
function ipAllowed(req) {
  const list = String(process.env.ADMIN_IP_ALLOW || settings.get('admin_ip_allow') || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!list.length) return true;
  const ip = String(req.ip || '').replace(/^::ffff:/, '');
  return list.includes(ip) || ip === '127.0.0.1' || ip === '::1';
}

module.exports = {
  COOKIE, ROLES, ROLE_LABEL, hashPassword, verifyPassword, checkPassword, startSession, endSession, loadSession, requireAuth, requireRole, can, verifyCsrf,
  issueLoginToken, verifyLoginToken, attemptLogin, completeLogin, recordLogin, verifyTotp, newTotpSecret, totpQr, createUser, setPassword, ensureAdmin, pruneSessions, ipAllowed,
};
