'use strict';
// Supabase mirror tests against a FAKE PostgREST server (the real Supabase is not contacted).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { startServer, Client, OWNER } = require('./helpers');

const KEY = 'sb_secret_TESTKEY_0123456789';
const APP_SECRET = 'test-app-secret-0123456789-abcdefghijklmnopqrstuvwxyz-0123456789';
let row = null; let log = []; let mock; let base; const servers = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

before(async () => {
  mock = http.createServer((req, res) => {
    let b = ''; req.on('data', (d) => { b += d; });
    req.on('end', () => {
      const u = new URL(req.url, 'http://x'); const out = (code, obj) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.end(obj === undefined ? '' : JSON.stringify(obj)); };
      log.push({ method: req.method, path: u.pathname, q: u.search, auth: req.headers.authorization || '' });
      if (req.headers.apikey !== KEY) return out(401, { message: 'Invalid API key' });
      if (req.headers.authorization) return out(401, { message: 'sb_secret keys must not be sent as Bearer' });
      if (u.pathname !== '/rest/v1/ssp_state') return out(404, { code: 'PGRST205', message: 'Could not find the table' });
      const sel = u.searchParams.get('select') || '*'; const j = b ? JSON.parse(b) : null;
      if (req.method === 'GET') {
        if (!row) return out(200, []);
        return out(200, [sel.includes('payload') ? { version: row.version, payload: row.payload } : { version: row.version, updated_at: row.updated_at }]);
      }
      if (req.method === 'POST') { if (row) return out(409, { code: '23505', message: 'duplicate key' }); row = { id: j.id, version: j.version, payload: j.payload, updated_at: new Date().toISOString() }; return out(201, [row]); }
      if (req.method === 'PATCH') {
        const want = Number((u.searchParams.get('version') || '').replace('eq.', ''));
        if (!row || row.version !== want) return out(200, []);
        row = { ...row, version: j.version, payload: j.payload, updated_at: j.updated_at }; return out(200, [row]);
      }
      out(405, {});
    });
  });
  await new Promise((r) => mock.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${mock.address().port}`;
});
after(async () => { for (const s of servers) await s.stop(); await new Promise((r) => mock.close(r)); });

const boot = async (extra = {}) => { const s = await startServer({ env: { SUPABASE_URL: base, SUPABASE_SERVICE_KEY: KEY, APP_SECRET, ...extra } }); servers.push(s); return s; };
const login = async (s) => { const c = new Client(s.base); assert.equal((await c.login(OWNER.email, OWNER.password)).status, 302); return c; };

test('Supabase mirror: first server saves its data, a second EMPTY server restores it, and changes travel both ways', async () => {
  const A = await boot(); const a = await login(A);
  assert.ok(row && row.version >= 1, 'first start saved the default data to Supabase');
  assert.ok(log.every((l) => l.auth === ''), 'new-style secret key is only sent in the apikey header');
  assert.ok(Array.isArray(row.payload.tables.users) && row.payload.tables.users.length === 1);
  assert.ok(!('analytics_visits' in row.payload.tables), 'visitor statistics are not mirrored');
  assert.ok(row.payload.tables.products.length > 0, 'content is mirrored');

  // change something on A (site name) -> pushed
  const has = (name) => row.payload.tables.settings.some((s) => s.key === 'site_name' && s.value === name);
  const until = async (fn) => { for (let i = 0; i < 50 && !fn(); i++) await sleep(100); return fn(); };
  const r = await a.post('/admin/settings/general', { site_name: 'Mirror Test Polymers' }); assert.equal(r.status, 302, r.text.slice(0, 200));
  assert.ok(await until(() => has('Mirror Test Polymers')), 'the admin save was pushed to Supabase');

  // B starts with an empty disk -> restores from Supabase before seeding; the owner can sign in with the same password
  const B = await boot(); const b = await login(B);
  const home = await new Client(B.base).get('/'); assert.match(home.text, /Mirror Test Polymers/, 'B shows the data saved by A');

  // change on B -> A sees it on its next admin request (pull before admin requests)
  assert.equal((await b.post('/admin/settings/general', { site_name: 'Second Server Name' })).status, 302);
  assert.ok(await until(() => has('Second Server Name')), 'B pushed its change');
  await sleep(1700);   // admin freshness check is throttled to ~1.5 s
  const pageA = await a.get('/admin/settings/general'); assert.equal(pageA.status, 200); assert.match(pageA.text, /Second Server Name/, 'A pulled the change made on B');
  const homeA = await new Client(A.base).get('/'); assert.match(homeA.text, /Second Server Name/);
  assert.ok(!JSON.stringify(row.payload).includes(KEY), 'the Supabase key is never written into the snapshot');
});

test('Supabase mirror: a server that cannot reach Supabase keeps working and never overwrites the real copy with defaults', async () => {
  await sleep(1500);   // let pushes from the previous test settle
  const before = JSON.stringify(row); const v = row.version;
  const dead = await startServer({ env: { SUPABASE_URL: 'http://127.0.0.1:9', SUPABASE_SERVICE_KEY: KEY, APP_SECRET } }); servers.push(dead);
  const c = new Client(dead.base); const home = await c.get('/'); assert.equal(home.status, 200, 'site still works');
  await login(dead);
  assert.equal(row.version, v); assert.equal(JSON.stringify(row), before, 'Supabase copy untouched');
  const wrongKey = await startServer({ env: { SUPABASE_URL: base, SUPABASE_SERVICE_KEY: 'sb_secret_WRONG', APP_SECRET } }); servers.push(wrongKey);
  assert.equal((await new Client(wrongKey.base).get('/')).status, 200); assert.equal(row.version, v);
  assert.ok(!wrongKey.log().includes('sb_secret_WRONG'), 'key not printed in logs');
});

test('Supabase mirror on Vercel-style hosting: the save finishes BEFORE the admin gets the answer', async () => {
  const V = await boot({ VERCEL: '1', VERCEL_PROJECT_PRODUCTION_URL: '' }); const v = await login(V);
  await sleep(1200);
  const r = await v.post('/admin/settings/general', { site_name: 'Serverless Saved Name' }); assert.equal(r.status, 302, r.text.slice(0, 200));
  assert.ok(row.payload.tables.settings.some((s) => s.key === 'site_name' && s.value === 'Serverless Saved Name'), 'already in Supabase when the response arrived (no waiting)');
});

test('Integrations page in the admin: shows what is connected, and the Supabase buttons work', async () => {
  const S = await boot(); const c = await login(S);
  const page = await c.get('/admin/integrations'); assert.equal(page.status, 200);
  assert.match(page.text, /Supabase database copy/); assert.match(page.text, /Connected to 127\.0\.0\.1/); assert.match(page.text, /E-mail for enquiries \(EmailJS\)/); assert.match(page.text, /Google Drive uploads/);
  assert.ok(!page.text.includes(KEY), 'the key is never shown');
  const t = await c.post('/admin/integrations/supabase/test'); assert.equal(t.status, 302);
  assert.match((await c.get('/admin/integrations')).text, /Connected\. Supabase version/);
  const noConfirm = await c.post('/admin/integrations/supabase/push'); assert.match(noConfirm.location, /m=sb_confirm/);
  const push = await c.post('/admin/integrations/supabase/push', { confirm: 'yes' }); assert.equal(push.status, 302);
  assert.match((await c.get('/admin/integrations')).text, /Saved to Supabase|Already up to date/);
  // a server WITHOUT Supabase still shows the page, marked "still to do"
  const N = await startServer({ env: { APP_SECRET } }); servers.push(N); const n = await login(N);
  const p2 = await n.get('/admin/integrations'); assert.equal(p2.status, 200); assert.match(p2.text, /Not connected yet/);
  assert.match((await n.post('/admin/integrations/supabase/test')).location, /m=sb_off/);
});
