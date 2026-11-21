'use strict';
// Test helpers: start a throw-away server (own database + uploads folder) and a tiny cookie-aware HTTP client.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const OWNER = { email: 'owner@example.com', password: 'Quartz-Lantern-2026!' };

async function startServer({ port, env = {} } = {}) {
  port = port || 3200 + Math.floor(Math.random() * 600);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssp-test-'));
  const proc = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env, NODE_ENV: 'development', PORT: String(port), HOST: '127.0.0.1', SITE_URL: `http://127.0.0.1:${port}`,
      DATA_DIR: path.join(dir, 'data'), UPLOAD_DIR: path.join(dir, 'uploads'), ADMIN_EMAIL: OWNER.email, ADMIN_PASSWORD: OWNER.password,
      RATE_LIMIT_MULTIPLIER: '30', TRUST_PROXY: '1', ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  proc.stdout.on('data', (d) => { log += d; }); proc.stderr.on('data', (d) => { log += d; });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try { const r = await fetch(base + '/healthz'); if (r.ok) break; } catch { /* not up yet */ }
    if (proc.exitCode !== null) throw new Error('server exited early:\n' + log);
    await new Promise((r) => setTimeout(r, 150));
  }
  return {
    base, dir, proc, log: () => log,
    async stop() { proc.kill('SIGTERM'); await new Promise((r) => { proc.on('exit', r); setTimeout(r, 4000); }); fs.rmSync(dir, { recursive: true, force: true }); },
  };
}

class Client {
  constructor(base) { this.base = base; this.jar = new Map(); this.csrfToken = null; }
  cookieHeader() { return [...this.jar].map(([k, v]) => `${k}=${v}`).join('; '); }
  async req(p, { method = 'GET', form, json, formData, headers = {}, rawBody } = {}) {
    const h = { ...headers }; const c = this.cookieHeader(); if (c) h.cookie = c;
    let body;
    if (form) { body = new URLSearchParams(form).toString(); h['content-type'] = 'application/x-www-form-urlencoded'; }
    else if (json !== undefined) { body = JSON.stringify(json); h['content-type'] = 'application/json'; }
    else if (formData) body = formData;
    else if (rawBody !== undefined) body = rawBody;
    const res = await fetch(this.base + p, { method, headers: h, body, redirect: 'manual' });
    const setCookies = res.headers.getSetCookie(); if (setCookies.length) this.csrfToken = null; // the session may have been rotated
    for (const sc of setCookies) {
      const [pair, ...attrs] = sc.split(';'); const i = pair.indexOf('='); const name = pair.slice(0, i).trim(); const val = pair.slice(i + 1).trim();
      const expired = attrs.some((a) => /^\s*max-age=0/i.test(a)) || attrs.some((a) => /^\s*expires=/i.test(a) && new Date(a.split('=')[1]).getTime() < Date.now());
      if (expired || !val) this.jar.delete(name); else this.jar.set(name, val);
    }
    const text = await res.text();
    return { status: res.status, headers: res.headers, text, location: res.headers.get('location') || '' };
  }
  get(p, o) { return this.req(p, o); }
  async csrf(refresh = false) {
    if (this.csrfToken && !refresh) return this.csrfToken;
    const r = await this.get('/admin/account');
    const m = r.text.match(/<meta name="csrf" content="([^"]+)"/); this.csrfToken = m ? m[1] : null; return this.csrfToken;
  }
  async post(p, data = {}, o = {}) { const tok = o.noCsrf ? undefined : await this.csrf(); return this.req(p, { method: 'POST', form: { ...(tok ? { _csrf: tok } : {}), ...data }, ...o }); }
  async login(email, password, next) {
    const lp = await this.get('/admin/login'); const lt = (lp.text.match(/name="_lt" value="([^"]+)"/) || [])[1];
    const r = await this.req('/admin/login', { method: 'POST', form: { email, password, _lt: lt, ...(next ? { next } : {}) } });
    this.csrfToken = null; return r;
  }
}

// RFC 6238 TOTP (so tests can act like an authenticator app)
function b32dec(s) { const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = ''; for (const c of s.toUpperCase()) { const i = A.indexOf(c); if (i >= 0) bits += i.toString(2).padStart(5, '0'); } const out = []; for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2)); return Buffer.from(out); }
function totp(secret, stepOffset = 0) {
  const c = Math.floor(Date.now() / 30000) + stepOffset; const buf = Buffer.alloc(8); buf.writeBigUInt64BE(BigInt(c));
  const h = crypto.createHmac('sha1', b32dec(secret)).update(buf).digest(); const o = h[h.length - 1] & 15;
  return String(((h[o] & 0x7f) << 24 | h[o + 1] << 16 | h[o + 2] << 8 | h[o + 3]) % 1000000).padStart(6, '0');
}
// 1x1 transparent PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const todayIST = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

module.exports = { startServer, Client, totp, PNG, sleep, todayIST, OWNER, ROOT };
