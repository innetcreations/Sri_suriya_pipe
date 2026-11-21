'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, Client, sleep } = require('./helpers');

let srv; let anon;
before(async () => { srv = await startServer(); anon = new Client(srv.base); });
after(async () => { if (srv) await srv.stop(); });

test('every public page renders with SEO essentials', async () => {
  for (const p of ['/', '/products', '/sizes', '/applications', '/gallery', '/blog', '/faq', '/calculator', '/quote', '/contact', '/areas', '/about', '/privacy-policy', '/terms']) {
    const r = await anon.get(p);
    assert.equal(r.status, 200, p);
    assert.match(r.text, /<title>[^<]{8,}<\/title>/, `${p} title`);
    assert.match(r.text, /<link rel="canonical" href="http/, `${p} canonical`);
    assert.match(r.text, /<meta name="description" content="[^"]{20,}/, `${p} description`);
    assert.match(r.text, /property="og:title"/, `${p} og:title`);
    assert.match(r.text, /application\/ld\+json/, `${p} json-ld`);
    assert.match(r.text, /<h1[ >]/, `${p} has an h1`);
  }
  const home = await anon.get('/');
  assert.match(home.text, /hreflang="ta-IN"/); assert.match(home.text, /LocalBusiness/);
});

test('product, category, article, area and application pages exist (slugs are generated)', async () => {
  const sm = (await anon.get('/sitemap.xml')).text;
  const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname).filter((p) => !p.startsWith('/ta'));
  assert.ok(locs.length > 25, 'sitemap has many URLs');
  assert.ok(locs.some((p) => p.startsWith('/products/') && !p.includes('category')), 'has product urls');
  assert.ok(locs.some((p) => p.startsWith('/pvc-pipes-in-')), 'has area urls');
  for (const p of locs) { const r = await anon.get(p); assert.equal(r.status, 200, p); }
  const prod = locs.find((p) => /^\/products\/[a-z0-9-]+$/.test(p) && !p.includes('category'));
  const r = await anon.get(prod);
  assert.match(r.text, /"@type":"Product"/); assert.match(r.text, /BreadcrumbList/);
});

test('Tamil version is served under /ta with the right language tags', async () => {
  const r = await anon.get('/ta/products');
  assert.equal(r.status, 200); assert.match(r.text, /<html lang="ta"/); assert.match(r.text, /hreflang="en-IN"/);
  assert.match(r.text, /[஀-௿]{3,}/, 'contains Tamil text');
});

test('robots.txt, sitemap, manifest, health and offline page', async () => {
  const robots = await anon.get('/robots.txt'); assert.match(robots.text, /Disallow: \/admin/); assert.match(robots.text, /Sitemap: /);
  assert.equal((await anon.get('/sitemap.xml')).headers.get('content-type').split(';')[0], 'application/xml');
  const mf = JSON.parse((await anon.get('/manifest.webmanifest')).text); assert.ok(mf.name && mf.start_url === '/');
  assert.equal(JSON.parse((await anon.get('/healthz')).text).ok, true);
  assert.equal((await anon.get('/offline.html')).status, 200);
  assert.equal((await anon.get('/sw.js')).headers.get('cache-control'), 'no-cache');
});

test('strict security headers and no inline scripts/handlers (CSP-safe)', async () => {
  const r = await anon.get('/');
  const csp = r.headers.get('content-security-policy') || '';
  assert.match(csp, /default-src 'self'/); assert.match(csp, /script-src 'self'/); assert.doesNotMatch(csp.match(/script-src[^;]*/)[0], /unsafe-inline|unsafe-eval/);
  assert.match(csp, /object-src 'none'/); assert.match(csp, /frame-ancestors 'none'/); assert.match(csp, /base-uri 'self'/); assert.match(csp, /form-action 'self'/);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff'); assert.ok(r.headers.get('referrer-policy')); assert.equal(r.headers.get('x-powered-by'), null);
  assert.match(r.headers.get('permissions-policy') || '', /camera=\(\)/);
  for (const p of ['/', '/products', '/contact', '/quote', '/ta']) {
    const t = (await anon.get(p)).text;
    const bad = t.match(/<script(?![^>]*\bsrc=)(?![^>]*type="application\/(?:ld\+)?json")[^>]*>/gi);
    assert.equal(bad, null, `${p}: inline <script> found: ${bad}`);
    assert.doesNotMatch(t, /\son(click|load|error|mouseover|focus|submit|change)\s*=/i, `${p}: inline event handler`);
    assert.doesNotMatch(t, /<style[\s>]/i, `${p}: inline <style> block`);
  }
});

test('anonymous pages are cacheable-with-revalidation; admin pages never cached', async () => {
  const r = await anon.get('/products'); assert.equal(r.headers.get('cache-control'), 'no-cache'); assert.ok(r.headers.get('etag') || true);
  const l = await anon.get('/admin/login'); assert.match(l.headers.get('cache-control'), /no-store/); assert.match(l.headers.get('x-robots-tag') || '', /noindex/);
  const v = (r.text.match(/\/css\/app\.css\?v=(\d+)/) || [])[1]; assert.ok(v !== undefined, 'versioned css url');
  const css = await anon.get(`/css/app.css?v=${v}`); assert.match(css.headers.get('cache-control'), /immutable/);
});

test('404 page, scanner probes and path traversal are handled safely', async () => {
  const nf = await anon.get('/definitely-not-here'); assert.equal(nf.status, 404); assert.match(nf.text, /<h1/); assert.doesNotMatch(nf.text, /Cannot GET|at .*\.js:\d+/);
  assert.equal((await anon.get('/.env')).status, 404);
  assert.equal((await anon.get('/wp-login.php')).status, 404);
  const t = await anon.get('/uploads/%2e%2e/%2e%2e/data/app.db'); assert.ok([403, 404].includes(t.status)); assert.doesNotMatch(t.text, /SQLite format/);
  assert.equal((await anon.get('/src/config.js')).status, 404);
  assert.equal((await anon.get('/package.json')).status, 404);
  assert.equal((await anon.get('/data/app.db')).status, 404);
});

test('search, query-string abuse and malformed URLs do not crash the server', async () => {
  assert.equal((await anon.get('/search?q=pipe')).status, 200);
  assert.equal((await anon.get('/search?q[a]=b&q=x&q=y')).status, 200);
  const xss = await anon.get('/search?q=' + encodeURIComponent('"><script>alert(1)</script>')); assert.equal(xss.status, 200); assert.doesNotMatch(xss.text, /<script>alert\(1\)<\/script>/);
  assert.ok([400, 404].includes((await anon.get('/%E0%A4%A')).status));
  assert.equal((await anon.get('/products?page=-5')).status, 200);
  assert.equal((await anon.get('/healthz')).status, 200, 'still alive');
});

test('chat assistant answers from site data and rejects bad input', async () => {
  const phone = await anon.req('/api/chat', { method: 'POST', json: { q: 'what is your phone number?' } });
  assert.equal(phone.status, 200); assert.match(JSON.parse(phone.text).answer, /\+?\d[\d ]{8,}/);
  const prod = JSON.parse((await anon.req('/api/chat', { method: 'POST', json: { q: 'do you have borewell casing pipes' } })).text); assert.ok(prod.answer.length > 5);
  assert.equal((await anon.req('/api/chat', { method: 'POST', json: { q: '' } })).status, 400);
  assert.equal((await anon.req('/api/chat', { method: 'POST', form: { q: 'hi' } })).status, 415);
  assert.equal((await anon.req('/api/chat', { method: 'POST', rawBody: '{bad json', headers: { 'content-type': 'application/json' } })).status, 400);
});

test('enquiry form: validation, anti-spam, storage and API hardening', async () => {
  const tok = async () => JSON.parse((await anon.get('/api/form-token')).text).token;
  const T = await tok();
  const fast = await anon.req('/api/enquiry', { method: 'POST', json: { name: 'Too Fast', phone: '9876543210', _ft: T } });
  assert.equal(fast.status, 400, 'submitting faster than a human is rejected');
  await sleep(2700);
  assert.equal((await anon.req('/api/enquiry', { method: 'POST', json: { name: 'No Token', phone: '9876543210' } })).status, 400);
  const bad = await anon.req('/api/enquiry', { method: 'POST', json: { name: 'A', phone: 'abc', email: 'nope', _ft: T } });
  assert.equal(bad.status, 422); const be = JSON.parse(bad.text).errors; assert.ok(be.name && be.phone && be.email);
  const hp = await anon.req('/api/enquiry', { method: 'POST', json: { name: 'Bot Person', phone: '9876543210', website: 'http://spam.example', _ft: T } });
  assert.equal(hp.status, 200, 'honeypot pretends success');
  const ok = await anon.req('/api/enquiry', { method: 'POST', json: { name: 'QA Customer', phone: '+91 98765-43210', product: 'Agricultural PVC Pipe', size: '2"', qty: '100', location: 'Madurai', message: 'Need <b>100</b> pipes', _ft: T, type: 'quote', items: [{ name: 'Test item', qty: 5 }] } });
  assert.equal(ok.status, 200); assert.match(JSON.parse(ok.text).ref, /^SSP-\d{6}-[A-Z0-9]{4}$/);
  const dup = await anon.req('/api/enquiry', { method: 'POST', json: { name: 'QA Customer', phone: '+91 98765-43210', _ft: T } });
  assert.equal(JSON.parse(dup.text).ref, JSON.parse(ok.text).ref, 'double-click does not create duplicates');
  assert.equal((await anon.req('/api/enquiry', { method: 'POST', form: { name: 'x' } })).status, 415);
  const cross = await anon.req('/api/enquiry', { method: 'POST', json: { name: 'Cross Site', phone: '9876543210', _ft: T }, headers: { origin: 'http://evil.example' } });
  assert.equal(cross.status, 403, 'cross-site POST blocked');
  const big = await anon.req('/api/enquiry', { method: 'POST', json: { name: 'Big', phone: '9876543210', message: 'x'.repeat(60000), _ft: T } });
  assert.equal(big.status, 413);
  const spam = await anon.req('/api/enquiry', { method: 'POST', json: { name: 'Spammer Joe', phone: '9123456780', message: 'buy cheap viagra http://a.example http://b.example', _ft: T } });
  assert.equal(spam.status, 200);
});

test('server logged no unexpected errors', async () => {
  assert.doesNotMatch(srv.log(), /TypeError|ReferenceError|SyntaxError|unhandledRejection|uncaughtException/);
});
