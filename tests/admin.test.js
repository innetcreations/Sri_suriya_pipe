'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, Client, totp, PNG, sleep, todayIST, OWNER } = require('./helpers');

let srv; let owner; let anon;
const NEWPW = 'Violet-Harbor-Maple-77!';
before(async () => {
  srv = await startServer(); anon = new Client(srv.base); owner = new Client(srv.base);
  const r = await owner.login(OWNER.email, OWNER.password); assert.equal(r.status, 302, 'owner can sign in');
});
after(async () => { if (srv) await srv.stop(); });

// creates a user as the owner, signs in with the one-time password and sets a new one
async function makeUser(role, email) {
  const r = await owner.post('/admin/users/new', { email, name: role + ' tester', role });
  assert.equal(r.status, 200, 'user created: ' + r.text.slice(0, 200));
  const temp = (r.text.match(/Temporary password:\s*<code class="a-secret">([^<]+)</) || [])[1]; assert.ok(temp, 'temporary password shown once');
  const c = new Client(srv.base); const l = await c.login(email, temp); assert.equal(l.status, 302);
  const dash = await c.get('/admin'); assert.equal(dash.status, 302); assert.match(dash.location, /account\?force=1/, 'must change password first');
  const ch = await c.post('/admin/account/password', { current: temp, password: NEWPW, password2: NEWPW }); assert.equal(ch.status, 302, ch.text.slice(0, 300));
  assert.equal((await c.get('/admin')).status, 200); return c;
}

test('admin area requires sign-in; login page is protected', async () => {
  const r = await anon.get('/admin'); assert.equal(r.status, 302); assert.match(r.location, /\/admin\/login/);
  assert.equal((await anon.get('/admin/c/products')).status, 302);
  assert.equal((await anon.req('/admin/c/products/new', { method: 'POST', form: { name: 'x' } })).status, 401);
  assert.equal((await anon.get('/admin/backup/content.json')).status, 302);
  const lp = await anon.get('/admin/login'); assert.match(lp.text, /name="_lt"/); assert.match(lp.headers.get('x-frame-options') || '', /DENY/i);
});

test('login: generic errors, forged form blocked, open-redirect impossible', async () => {
  const c = new Client(srv.base);
  const forged = await c.req('/admin/login', { method: 'POST', form: { email: OWNER.email, password: OWNER.password } });
  assert.equal(forged.status, 302); assert.match(forged.location, /m=exp/, 'login without the form token is rejected');
  const wrongPw = await c.login(OWNER.email, 'definitely-wrong-1'); const noUser = await c.login('nobody@example.com', 'definitely-wrong-1');
  assert.equal(wrongPw.status, 401); assert.equal(noUser.status, 401);
  assert.equal(wrongPw.text.match(/role="alert">([^<]+)</)[1], noUser.text.match(/role="alert">([^<]+)</)[1], 'same message for unknown e-mail and wrong password');
  for (const next of ['//evil.example', 'https://evil.example/x', '/\\evil.example', 'javascript:alert(1)']) {
    const k = new Client(srv.base); const r = await k.login(OWNER.email, OWNER.password, next);
    assert.equal(r.status, 302); assert.ok(r.location === '/admin' || r.location.startsWith('/admin'), `redirect stays inside admin for next=${next} → ${r.location}`);
  }
  const ok = new Client(srv.base); const r = await ok.login(OWNER.email, OWNER.password, '/admin/enquiries'); assert.equal(r.location, '/admin/enquiries');
});

test('account lock-out after repeated wrong passwords', async () => {
  const email = 'locktest@example.com';
  const r = await owner.post('/admin/users/new', { email, name: 'Lock', role: 'editor' });
  const temp = (r.text.match(/<code class="a-secret">([^<]+)<\/code>\s*<\/p>\s*<p class="a-muted">The person/) || r.text.match(/Temporary password:\s*<code class="a-secret">([^<]+)</) || [])[1];
  const c = new Client(srv.base); let last;
  for (let i = 0; i < 5; i++) last = await c.login(email, 'wrong-password-' + i);
  assert.match(last.text, /locked|Too many/i);
  const right = await c.login(email, temp); assert.equal(right.status, 401, 'even the right password is refused while locked');
  assert.match(right.text, /Too many failed attempts/);
});

test('CSRF: state-changing admin requests need the session token', async () => {
  const no = await owner.req('/admin/c/faqs/new', { method: 'POST', form: { question: 'q', answer: 'a' } }); assert.equal(no.status, 403);
  const bad = await owner.req('/admin/c/faqs/new', { method: 'POST', form: { question: 'q', answer: 'a', _csrf: 'forged-token' } }); assert.equal(bad.status, 403);
  const logoutNoToken = await owner.req('/admin/logout', { method: 'POST', form: {} }); assert.equal(logoutNoToken.status, 403);
  const cross = await owner.req('/admin/c/faqs/new', { method: 'POST', form: { question: 'q', answer: 'a', _csrf: await owner.csrf() }, headers: { origin: 'http://evil.example' } });
  assert.equal(cross.status, 403, 'cross-site origin blocked even with a valid token');
  assert.equal((await owner.get('/admin/c/faqs/new/delete')).status, 404, 'no state change via GET');
});

test('content CRUD: create → public → edit → hide → duplicate → delete (with XSS attempts)', async () => {
  const evilName = 'QA <script>alert(1)</script> Pipe';
  const body = '<p>Hello</p><script>alert(2)</script><img src=x onerror=alert(3)><a href="javascript:alert(4)">bad</a><iframe src="https://evil.example/x"></iframe><a href="https://ok.example" target="_blank">ok</a>';
  const cr = await owner.post('/admin/c/products/new', { name: evilName, category_id: '1', summary: '<img src=x onerror=alert(5)>sum', body, sizes: '1", 2"', colors: 'Blue', active: '1', specs: 'Pressure: PN6' });
  assert.equal(cr.status, 302, cr.text.slice(0, 400)); assert.match(cr.location, /m=created/);
  const list = await owner.get('/admin/c/products?q=QA'); const id = list.text.match(/href="\/admin\/c\/products\/(\d+)"/)[1];
  const edit = await owner.get(`/admin/c/products/${id}`); const slug = edit.text.match(/name="slug"[^>]*value="([^"]+)"/)[1]; assert.match(slug, /^qa-/);
  const pub = await anon.get(`/products/${slug}`); assert.equal(pub.status, 200);
  assert.doesNotMatch(pub.text, /<script>alert/i, 'script tags never survive'); assert.doesNotMatch(pub.text, /<img[^>]*onerror/i); assert.doesNotMatch(pub.text, /href="javascript:/i); assert.doesNotMatch(pub.text, /evil\.example/);
  assert.match(pub.text, /rel="noopener noreferrer"/);
  // edit → visible on the public site immediately (cache invalidated)
  const up = await owner.post(`/admin/c/products/${id}`, { name: 'QA Renamed Pipe', category_id: '1', summary: 'new summary text', sizes: '3"', active: '1', ta__name: 'தமிழ் பெயர் சோதனை' });
  assert.equal(up.status, 302); assert.match((await anon.get('/products')).text, /QA Renamed Pipe/);
  assert.match((await anon.get(`/ta/products/${slug}`)).text, /தமிழ் பெயர் சோதனை/, 'Tamil override shown on /ta');
  // validation errors keep the form and show the message
  const inv = await owner.post(`/admin/c/products/${id}`, { name: '', category_id: '1', active: '1' }); assert.equal(inv.status, 422); assert.match(inv.text, /is required/);
  // hide → 404 for the public, still editable
  const hide = await owner.post(`/admin/c/products/${id}`, { name: 'QA Renamed Pipe', category_id: '1' }); assert.equal(hide.status, 302, 'unticking "visible" hides it');
  assert.equal((await anon.get(`/products/${slug}`)).status, 404);
  await owner.post(`/admin/c/products/${id}/toggle`); assert.equal((await anon.get(`/products/${slug}`)).status, 200);
  const dup = await owner.post(`/admin/c/products/${id}/duplicate`); assert.match(dup.location, /m=duplicated/); assert.match((await owner.get('/admin/c/products?q=copy')).text, /QA Renamed Pipe \(copy\)/);
  assert.equal((await owner.post(`/admin/c/products/${id}/move`, { dir: 'down' })).status, 302);
  assert.equal((await owner.post(`/admin/c/products/${id}/delete`)).status, 302); assert.equal((await anon.get(`/products/${slug}`)).status, 404);
  assert.equal((await owner.get('/admin/c/products/999999')).status, 404);
});

test('slugs: Tamil-only titles still get a working URL; duplicates are made unique', async () => {
  await owner.post('/admin/c/faqs/new', { question: 'தமிழ் கேள்வி', answer: '<p>பதில்</p>', active: '1' });
  const a = await owner.post('/admin/c/pages/new', { title: 'Same Title', body: '<p>one</p>', active: '1' }); const b = await owner.post('/admin/c/pages/new', { title: 'Same Title', body: '<p>two</p>', active: '1' });
  assert.equal(a.status, 302); assert.equal(b.status, 302);
  assert.equal((await anon.get('/same-title')).status, 200); assert.equal((await anon.get('/same-title-2')).status, 200);
  const t = await owner.post('/admin/c/pages/new', { title: 'வணக்கம்', body: '<p>x</p>', active: '1' }); assert.equal(t.status, 302);
  assert.match((await owner.get('/admin/c/pages?q=வணக்கம்')).text, /\/admin\/c\/pages\/\d+/);
});

test('enquiries: appear in admin, status workflow, spam folder, safe CSV export', async () => {
  const tok = JSON.parse((await anon.get('/api/form-token')).text).token; await sleep(2700);
  const evil = '=HYPERLINK("http://evil.example","click")';
  const r = await anon.req('/api/enquiry', { method: 'POST', json: { name: evil, phone: '9000011111', message: '<img src=x onerror=alert(1)>', product: 'Pipe', _ft: tok } });
  assert.equal(r.status, 200); const ref = JSON.parse(r.text).ref;
  const list = await owner.get('/admin/enquiries?q=' + ref); assert.match(list.text, new RegExp(ref)); assert.doesNotMatch(list.text, /<img[^>]*onerror/);
  const id = list.text.match(/href="\/admin\/enquiries\/(\d+)"/)[1];
  const det = await owner.get(`/admin/enquiries/${id}`); assert.equal(det.status, 200); assert.doesNotMatch(det.text, /<img src=x/); assert.match(det.text, /wa\.me\//);
  assert.equal((await owner.post(`/admin/enquiries/${id}`, { status: 'contacted', notes: 'Called customer' })).status, 302);
  assert.match((await owner.get(`/admin/enquiries/${id}`)).text, /Called customer/);
  const csv = await owner.get('/admin/enquiries.csv'); assert.match(csv.headers.get('content-type'), /text\/csv/); assert.match(csv.text, /"'=HYPERLINK/, 'formula injection neutralised'); assert.doesNotMatch(csv.text, /(^|,)"=HYPERLINK/m);
  assert.equal((await owner.post(`/admin/enquiries/${id}/delete`)).status, 302); assert.equal((await owner.get(`/admin/enquiries/${id}`)).status, 404);
});

test('media library: real images accepted, dangerous files refused, files served safely', async () => {
  const tok = await owner.csrf();
  const send = async (name, buf, type, token = tok) => { const fd = new FormData(); fd.append('files', new Blob([buf], { type }), name); return owner.req('/admin/media/upload', { method: 'POST', formData: fd, headers: token ? { 'x-csrf-token': token } : {} }); };
  const ok = await send('logo test.png', PNG, 'image/png'); assert.equal(ok.status, 200, ok.text); const f = JSON.parse(ok.text).files[0]; assert.match(f.file, /^\/uploads\/\d{6}\/[A-Za-z0-9]+\.png$/);
  const served = await anon.get(f.file); assert.equal(served.status, 200); assert.equal(served.headers.get('content-type'), 'image/png'); assert.equal(served.headers.get('x-content-type-options'), 'nosniff');
  const svg = await send('x.svg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'), 'image/svg+xml'); assert.equal(svg.status, 400);
  const html = await send('evil.png', Buffer.from('<html><script>alert(1)</script></html>'), 'image/png'); assert.equal(html.status, 400, 'extension/mime are ignored; content decides');
  const php = await send('shell.php', Buffer.from('<?php system($_GET[0]); ?>'), 'application/x-php'); assert.equal(php.status, 400);
  assert.equal((await send('x.png', PNG, 'image/png', '')).status, 403, 'no CSRF header → refused');
  assert.equal((await anon.req('/admin/media/upload', { method: 'POST' })).status, 401);
  const lib = await owner.get('/admin/media/api'); assert.equal(JSON.parse(lib.text).files.length, 1);
  const used = await owner.post('/admin/c/gallery/new', { title: 'Uploaded pic', image: f.file, active: '1' }); assert.equal(used.status, 302, used.text.slice(0, 300));
  const badImg = await owner.post('/admin/c/gallery/new', { title: 'bad', image: 'javascript:alert(1)', active: '1' }); assert.equal(badImg.status, 422);
  const del = await owner.post(`/admin/media/${f.id}/delete`); assert.equal(del.status, 302); assert.equal((await anon.get(f.file)).status, 404);
});

test('themes: 20+ built in, custom theme editor, global-event auto switching', async () => {
  const list = await owner.get('/admin/themes'); const n = (list.text.match(/class="a-theme[ "]/g) || []).length; assert.ok(n >= 20, `at least 20 themes, got ${n}`);
  assert.match(list.text, /Halloween/); assert.match(list.text, /New Year/); assert.match(list.text, /Diwali/);
  const evilCss = '</style><script>alert(1)</script>body{outline:1px solid red}@import url(//evil.example/x.css);';
  const cr = await owner.post('/admin/themes/new', { name: 'QA Theme', dark: '1', v_primary: '#ff0000', v_bg: '#101010', v_text: '#f0f0f0', 'v_font-heading': 'playfair', v_radius: '4', v_shadow: 'glow', p_preset: 'snow', p_density: '1.5', sound_pack: 'soft', pipe_1: '#ff0000', pipe_2: 'url(javascript:1)', custom_css: evilCss, visitor: '1' });
  assert.equal(cr.status, 302, cr.text.slice(0, 300)); assert.match(cr.location, /qa-theme/);
  const css = await anon.get('/theme/qa-theme.css'); assert.equal(css.status, 200); assert.match(css.headers.get('content-type'), /text\/css/);
  assert.match(css.text, /--primary:#ff0000/); assert.match(css.text, /--radius:4px/); assert.match(css.text, /Playfair/); assert.doesNotMatch(css.text, /<\/?style|<script|@import/i);
  assert.equal((await anon.get('/theme/..%2fsecret.css')).status, 404); assert.equal((await anon.get('/theme/nope.css')).status, 404);
  assert.equal((await owner.post('/admin/themes/qa-theme/activate')).status, 302);
  assert.match((await anon.get('/')).text, /\/theme\/qa-theme\.css/, 'new default theme is live');
  assert.match((await owner.get('/?preview_theme=professional')).text, /\/theme\/professional\.css/, 'admins can preview any theme');
  assert.match((await anon.get('/?preview_theme=professional')).text, /\/theme\/qa-theme\.css/, 'visitors cannot force a preview');
  const exp = await owner.get('/admin/themes/qa-theme.json'); assert.equal(JSON.parse(exp.text).name, 'QA Theme');
  const imp = await owner.post('/admin/themes/import', { json: exp.text }); assert.match(imp.location, /m=imported/);
  // festival switching: an event that covers today wins over the default theme
  const ev = await owner.post('/admin/c/events/new', { name: 'QA Festival', theme_slug: 'halloween', start_date: todayIST(), end_date: todayIST(), priority: '5', greeting: 'Happy QA Day!', active: '1' }); assert.equal(ev.status, 302, ev.text.slice(0, 300));
  const home = await anon.get('/'); assert.match(home.text, /\/theme\/halloween\.css/, 'event theme is applied automatically'); assert.match(home.text, /Happy QA Day!/);
  const evId = (await owner.get('/admin/c/events?q=QA')).text.match(/href="\/admin\/c\/events\/(\d+)"/)[1];
  assert.equal((await owner.post(`/admin/c/events/${evId}/delete`)).status, 302);
  assert.match((await anon.get('/')).text, /\/theme\/qa-theme\.css/, 'back to the default after the event');
  const badEv = await owner.post('/admin/c/events/new', { name: 'Bad', theme_slug: 'halloween', start_date: 'tomorrow', end_date: '12-31' }); assert.equal(badEv.status, 422);
  assert.equal((await owner.post('/admin/themes/qa-theme/delete')).status, 302); assert.match((await anon.get('/')).text, /\/theme\/professional\.css/, 'deleting the active theme falls back safely');
  assert.equal((await owner.post('/admin/themes/professional/delete')).status, 302); assert.equal((await anon.get('/theme/professional.css')).status, 200, 'built-in themes cannot be deleted');
  assert.equal((await owner.post('/admin/themes/professional/reset')).status, 302);
});

test('settings: saved, validated, visible on the site; lock-out protection; maintenance mode', async () => {
  const s = await owner.post('/admin/settings/contact', { phone1: '+91 90000 11111', email: 'hello@example.com' });
  assert.equal(s.status, 302); const contact = await anon.get('/contact'); assert.match(contact.text, /90000 11111/); assert.match(contact.text, /hello@example\.com/);
  const bad = await owner.post('/admin/settings/contact', { email: 'not-an-email' }); assert.equal(bad.status, 422); assert.match(bad.text, /Invalid value/);
  assert.equal((await owner.get('/admin/settings/nonsense')).status, 404);
  const xff = { 'x-forwarded-for': '203.0.113.9' }; const secPost = async (v, h) => owner.req('/admin/settings/security', { method: 'POST', form: { _csrf: await owner.csrf(), admin_ip_allow: v }, headers: h });
  const lock = await secPost('10.9.9.9', xff); assert.equal(lock.status, 422); assert.match(lock.text, /lock/i, 'cannot save an allow-list that excludes your own IP');
  assert.equal((await secPost('203.0.113.9', xff)).status, 302);
  assert.equal((await anon.req('/admin/login', { headers: { 'x-forwarded-for': '198.51.100.7' } })).status, 404, 'other IPs cannot even see the login page');
  assert.equal((await anon.req('/admin/login', { headers: xff })).status, 200, 'the allowed IP can');
  assert.equal((await secPost('', xff)).status, 302, 'cleared again');
  assert.equal((await owner.post('/admin/settings/security', { session_hours: '8' })).status, 302);
  await owner.post('/admin/settings/maintenance', { maintenance_mode: '1' });
  const m = await anon.get('/'); assert.equal(m.status, 503); assert.ok(m.headers.get('retry-after')); assert.equal((await owner.get('/')).status, 200, 'admins can still see the real site');
  assert.equal((await owner.get('/admin')).status, 200);
  await owner.post('/admin/settings/maintenance', {}); assert.equal((await anon.get('/')).status, 200);
  const sec = await owner.post('/admin/settings/forms', { smtp_pass: 'super-secret-pass' }); assert.equal(sec.status, 302);
  assert.doesNotMatch((await owner.get('/admin/settings/forms')).text, /super-secret-pass/, 'secrets are never echoed back');
  assert.doesNotMatch(await (async () => (await owner.get('/admin/backup/content.json')).text)(), /super-secret-pass/, 'secrets are not in exports');
});

test('redirect manager works and refuses protocol-relative targets', async () => {
  assert.equal((await owner.post('/admin/c/redirects/new', { from_path: '/old-qa-page', to_path: '/products', code: '301', active: '1' })).status, 302);
  const r = await anon.get('/old-qa-page'); assert.equal(r.status, 301); assert.equal(r.location, '/products');
  assert.equal((await anon.get('/ta/old-qa-page')).status, 301);
  assert.equal((await owner.post('/admin/c/redirects/new', { from_path: '/x', to_path: '//evil.example', code: '301' })).status, 422);
  assert.equal((await owner.post('/admin/c/redirects/new', { from_path: '/y', to_path: 'javascript:alert(1)', code: '301' })).status, 422);
});

test('roles: editor, viewer and admin only reach what they should', async () => {
  const editor = await makeUser('editor', 'editor@example.com'); const viewer = await makeUser('viewer', 'viewer@example.com');
  assert.equal((await editor.get('/admin/c/products')).status, 200); assert.equal((await editor.get('/admin/enquiries')).status, 200); assert.equal((await editor.get('/admin/media')).status, 200);
  for (const p of ['/admin/settings/general', '/admin/users', '/admin/themes', '/admin/c/events', '/admin/health', '/admin/backup', '/admin/audit']) assert.equal((await editor.get(p)).status, 403, `editor blocked from ${p}`);
  assert.equal((await editor.post('/admin/settings/general', { site_name: 'Hacked' })).status, 403);
  assert.equal((await editor.req('/admin/backup/import', { method: 'POST', json: { app: 'sri-suriya', content: { models: {} } }, headers: { 'x-csrf-token': await editor.csrf() } })).status, 403);
  assert.equal((await viewer.get('/admin/c/products')).status, 200);
  assert.equal((await viewer.post('/admin/c/products/1/toggle')).status, 403, 'viewer is read-only'); assert.equal((await viewer.post('/admin/c/faqs/new', { question: 'q', answer: 'a' })).status, 403);
  assert.equal((await viewer.get('/admin/enquiries')).status, 403);
  const users = await owner.get('/admin/users'); const vid = users.text.match(/\/admin\/users\/(\d+)\/toggle/g); assert.ok(vid.length >= 3);
  // the owner cannot lock themselves out
  const ownerId = users.text.match(/owner@example\.com[\s\S]*?\/admin\/users\/(\d+)\/role/)[1];
  assert.match((await owner.post(`/admin/users/${ownerId}/delete`)).location, /m=bad/); assert.match((await owner.post(`/admin/users/${ownerId}/toggle`)).location, /m=bad/);
  assert.match((await owner.post(`/admin/users/${ownerId}/role`, { role: 'editor' })).location, /m=bad/, 'last super admin cannot be demoted');
  // disabling a user ends their sessions
  const eid = users.text.match(/editor@example\.com[\s\S]*?\/admin\/users\/(\d+)\/role/)[1];
  await owner.post(`/admin/users/${eid}/toggle`); assert.equal((await editor.get('/admin/c/products')).status, 302, 'disabled user is signed out');
  const again = new Client(srv.base); assert.match((await again.login('editor@example.com', NEWPW)).text, /disabled/i);
  await owner.post(`/admin/users/${eid}/toggle`); assert.equal((await again.login('editor@example.com', NEWPW)).status, 302);
});

test('passwords: strength rules, change signs other devices out', async () => {
  const c = await makeUser('admin', 'pwtest@example.com'); const old = new Client(srv.base); old.jar = new Map(c.jar);
  const weak = await c.post('/admin/account/password', { current: NEWPW, password: 'short', password2: 'short' }); assert.equal(weak.status, 422); assert.match(weak.text, /at least 12/);
  const same = await c.post('/admin/account/password', { current: NEWPW, password: NEWPW, password2: NEWPW }); assert.equal(same.status, 422);
  const mism = await c.post('/admin/account/password', { current: NEWPW, password: 'Another-Fine-Pass-12!', password2: 'Different-Pass-12!' }); assert.equal(mism.status, 422);
  const wrongCur = await c.post('/admin/account/password', { current: 'nope-nope-nope-1', password: 'Another-Fine-Pass-12!', password2: 'Another-Fine-Pass-12!' }); assert.equal(wrongCur.status, 422);
  const email = await c.post('/admin/account/password', { current: NEWPW, password: 'pwtest-Fine-Pass-12!', password2: 'pwtest-Fine-Pass-12!' }); assert.equal(email.status, 422, 'must not contain the e-mail name');
  assert.equal((await c.post('/admin/account/password', { current: NEWPW, password: 'Another-Fine-Pass-12!', password2: 'Another-Fine-Pass-12!' })).status, 302);
  assert.equal((await c.get('/admin')).status, 200, 'current device stays signed in');
  assert.equal((await old.get('/admin')).status, 302, 'the other device was signed out');
});

test('two-factor authentication: enrol, require at sign-in, replay protection, admin reset', async () => {
  const c = await makeUser('admin', 'tfa@example.com');
  assert.equal((await c.post('/admin/account/2fa/start')).status, 302);
  const acc = await c.get('/admin/account?setup=1'); const key = acc.text.match(/Key: <code class="a-secret">([A-Z2-7]+)</)[1]; assert.match(acc.text, /data:image\/png;base64/);
  const wrong = await c.post('/admin/account/2fa/enable', { code: '000000' }); assert.equal(wrong.status, 422);
  const on = await c.post('/admin/account/2fa/enable', { code: totp(key) }); assert.match(on.location, /m=2fa_on/);
  await c.post('/admin/logout');
  const l = await c.login('tfa@example.com', NEWPW); assert.equal(l.status, 302); assert.match(l.location, /\/admin\/2fa/, 'password alone is not enough');
  assert.equal((await c.get('/admin')).status, 302, 'half-signed-in session has no access');
  const bad = await c.req('/admin/2fa', { method: 'POST', form: { code: '123456', _csrf: (await c.get('/admin/2fa')).text.match(/name="_csrf" value="([^"]+)"/)[1] } }); assert.equal(bad.status, 401);
  const csrf2 = (await c.get('/admin/2fa')).text.match(/name="_csrf" value="([^"]+)"/)[1];
  const good = await c.req('/admin/2fa', { method: 'POST', form: { code: totp(key, 1), _csrf: csrf2 } }); assert.equal(good.status, 302, good.text.slice(0, 200)); assert.equal((await c.get('/admin')).status, 200);
  // replay: the same code cannot be used again
  const d = new Client(srv.base); await d.login('tfa@example.com', NEWPW); const csrf3 = (await d.get('/admin/2fa')).text.match(/name="_csrf" value="([^"]+)"/)[1];
  assert.equal((await d.req('/admin/2fa', { method: 'POST', form: { code: totp(key, 1), _csrf: csrf3 } })).status, 401, 'used code is rejected');
  // super admin resets 2FA for a user who lost their phone
  const users = await owner.get('/admin/users'); const id = users.text.match(/tfa@example\.com[\s\S]*?\/admin\/users\/(\d+)\/role/)[1];
  assert.equal((await owner.post(`/admin/users/${id}/reset-2fa`)).status, 302); const e = new Client(srv.base); assert.match((await e.login('tfa@example.com', NEWPW)).location, /^\/admin/); assert.equal((await e.get('/admin')).status, 200);
});

test('backup & restore round-trip (and hostile backup files are sanitised)', async () => {
  const exp = await owner.get('/admin/backup/content.json'); assert.equal(exp.status, 200); const data = JSON.parse(exp.text);
  assert.equal(data.app, 'sri-suriya'); assert.ok(data.content.models.products.length >= 10); assert.ok(data.settings.site_name);
  const csrf = await owner.csrf(); const post = (j) => owner.req('/admin/backup/import', { method: 'POST', json: j, headers: { 'x-csrf-token': csrf } });
  assert.equal((await post({ nope: 1 })).status, 400);
  assert.equal((await owner.req('/admin/backup/import', { method: 'POST', json: data })).status, 403, 'CSRF header required');
  const hostile = JSON.parse(exp.text); hostile.content.models.products[0].name = 'Hostile <script>alert(1)</script>Name'; hostile.content.models.products[0].body = '<p>x</p><img src=x onerror=alert(1)>';
  const r = await post(hostile); assert.equal(r.status, 200, r.text); assert.equal(JSON.parse(r.text).ok, true);
  const prods = await anon.get('/products'); assert.doesNotMatch(prods.text, /<script>alert\(1\)/); assert.doesNotMatch(prods.text, /onerror=/);
  assert.equal((await post(data)).status, 200); assert.match((await anon.get('/products')).text, /Agricultural PVC Pipe/, 'restored');
  const dbx = await owner.post('/admin/backup/database'); assert.equal(dbx.status, 200); assert.match(dbx.headers.get('content-disposition') || '', /\.db/);
  assert.match(dbx.text.slice(0, 16), /SQLite format 3/);
});

test('dashboard, health and activity log work and record security events', async () => {
  const dash = await owner.get('/admin'); assert.match(dash.text, /Setup checklist/); assert.match(dash.text, /Traffic/); assert.match(dash.text, /<svg[^>]*class="a-chart"/);
  const h = await owner.get('/admin/health'); assert.match(h.text, /Security checklist/); assert.match(h.text, /Node\.js/);
  assert.equal((await owner.post('/admin/health/cache')).status, 302); assert.equal((await owner.post('/admin/health/optimize')).status, 302);
  for (const w of ['login_failed', 'login', 'create', 'update', 'delete', 'upload', 'settings', '2fa_enable', 'reset_2fa']) assert.match((await owner.get('/admin/audit?q=' + w)).text, new RegExp(`<code>${w}</code>`), `audit log has ${w}`);
});

test('sign-out ends the session', async () => {
  const c = new Client(srv.base); await c.login(OWNER.email, OWNER.password); assert.equal((await c.get('/admin')).status, 200);
  const stolen = new Client(srv.base); stolen.jar = new Map(c.jar);
  await c.post('/admin/logout'); assert.equal((await c.get('/admin')).status, 302); assert.equal((await stolen.get('/admin')).status, 302, 'the old cookie no longer works');
});

test('no unexpected server errors were logged', async () => {
  assert.doesNotMatch(srv.log(), /TypeError|ReferenceError|SyntaxError|unhandledRejection|uncaughtException|\[error\]/);
});
