'use strict';
// Abuse-resistance tests that need the REAL (un-relaxed) rate limits, production flags or several workers.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { startServer, Client, OWNER, ROOT, sleep } = require('./helpers');

const rawGet = (port, p, host) => new Promise((resolve, reject) => {
  const r = http.request({ host: '127.0.0.1', port, path: p, headers: { Host: host } }, (res) => { let b = ''; res.on('data', (d) => { b += d; }); res.on('end', () => resolve({ status: res.statusCode, text: b })); });
  r.on('error', reject); r.end();
});

test('rate limits: chat, login; Retry-After is sent', async () => {
  const srv = await startServer({ env: { RATE_LIMIT_MULTIPLIER: '1' } });
  try {
    const c = new Client(srv.base); const codes = [];
    for (let i = 0; i < 40; i++) codes.push((await c.req('/api/chat', { method: 'POST', json: { q: 'hello' } })).status);
    assert.ok(codes.includes(429), 'chat is limited'); assert.equal(codes[0], 200);
    const limited = await c.req('/api/chat', { method: 'POST', json: { q: 'hello' } }); assert.equal(limited.status, 429); assert.ok(limited.headers.get('retry-after')); assert.match(JSON.parse(limited.text).error, /wait|many/i);
    // brute-force protection on the login form itself
    const l = new Client(srv.base); const res = [];
    for (let i = 0; i < 16; i++) res.push((await l.login('nobody@example.com', 'wrong-password-' + i)).status);
    assert.ok(res.includes(429), 'login attempts are limited per IP'); assert.equal((await l.get('/')).status, 200, 'the public site still works for that visitor');
  } finally { await srv.stop(); }
});

test('scanner/probe blocking: repeated probes lead to a temporary ban', async () => {
  const srv = await startServer({ env: { RATE_LIMIT_MULTIPLIER: '1' } });
  try {
    const c = new Client(srv.base); assert.equal((await c.get('/')).status, 200);
    for (const p of ['/.env', '/wp-login.php', '/phpmyadmin/', '/.git/config', '/xmlrpc.php', '/cgi-bin/x', '/etc/passwd']) await c.get(p);
    assert.equal((await c.get('/')).status, 403, 'the scanner is blocked for a while');
  } finally { await srv.stop(); }
});

test('allowed hosts: wrong Host header is refused (host-header injection)', async () => {
  const srv = await startServer({ env: { ALLOWED_HOSTS: 'example.test,www.example.test' } });
  try {
    const port = new URL(srv.base).port;
    assert.equal((await rawGet(port, '/', 'evil.test')).status, 421);
    const ok = await rawGet(port, '/', 'example.test'); assert.equal(ok.status, 200);
  } finally { await srv.stop(); }
});

test('production mode: HTTPS-only cookies, HSTS, upgrade-insecure-requests, no stack traces', async () => {
  const srv = await startServer({ env: { NODE_ENV: 'production', SITE_URL: 'https://example.test', ALLOWED_HOSTS: '', TRUST_PROXY: '1' } });
  try {
    const home = await new Client(srv.base).get('/');
    assert.match(home.headers.get('strict-transport-security') || '', /max-age=31536000/); assert.match(home.headers.get('content-security-policy'), /upgrade-insecure-requests/);
    assert.match(home.text, /href="https:\/\/example\.test\/"/, 'canonical uses SITE_URL');
    const raw = await fetch(srv.base + '/admin/login'); const pre = raw.headers.getSetCookie().join('\n'); assert.match(pre, /HttpOnly/i); assert.match(pre, /Secure/i); assert.match(pre, /SameSite=Strict/i);
    const lp = await raw.text(); const lt = lp.match(/name="_lt" value="([^"]+)"/)[1];
    const cookie = raw.headers.getSetCookie().map((x) => x.split(';')[0]).join('; ');
    const ok = await fetch(srv.base + '/admin/login', { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded', cookie }, body: new URLSearchParams({ email: OWNER.email, password: OWNER.password, _lt: lt }) });
    assert.equal(ok.status, 302); const sess = ok.headers.getSetCookie().join('\n'); assert.match(sess, /^__Host-/m, 'session cookie uses the __Host- prefix'); assert.match(sess, /Secure/); assert.match(sess, /HttpOnly/); assert.match(sess, /SameSite=Strict/i);
    const bad = await fetch(srv.base + '/%E0%A4%A'); assert.ok([400, 404].includes(bad.status)); assert.doesNotMatch(await bad.text(), /at .*\.js:\d+|node_modules/);
  } finally { await srv.stop(); }
});

test('cluster mode: several workers share one port and one database', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssp-cluster-')); const port = 3800 + Math.floor(Math.random() * 100);
  const proc = spawn(process.execPath, ['cluster.js'], { cwd: ROOT, env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', WORKERS: '2', SITE_URL: `http://127.0.0.1:${port}`, DATA_DIR: path.join(dir, 'data'), UPLOAD_DIR: path.join(dir, 'up'), ADMIN_EMAIL: OWNER.email, ADMIN_PASSWORD: OWNER.password, RATE_LIMIT_MULTIPLIER: '30' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; proc.stdout.on('data', (d) => { log += d; }); proc.stderr.on('data', (d) => { log += d; });
  try {
    const base = `http://127.0.0.1:${port}`;
    for (let i = 0; i < 80; i++) { try { if ((await fetch(base + '/healthz')).ok) break; } catch { /* starting */ } await sleep(150); }
    assert.match(log, /starting 2 worker/); assert.equal((log.match(/FIRST RUN/g) || []).length, 1, 'first-run credentials are printed exactly once');
    const ok = await Promise.all(Array.from({ length: 30 }, () => fetch(base + '/products').then((r) => r.status))); assert.ok(ok.every((s) => s === 200));
    // a change made through one worker is visible through the others immediately
    const a = new Client(base); await a.login(OWNER.email, OWNER.password); assert.equal((await a.post('/admin/c/features/new', { title: 'Cluster Feature QA', text: 'x', active: '1' })).status, 302);
    await sleep(1200);
    for (let i = 0; i < 12; i++) assert.match((await new Client(base).get('/')).text, /Cluster Feature QA/, 'every worker sees the new content (cross-process cache invalidation)');
  } finally { proc.kill('SIGTERM'); await new Promise((r) => { proc.on('exit', r); setTimeout(r, 6000); }); fs.rmSync(dir, { recursive: true, force: true }); }
  assert.doesNotMatch(log, /TypeError|ReferenceError|\[error\]|crashing/);
});
