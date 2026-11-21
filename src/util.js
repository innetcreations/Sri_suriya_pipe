'use strict';
const crypto = require('crypto');
const { SECRET } = require('./config');

const slugify = (s, max = 80) => String(s || '')
  .normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max);

const rand = (n = 24) => crypto.randomBytes(n).toString('base64url');
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const hmac = (data, key = SECRET) => crypto.createHmac('sha256', key).update(String(data)).digest('base64url');
const safeEq = (a, b) => {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
const parseJSON = (s, d) => { try { const v = JSON.parse(s); return v == null ? d : v; } catch { return d; } };
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
// Strip control characters, normalise unicode, trim and cap length.
const clean = (s, max = 500) => String(s == null ? '' : s).normalize('NFC')
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F‪-‮⁦-⁩]/g, '').trim().slice(0, max);
const nowISO = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0, 10);

// ---- AES-256-GCM helpers for secrets stored in the database (SMTP password etc.)
const KEY = crypto.createHash('sha256').update('enc:' + SECRET).digest();
function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return 'enc:' + Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64');
}
function decrypt(blob) {
  try {
    if (!String(blob).startsWith('enc:')) return String(blob || '');
    const b = Buffer.from(blob.slice(4), 'base64');
    const d = crypto.createDecipheriv('aes-256-gcm', KEY, b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
  } catch { return ''; }
}

// Only allow safe URL schemes / relative paths for user supplied links.
function safeUrl(u, fallback = '#') {
  const s = String(u || '').trim();
  if (!s) return fallback;
  if (/^(https?:|mailto:|tel:|\/(?!\/)|#)/i.test(s)) return s;
  return fallback;
}
const isImagePath = (u) => /^(\/(?:uploads|assets)\/[\w\-./ %]+|\/placeholder\/[\w\-./?=&%]+|\/images\/[\w\-./]+|https:\/\/[^\s"'<>]+)$/i.test(String(u || ''));

const fmtDate = (d, lang = 'en') => {
  try { return new Date(d).toLocaleDateString(lang === 'ta' ? 'ta-IN' : 'en-IN', { year: 'numeric', month: 'short', day: 'numeric' }); } catch { return ''; }
};

module.exports = { slugify, rand, sha, hmac, safeEq, parseJSON, clamp, clean, nowISO, today, encrypt, decrypt, safeUrl, isImagePath, fmtDate };
