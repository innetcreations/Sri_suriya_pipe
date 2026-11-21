'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const dns = require('dns');
if (dns.setDefaultResultOrder) dns.setDefaultResultOrder('ipv4first');

const ROOT = path.resolve(__dirname, '..');

// Tiny .env loader (no dependency). Real environment variables always win.
(function loadEnv() {
  const f = path.join(ROOT, '.env');
  if (!fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (!m || m[1] in process.env) continue;
    let v = m[2];
    if (/^(['"]).*\1$/.test(v)) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
})();

const env = process.env;
const isProd = env.NODE_ENV === 'production';
const IS_VERCEL = !!env.VERCEL;            // running as a Vercel serverless function (read-only disk, no background processes)
const PORT = parseInt(env.PORT, 10) || 3000;
// On Vercel the only writable place is /tmp (wiped between requests/instances), so the project folders are never used for data there.
const DATA_DIR = path.resolve(ROOT, env.DATA_DIR || (IS_VERCEL ? '/tmp/ssp-data' : 'data'));
// Uploaded images/videos live in the project's assets folder (public/assets/uploads) so they can be committed and deployed with the site.
const UPLOAD_DIR = path.resolve(ROOT, env.UPLOAD_DIR || (IS_VERCEL ? '/tmp/ssp-uploads' : 'public/assets/uploads'));
const mk = (d) => { try { fs.mkdirSync(d, { recursive: true }); fs.accessSync(d, fs.constants.W_OK); return true; } catch { return false; } };
mk(DATA_DIR);
// false on read-only hosts: the admin then offers Google Drive upload / paste-a-link instead of local upload.
const UPLOADS_WRITABLE = !IS_VERCEL && mk(UPLOAD_DIR);

// Secret used for signing + encrypting settings. Generated once and stored with 0600 permissions.
let SECRET = env.APP_SECRET;
if (!SECRET) {
  if (IS_VERCEL) throw new Error('APP_SECRET is not set. In Vercel: Project -> Settings -> Environment Variables -> add APP_SECRET (a long random text, 48+ characters). It must stay the same on every deploy.');
  const f = path.join(DATA_DIR, '.secret');
  if (fs.existsSync(f)) SECRET = fs.readFileSync(f, 'utf8').trim();
  else {
    SECRET = crypto.randomBytes(48).toString('hex');
    fs.writeFileSync(f, SECRET, { mode: 0o600 });
  }
}
if (SECRET.length < 32) throw new Error('APP_SECRET must be at least 32 characters');

// On Vercel the production address is provided automatically; set SITE_URL yourself once you add a custom domain.
const vercelHost = IS_VERCEL ? (env.VERCEL_PROJECT_PRODUCTION_URL || env.VERCEL_URL || '') : '';
const SITE_URL = (env.SITE_URL || (vercelHost ? `https://${vercelHost}` : '') || `http://localhost:${PORT}`).replace(/\/+$/, '');
let trust = (env.TRUST_PROXY !== undefined && env.TRUST_PROXY.trim() !== '') ? env.TRUST_PROXY.trim() : isProd ? '1' : '0';
if (/^\d+$/.test(trust)) trust = parseInt(trust, 10) || false;
else if (trust === 'false') trust = false;
else if (trust === 'true') trust = 1;

module.exports = {
  ROOT, DATA_DIR, UPLOAD_DIR, UPLOADS_WRITABLE, IS_VERCEL, PUBLIC_DIR: path.join(ROOT, 'public'),
  isProd, PORT, HOST: env.HOST || '0.0.0.0',
  SITE_URL,
  HTTPS: SITE_URL.startsWith('https://'),
  ADMIN_PATH: '/' + (env.ADMIN_PATH || 'admin').replace(/^\/+|\/+$/g, ''),
  SECRET,
  TRUST_PROXY: trust,
  ALLOWED_HOSTS: (env.ALLOWED_HOSTS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
  UPLOAD_MAX_MB: parseInt(env.UPLOAD_MAX_MB, 10) || 8,           // images, PDFs, audio
  VIDEO_MAX_MB: parseInt(env.VIDEO_MAX_MB, 10) || 60,            // videos (MP4/WebM)
  // Optional cloud database (Turso / libSQL). Leave empty to use the local SQLite file in DATA_DIR.
  SUPABASE_URL: (env.SUPABASE_URL || '').trim().replace(/\/+$/, ''), SUPABASE_KEY: (env.SUPABASE_SERVICE_KEY || env.SUPABASE_SECRET_KEY || '').trim(),
  TURSO_URL: env.TURSO_DATABASE_URL || '', TURSO_TOKEN: env.TURSO_AUTH_TOKEN || '', DB_DRIVER: env.DB_DRIVER || 'auto',
  DB_SYNC_SECONDS: Math.max(2, parseInt(env.DB_SYNC_SECONDS, 10) || 10),
  // Optional Google Drive upload through your own Apps Script web app (see docs/GOOGLE_DRIVE.md)
  DRIVE_SCRIPT_URL: env.DRIVE_SCRIPT_URL || '', DRIVE_ADMIN_KEY: env.DRIVE_ADMIN_KEY || '',
  ADMIN_EMAIL: env.ADMIN_EMAIL || '',
  ADMIN_PASSWORD: env.ADMIN_PASSWORD || '',
  WORKERS: parseInt(env.WORKERS, 10) || 0,
  // Raise this (e.g. 3) if many real visitors share one public IP address (a school, an office, mobile-carrier NAT).
  RATE_LIMIT_MULTIPLIER: Math.max(1, Math.min(50, parseFloat(env.RATE_LIMIT_MULTIPLIER) || 1)),
};
