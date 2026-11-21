'use strict';
// Tests for: keyword landing pages, cookie consent + visitor statistics, login history, SEO Centre,
// media links / Google Drive upload (with the REAL Apps Script code), branding uploads and Vercel mode.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const { startServer, Client, PNG, OWNER, ROOT } = require('./helpers');

let srv; let owner; let anon;
before(async () => {
  srv = await startServer(); anon = new Client(srv.base); owner = new Client(srv.base);
  const r = await owner.login(OWNER.email, OWNER.password); assert.equal(r.status, 302, 'owner can sign in');
});
after(async () => { if (srv) await srv.stop(); });

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const PHRASE_SLUGS = ['best-pvc-pipe-manufacturer', 'best-pvc-pipe-company-tamil-nadu', 'best-pvc-pipe-company-madurai', 'best-manufacturing-company-madurai', 'pvc-pipes-madurai', 'best-quality-pvc-products', 'pvc-pipe-manufacturer-in-india'];

// ───────────────────────────────────────────── landing pages / SEO
test('keyword landing pages: one per target phrase, honest, with FAQ + breadcrumb markup, in sitemap and footer', async () => {
  const sm = await anon.get('/sitemap.xml'); assert.equal(sm.status, 200);
  for (const slug of PHRASE_SLUGS) {
    const r = await anon.get('/' + slug); assert.equal(r.status, 200, slug);
    assert.match(r.text, /<h1[^>]*>[^<]{10,}/, 'has an H1'); assert.doesNotMatch(r.text, /\{\{|\[object|undefined/, 'no unfilled tokens: ' + slug);
    assert.match(r.text, /"@type":"FAQPage"/); assert.match(r.text, /"@type":"BreadcrumbList"/); assert.match(r.text, /<link rel="canonical" href="[^"]+\/[^"]*"/);
    assert.ok(sm.text.includes('/' + slug), 'in sitemap: ' + slug);
    assert.doesNotMatch(r.text, /No\.? ?1 |#1 |guarantee[d]? (first|top|rank)/i, 'no ranking promises');
  }
  const home = await anon.get('/'); assert.match(home.text, /Popular searches/i); assert.match(home.text, /href="\/pvc-pipes-madurai"/);
  const ta = await anon.get('/ta/pvc-pipes-madurai'); assert.equal(ta.status, 200); assert.match(ta.text, /[஀-௿]{4,}/, 'Tamil text present');
  assert.equal((await anon.get('/no-such-landing-page')).status, 404);
  const cp = await anon.get('/cookie-policy'); assert.equal(cp.status, 200); assert.match(cp.text, /ssp_consent/);
});

// ───────────────────────────────────────────── cookies and visitor statistics
test('cookie notice is shown; the returning-visitor cookie is only set AFTER consent', async () => {
  const c = new Client(srv.base);
  const first = await c.get('/pvc-pipes-madurai', { headers: { 'user-agent': IPHONE } });
  assert.match(first.text, /id="cookie-banner"/); assert.match(first.text, /data-cookie="all"/); assert.match(first.text, /data-cookie="essential"/);
  assert.ok(!c.jar.has('ssp_vid'), 'no tracking cookie without consent');
  c.jar.set('ssp_consent', 'essential'); await c.get('/', { headers: { 'user-agent': IPHONE } }); assert.ok(!c.jar.has('ssp_vid'), 'still none after "essential only"');
  c.jar.set('ssp_consent', 'all'); await c.get('/', { headers: { 'user-agent': IPHONE } });
  assert.match(c.jar.get('ssp_vid') || '', /^[a-f0-9]{24}$/, 'random id after "accept all"');
  const sc = (await new Client(srv.base).req('/', { headers: { cookie: 'ssp_consent=all' } })).headers.getSetCookie().find((x) => x.startsWith('ssp_vid=')) || '';
  assert.match(sc, /HttpOnly/i); assert.match(sc, /SameSite=Lax/i);
  // trackers never appear in the HTML as inline code (strict CSP)
  assert.doesNotMatch(first.text, /googletagmanager|clarity\.ms/);
});

test('time-on-page beacon: JSON only, bad data ignored', async () => {
  const ok = await anon.req('/api/t', { method: 'POST', json: { p: '/pvc-pipes-madurai', s: 14 } }); assert.equal(ok.status, 204);
  const bad = await anon.req('/api/t', { method: 'POST', json: { p: 'https://evil.example/', s: 9999 } }); assert.equal(bad.status, 204, 'accepted but ignored');
  const form = await anon.req('/api/t', { method: 'POST', form: { p: '/', s: 5 } }); assert.ok([400, 415].includes(form.status), 'form posts are refused: ' + form.status);
});

test('admin Visitors: counts devices, country, referrer; ignores bots; shows live visitors', async () => {
  const v = new Client(srv.base);
  const hdr = { 'user-agent': IPHONE, 'x-vercel-ip-country': 'IN', 'x-vercel-ip-city': 'Madurai', 'accept-language': 'ta-IN,ta;q=0.9', referer: 'https://www.google.com/search?q=pvc' };
  for (let i = 0; i < 2; i++) assert.equal((await v.get('/best-quality-pvc-products', { headers: hdr })).status, 200);
  await new Client(srv.base).get('/best-quality-pvc-products', { headers: { 'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' } });
  const page = await owner.get('/admin/visitors?days=7'); assert.equal(page.status, 200);
  for (const want of ['Online now', 'mobile', 'iOS', 'Safari', 'Madurai', 'India', 'google.com', '/best-quality-pvc-products']) assert.ok(page.text.includes(want), 'visitors page shows ' + want);
  assert.doesNotMatch(page.text, /Googlebot/); assert.doesNotMatch(page.text, /\b(?:\d{1,3}\.){3}\d{1,3}\b/, 'no IP addresses in the visitor log');
  const csv = await owner.get('/admin/visitors.csv?days=7'); assert.match(csv.headers.get('content-type'), /text\/csv/); assert.match(csv.text, /^date,page_views,visitors/);
  assert.equal((await anon.get('/admin/visitors')).status, 302, 'sign-in required');
});

// ───────────────────────────────────────────── hardening of the visitor statistics (runs the module in its own throw-away database)
test('visitor statistics cannot be flooded: made-up paths get no time rows, referrers are capped, no IP/UA stored', () => {
  const dir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'ssp-an-'));
  const code = `
    const { EventEmitter } = require('events'); const a = require('./src/analytics'); const db = require('./src/db');
    const mk = (i) => { const h = { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537', referer: 'https://flood' + i + '.example/x' };
      const req = { method: 'GET', path: '/real-page', query: {}, cookies: {}, ip: '203.0.113.' + (i % 250), hostname: 'site.test', get: (k) => h[k.toLowerCase()] };
      const res = Object.assign(new EventEmitter(), { statusCode: 200, getHeader: () => 'text/html; charset=utf-8', cookie() {} }); a.middleware(req, res, () => {}); res.emit('finish'); };
    for (let i = 0; i < 450; i++) mk(i);
    a.flush(); a.timeOnPage('/real-page', 20); a.timeOnPage('/made-up-' + Date.now(), 20); a.timeOnPage('//evil', 20); a.flush();
    const q = (sql) => db.prepare(sql).get();
    console.log(JSON.stringify({ refs: q("SELECT COUNT(*) n FROM analytics_dim WHERE dim='ref'").n, times: db.prepare('SELECT path FROM analytics_time').all().map((r) => r.path),
      visits: q('SELECT COUNT(*) n FROM analytics_visits').n, cols: Object.keys(q('SELECT * FROM analytics_visits LIMIT 1')) }));`;
  const r = require('node:child_process').spawnSync(process.execPath, ['-e', code], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, DATA_DIR: dir, UPLOAD_DIR: path.join(dir, 'u'), NODE_ENV: 'development' } });
  fs.rmSync(dir, { recursive: true, force: true });
  const out = JSON.parse((r.stdout.trim().split('\n').pop()) || '{}'); assert.ok(out.refs, r.stderr.slice(0, 400));
  assert.ok(out.refs <= 302, 'distinct referrers per day are capped, got ' + out.refs); assert.deepEqual(out.times, ['/real-page'], 'only a really-viewed page collects time');
  assert.ok(out.visits >= 400); assert.ok(!out.cols.some((c) => /^(ip|ua|user_agent)$/i.test(c)), 'no IP / raw User-Agent column: ' + out.cols.join());
});

// ───────────────────────────────────────────── login history and devices
test('login history lists sign-ins and failures; a device can be signed out remotely', async () => {
  const other = new Client(srv.base); const r = await other.login(OWNER.email, OWNER.password); assert.equal(r.status, 302);
  assert.equal((await other.get('/admin')).status, 200);
  const bad = new Client(srv.base); await bad.login(OWNER.email, 'definitely-wrong-password-9');
  const page = await owner.get('/admin/devices'); assert.equal(page.status, 200);
  assert.match(page.text, /Sign-in history/); assert.match(page.text, /wrong password/); assert.match(page.text, /signed in/);
  assert.match(page.text, /this device/);
  const sids = [...page.text.matchAll(/name="sid" value="([a-f0-9]{64})"/g)].map((m) => m[1]); assert.ok(sids.length >= 1, 'other sessions can be ended');
  assert.equal((await owner.post('/admin/devices/revoke', { sid: 'f'.repeat(64) })).location.includes('m=bad'), true, 'unknown session id is refused');
  for (const sid of sids) await owner.post('/admin/devices/revoke', { sid });
  const after = await other.get('/admin'); assert.equal(after.status, 302); assert.match(after.location, /login/, 'revoked device is signed out');
  assert.equal((await owner.get('/admin')).status, 200, 'own session survives');
  assert.equal((await anon.get('/admin/devices')).status, 302);
});

// ───────────────────────────────────────────── SEO centre
test('SEO Centre: every target phrase has a live landing page; checks and audit render', async () => {
  const r = await owner.get('/admin/seo'); assert.equal(r.status, 200);
  assert.match(r.text, /SEO health/); assert.match(r.text, /Target search phrases/); assert.doesNotMatch(r.text, /No page yet/);
  assert.equal((r.text.match(/Search on Google/g) || []).length, 7); assert.match(r.text, /Nobody .*can promise the #1/s, 'honest note present');
  assert.match(r.text, /Google Business Profile/); assert.match(r.text, /Search Console/);
  assert.equal((await anon.get('/admin/seo')).status, 302);
  const list = await owner.get('/admin/c/seo_pages'); assert.equal(list.status, 200); assert.match(list.text, /How to Choose the Best PVC Pipe Manufacturer/);
});

test('SEO inspector script is served and only referenced for a signed-in admin', async () => {
  const js = await anon.get('/js/seo-inspector.js'); assert.equal(js.status, 200); assert.doesNotMatch(js.text, /innerHTML|eval\(/, 'inspector builds the DOM with textContent only');
  assert.doesNotMatch((await anon.get('/pvc-pipes-madurai')).text, /seo-inspector/);
  assert.match((await owner.get('/pvc-pipes-madurai')).text, /seo-inspector\.js/);
});

// ───────────────────────────────────────────── media: links and Google Drive
const DRIVE_ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz012345';
test('media: paste a Google Drive link (image, video), folder links and bad links are handled', async () => {
  const link = async (url, extra = {}) => owner.req('/admin/media/link', { method: 'POST', form: { _csrf: await owner.csrf(), url, ...extra }, headers: { accept: 'application/json' } });
  const img = await link(`https://drive.google.com/file/d/${DRIVE_ID}/view?usp=sharing`, { title: 'Plant photo', kind: 'image' });
  assert.equal(img.status, 200, img.text); const f = JSON.parse(img.text).file; assert.equal(f.file, `https://lh3.googleusercontent.com/d/${DRIVE_ID}`); assert.equal(f.source, 'drive');
  const vid = await link(`https://drive.google.com/open?id=${DRIVE_ID.replace('1A', '1V')}`, { kind: 'video' }); assert.equal(vid.status, 200);
  assert.match(JSON.parse(vid.text).file.file, /^https:\/\/drive\.google\.com\/file\/d\/1VbC[\w-]+\/preview$/);
  const again = await link(`https://drive.google.com/file/d/${DRIVE_ID}/view`, { kind: 'image' }); assert.equal(JSON.parse(again.text).file.existing, true, 'no duplicates');
  const folder = await link('https://drive.google.com/drive/folders/1XyZabcdefghijklmnopqrstuvwxyz1234'); assert.equal(folder.status, 400); assert.match(folder.text, /folder/i);
  for (const bad of ['javascript:alert(1)', 'http://example.com/a.png', 'not a url', 'https://example.com/"onerror="x']) assert.equal((await link(bad)).status, 400, bad);
  const api = JSON.parse((await owner.get('/admin/media/api?kind=image')).text); assert.ok(api.files.some((x) => x.source === 'drive'));
  assert.equal(api.caps.local !== undefined, true, 'picker is told what this host can do');
  assert.equal((await anon.req('/admin/media/link', { method: 'POST', form: { url: 'https://example.com/a.png' } })).status, 401, 'sign-in required');
});

test('media: the assets folder is scanned and files in it can be picked', async () => {
  const dir = path.join(ROOT, 'public', 'assets', 'images'); const name = `zz-test-${process.pid}.png`; const file = path.join(dir, name);
  fs.writeFileSync(file, PNG);
  try {
    const api = JSON.parse((await owner.get('/admin/media/api?src=assets&kind=image')).text);
    assert.ok(api.files.some((x) => x.file === `/assets/images/${name}`), 'new file found'); assert.equal((await anon.get(`/assets/images/${name}`)).status, 200);
  } finally { fs.rmSync(file, { force: true }); }
});

// A tiny stand-in for Google that runs the REAL docs/drive/Code.gs against fake Drive objects.
function loadAppsScript(props) {
  const created = []; const shared = [];
  const sandbox = {
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s) => ({ s, setMimeType() { return this; } }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] }) },
    Utilities: { base64Decode: (s) => Array.from(Buffer.from(s, 'base64')).map((b) => (b > 127 ? b - 256 : b)), newBlob: (bytes, mime, name) => ({ bytes, mime, name }), formatDate: () => '261119-120000' },
    DriveApp: { Access: { ANYONE_WITH_LINK: 'ANYONE_WITH_LINK' }, Permission: { VIEW: 'VIEW' },
      getFolderById: (id) => ({ createFile: (blob) => { created.push({ id, blob }); return { getId: () => 'F' + 'x'.repeat(24) + created.length, getName: () => blob.name, setSharing: (a, p) => shared.push([a, p]) }; } }) },
  };
  vm.createContext(sandbox); vm.runInContext(fs.readFileSync(path.join(ROOT, 'docs', 'drive', 'Code.gs'), 'utf8'), sandbox);
  const post = (obj) => JSON.parse(sandbox.doPost({ postData: { contents: typeof obj === 'string' ? obj : JSON.stringify(obj) } }).s);
  return { post, created, shared, get: () => JSON.parse(sandbox.doGet().s) };
}
const KEY = 'k-' + 'a1b2c3d4e5'.repeat(3);

test('Apps Script (docs/drive/Code.gs): key, folder lock, allowed types, real content check, size, safe names', () => {
  const gs = loadAppsScript({ ADMIN_KEY: KEY, FOLDER_ID: 'FOLDER123' });
  const b64 = PNG.toString('base64');
  assert.equal(gs.get().ok, true);
  assert.equal(gs.post({ action: 'upload', key: 'wrong', name: 'a.png', mime: 'image/png', data: b64 }).error, 'Wrong key.');
  assert.equal(gs.post({ action: 'upload', name: 'a.png', mime: 'image/png', data: b64 }).ok, false, 'missing key');
  assert.equal(gs.post('not json').ok, false);
  assert.equal(gs.post({ action: 'ping', key: KEY }).pong, true);
  assert.match(gs.post({ action: 'delete', key: KEY }).error, /Unknown action/);
  assert.match(gs.post({ action: 'upload', key: KEY, name: 'x.exe', mime: 'application/x-msdownload', data: b64 }).error, /not allowed/);
  assert.match(gs.post({ action: 'upload', key: KEY, name: 'x.svg', mime: 'image/svg+xml', data: b64 }).error, /not allowed/);
  assert.match(gs.post({ action: 'upload', key: KEY, name: 'fake.png', mime: 'image/png', data: Buffer.from('<html><script>alert(1)</script></html>').toString('base64') }).error, /does not match/);
  assert.match(gs.post({ action: 'upload', key: KEY, name: 'big.png', mime: 'image/png', data: 'A'.repeat(50 * 1024 * 1024) }).error, /too large/);
  assert.equal(gs.created.length, 0, 'nothing was created by the rejected requests');
  const ok = gs.post({ action: 'upload', key: KEY, name: '../../My Logo (final).PNG', mime: 'image/png', folder: 'EVIL', data: b64 });
  assert.equal(ok.ok, true); assert.match(ok.id, /^[A-Za-z0-9_-]{20,}$/); assert.match(ok.name, /^My-Logo-final-\d{6}-\d{6}\.png$/, ok.name);
  assert.equal(gs.created[0].id, 'FOLDER123', 'the folder cannot be chosen by the request'); assert.deepEqual(gs.shared[0], ['ANYONE_WITH_LINK', 'VIEW']);
  assert.match(loadAppsScript({}).post({ action: 'upload', key: 'x', mime: 'image/png', data: b64 }).error, /Not set up/);
});

test('upload to Google Drive from the admin (through a mock Apps Script web app); the key never leaks', async () => {
  const gs = loadAppsScript({ ADMIN_KEY: KEY, FOLDER_ID: 'FOLDER123' });
  const mock = http.createServer((req, res) => { let b = ''; req.on('data', (d) => { b += d; }); req.on('end', () => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(gs.post(b))); }); });
  await new Promise((r) => mock.listen(0, '127.0.0.1', r)); const port = mock.address().port;
  try {
    const s = await owner.post('/admin/settings/media', { drive_script_url: `http://127.0.0.1:${port}/exec`, drive_admin_key: KEY, upload_target: 'local' }); assert.equal(s.status, 302, s.text.slice(0, 300));
    const page = await owner.get('/admin/settings/media'); assert.ok(!page.text.includes(KEY), 'secret key is never printed back');
    assert.ok(!(await owner.get('/admin/media')).text.includes(KEY));
    const tok = await owner.csrf();
    const send = async (target) => { const fd = new FormData(); fd.append('files', new Blob([PNG], { type: 'image/png' }), 'Factory front.png'); fd.append('target', target); return owner.req('/admin/media/upload', { method: 'POST', formData: fd, headers: { 'x-csrf-token': tok } }); };
    const up = await send('drive'); assert.equal(up.status, 200, up.text); const f = JSON.parse(up.text).files[0];
    assert.equal(f.source, 'drive'); assert.match(f.file, /^https:\/\/lh3\.googleusercontent\.com\/d\/F[x]{24}\d+$/); assert.equal(gs.created.length, 1);
    const local = await send('local'); assert.equal(local.status, 200); assert.match(JSON.parse(local.text).files[0].file, /^\/uploads\//, 'local target still saves to the assets/uploads folder');
    await owner.post('/admin/settings/media', { drive_admin_key: 'a-different-wrong-key-0123456789' });
    const bad = await send('drive'); assert.equal(bad.status, 400); assert.match(bad.text, /Wrong key/);
  } finally { await new Promise((r) => mock.close(r)); await owner.post('/admin/settings/media', { drive_script_url: '' }); }
});

// ───────────────────────────────────────────── branding
test('branding: favicon, app icon and admin logo come from Settings', async () => {
  const s = await owner.post('/admin/settings/general', { favicon: '/assets/brand/fav.png', pwa_icon: '/assets/brand/app-512.png', admin_logo: '/assets/brand/admin-logo.png' });
  assert.equal(s.status, 302, s.text.slice(0, 300));
  const home = (await anon.get('/')).text; assert.match(home, /rel="icon" href="\/assets\/brand\/fav\.png"/); assert.match(home, /rel="apple-touch-icon" href="\/assets\/brand\/app-512\.png"/);
  const mf = JSON.parse((await anon.get('/manifest.webmanifest')).text); assert.ok(mf.icons.some((i) => i.src === '/assets/brand/app-512.png' && i.sizes === '512x512'));
  assert.match((await new Client(srv.base).get('/admin/login')).text, /src="\/assets\/brand\/admin-logo\.png"/, 'login page shows the admin logo');
  assert.match((await owner.get('/admin')).text, /\/assets\/brand\/admin-logo\.png/);
  assert.equal((await anon.get('/favicon.ico')).location, '/assets/brand/fav.png');
});

// ───────────────────────────────────────────── Vercel mode
test('Vercel mode: needs APP_SECRET, uses the Vercel address, refuses disk uploads kindly, still accepts links', async () => {
  const noSecret = spawnSync(process.execPath, ['server.js'], { cwd: ROOT, encoding: 'utf8', timeout: 20000, env: { ...process.env, VERCEL: '1', APP_SECRET: '', PORT: '3991', DATA_DIR: path.join(require('node:os').tmpdir(), 'ssp-v-' + process.pid) } });
  assert.notEqual(noSecret.status, 0, 'refuses to start without APP_SECRET'); assert.match(noSecret.stdout + noSecret.stderr, /APP_SECRET/);
  const v = await startServer({ env: { VERCEL: '1', APP_SECRET: 'v'.repeat(48), SITE_URL: '', VERCEL_PROJECT_PRODUCTION_URL: 'demo-pipes.vercel.app' } });
  try {
    const c = new Client(v.base); assert.equal((await c.login(OWNER.email, OWNER.password)).status, 302);
    assert.match((await c.get('/sitemap.xml')).text, /https:\/\/demo-pipes\.vercel\.app\//, 'site address comes from Vercel');
    const dash = await c.get('/admin'); assert.match(dash.text, /Turso/, 'dashboard warns that a cloud database is needed');
    const tok = await c.csrf(); const fd = new FormData(); fd.append('files', new Blob([PNG], { type: 'image/png' }), 'a.png'); fd.append('target', 'local');
    const up = await c.req('/admin/media/upload', { method: 'POST', formData: fd, headers: { 'x-csrf-token': tok } }); assert.equal(up.status, 400); assert.match(up.text, /cannot store files|Google Drive|link/i);
    const link = await c.req('/admin/media/link', { method: 'POST', form: { _csrf: tok, url: `https://drive.google.com/file/d/${DRIVE_ID}/view` }, headers: { accept: 'application/json' } }); assert.equal(link.status, 200);
    assert.equal((await c.get('/pvc-pipes-madurai')).status, 200);
  } finally { await v.stop(); }
});

// ───────────────────────────────────────────── home page hero + visitor theme icon + readable colours
test('home hero: text only by default (no pipe picture); video / picture background and split layout are admin options', async () => {
  const hero = (t) => (t.match(/<section class="hero[^"]*"[\s\S]*?<\/section>/) || [''])[0];
  const home = (await anon.get('/')).text; const h = hero(home);
  assert.match(h, /<h1[^>]*>/); assert.doesNotMatch(h, /hero-art|hero-3d|pipe-art|<video/, 'default hero has no pipe picture and no video'); assert.match(h, /hero--center/);
  assert.doesNotMatch((await anon.get('/ta/')).text.match(/<section class="hero[^"]*"[\s\S]*?<\/section>/)[0], /hero-art|hero-3d|pipe-art/, 'Tamil home too');
  try {
    assert.equal((await owner.post('/admin/settings/content', { hero_poster: '/assets/images/bg.jpg' })).status, 302);
    assert.match(hero((await anon.get('/')).text), /hero--video[\s\S]*class="[^"]*hero-video[^"]*"[^>]*bg\.jpg|bg\.jpg[^>]*class="[^"]*hero-video/, 'a picture background is used');
    assert.equal((await owner.post('/admin/settings/content', { hero_video: '/assets/videos/hero.mp4' })).status, 302);
    const v = hero((await anon.get('/')).text); assert.match(v, /<video class="hero-video"[^>]*src="\/assets\/videos\/hero\.mp4"[^>]*autoplay muted loop playsinline/); assert.match(v, /hero--video/);
    assert.equal((await owner.post('/admin/settings/appearance', { hero_overlay: 'strong' })).status, 302); assert.match(hero((await anon.get('/')).text), /hero--ov-strong/);
    assert.equal((await owner.post('/admin/settings/appearance', { hero_style: 'split', hero_overlay: 'soft' })).status, 302);
    assert.match(hero((await anon.get('/')).text), /hero-art/, 'split layout still has the 3D / picture area for owners who want it');
  } finally { await owner.post('/admin/settings/content', { hero_poster: '', hero_video: '' }); await owner.post('/admin/settings/appearance', { hero_style: 'center', hero_overlay: 'soft' }); }
  assert.doesNotMatch(hero((await anon.get('/')).text), /hero-art|<video/);
});

test('visitor theme picker icon is hidden unless the admin switches it on; Themes stay in the admin', async () => {
  const picker = /data-pop="theme-pop"/;
  assert.doesNotMatch((await anon.get('/')).text, picker, 'no theme icon for visitors by default');
  assert.equal((await owner.get('/admin/themes')).status, 200, 'themes are still managed in the admin');
  try {
    assert.equal((await owner.post('/admin/settings/appearance', { allow_visitor_theme: '1' })).status, 302);
    assert.match((await anon.get('/')).text, picker, 'owner can switch it on');
  } finally { await owner.post('/admin/settings/appearance', {}); }
  assert.doesNotMatch((await anon.get('/')).text, picker, 'and off again');
});

test('every built-in theme has readable helper text (WCAG AA 4.5:1) on its backgrounds', () => {
  const code = `const T=require('./src/themes');const lum=(h)=>{const n=parseInt(h.replace('#','').slice(0,6),16);return [(n>>16)&255,(n>>8)&255,n&255].map(v=>{v/=255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4}).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0)};const ra=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};const bad=[];for(const t of T.BUILTIN){const v=T.complete(t);const r=Math.min(...['bg','bg-alt','surface'].map(k=>ra(v['text-muted'],v[k])));if(r<4.5)bad.push(t.slug+' '+r.toFixed(2));}console.log(JSON.stringify({n:T.BUILTIN.length,bad}));`;
  const r = spawnSync(process.execPath, ['-e', code], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, DATA_DIR: fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'ssp-th-')) } });
  const out = JSON.parse(r.stdout.trim().split('\n').pop()); assert.ok(out.n >= 20); assert.deepEqual(out.bad, []);
});
