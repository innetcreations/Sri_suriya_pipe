'use strict';
// Tests for the integrations: EmailJS mail sending (against a FAKE EmailJS server) and the upload-storage switch.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { startServer, Client, PNG, OWNER } = require('./helpers');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let mock; let calls = []; let mockStatus = 200; let srv; let owner; let anon;

before(async () => {
  mock = http.createServer((req, res) => {
    let b = ''; req.on('data', (d) => { b += d; });
    req.on('end', () => { let j = null; try { j = JSON.parse(b); } catch { /* not json */ } calls.push({ method: req.method, url: req.url, json: j }); res.statusCode = mockStatus; res.end(mockStatus === 200 ? 'OK' : 'The Public Key is invalid'); });
  });
  await new Promise((r) => mock.listen(0, '127.0.0.1', r));
  srv = await startServer({ env: { EMAILJS_API_URL: `http://127.0.0.1:${mock.address().port}/api/v1.0/email/send` } });
  anon = new Client(srv.base); owner = new Client(srv.base);
  assert.equal((await owner.login(OWNER.email, OWNER.password)).status, 302);
});
after(async () => { if (srv) await srv.stop(); await new Promise((r) => mock.close(r)); });

const submit = async (name) => {
  const T = JSON.parse((await anon.get('/api/form-token')).text).token; await sleep(2700);
  return anon.req('/api/enquiry', { method: 'POST', json: { name, phone: '9876543210', email: 'buyer@example.com', product: 'Agricultural PVC Pipe', qty: '50', location: 'Madurai', message: 'Price please <b>now</b>', _ft: T, type: 'quote' } });
};

test('EmailJS: the enquiry is sent to EmailJS from the server, keys stay private, and a failure never loses the enquiry', async () => {
  const PRIV = 'private-key-SECRET-0123456789';
  const s = await owner.post('/admin/settings/forms', { notify_email: 'owner-inbox@example.com', emailjs_service_id: 'service_abc', emailjs_template_id: 'template_xyz', emailjs_public_key: 'PUBKEY123', emailjs_private_key: PRIV });
  assert.equal(s.status, 302, s.text.slice(0, 300));
  const page = await owner.get('/admin/settings/forms'); assert.ok(!page.text.includes(PRIV), 'the private key is never printed back');
  assert.match(page.text, /Send test e-mail/);

  calls = []; mockStatus = 200;
  const ok = await submit('Mail Customer'); assert.equal(ok.status, 200, ok.text);
  for (let i = 0; i < 30 && !calls.length; i++) await sleep(150);
  assert.equal(calls.length, 1, 'exactly one request reached EmailJS');
  const c = calls[0]; assert.equal(c.method, 'POST');
  assert.equal(c.json.service_id, 'service_abc'); assert.equal(c.json.template_id, 'template_xyz'); assert.equal(c.json.user_id, 'PUBKEY123'); assert.equal(c.json.accessToken, PRIV);
  const p = c.json.template_params;
  assert.equal(p.to_email, 'owner-inbox@example.com'); assert.equal(p.name, 'Mail Customer'); assert.equal(p.reply_to, 'buyer@example.com'); assert.match(p.ref, /^SSP-/); assert.match(p.summary, /Agricultural PVC Pipe/);
  // the keys never appear in any public page
  const home = await anon.get('/'); assert.ok(!home.text.includes(PRIV) && !home.text.includes('PUBKEY123') && !home.text.includes('service_abc'), 'no EmailJS value is exposed to visitors');

  // test button: success
  calls = []; const t1 = await owner.post('/admin/settings/forms/test-mail'); assert.equal(t1.status, 302); assert.match(t1.location, /m=mailok/); assert.equal(calls.length, 1); assert.equal(calls[0].json.template_params.ref, 'TEST-0000');

  // EmailJS answers with an error: the enquiry is still saved and the visitor still gets a normal answer
  mockStatus = 422; calls = [];
  const bad = await submit('Mail Fails Customer'); assert.equal(bad.status, 200, 'visitor is not shown a mail error');
  const list = await owner.get('/admin/enquiries'); assert.match(list.text, /Mail Fails Customer/, 'enquiry saved even though e-mail failed');
  const t2 = await owner.post('/admin/settings/forms/test-mail'); assert.equal(t2.status, 502); assert.match(t2.text, /EmailJS answered 422/); assert.ok(!t2.text.includes(PRIV));
  mockStatus = 200;
});

test('upload storage: with no choice made it follows Settings → Media; Drive that is not connected falls back to the website files', async () => {
  const send = async (target) => {
    const fd = new FormData(); fd.append('files', new Blob([PNG], { type: 'image/png' }), 'pic.png'); if (target) fd.append('target', target);
    const tok = await owner.csrf(); return owner.req('/admin/media/upload', { method: 'POST', formData: fd, headers: { 'x-csrf-token': tok } });
  };
  for (const mode of ['auto', 'drive', 'local']) {
    assert.equal((await owner.post('/admin/settings/media', { upload_target: mode })).status, 302, mode);
    const r = await send(''); assert.equal(r.status, 200, `${mode}: ${r.text}`); const f = JSON.parse(r.text).files[0];
    assert.equal(f.source, 'local', `${mode}: Drive is not connected in this test, so the file is stored on the website`);
  }
  const bad = await owner.post('/admin/settings/media', { upload_target: 'moon' }); assert.ok([302, 422].includes(bad.status));
  assert.notEqual(JSON.parse((await owner.get('/admin/media/api')).text).caps.def, 'moon');
});
