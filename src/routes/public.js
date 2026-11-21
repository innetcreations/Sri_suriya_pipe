'use strict';
const express = require('express');
const C = require('../ctx');
const cfg = require('../config');
const cache = require('../cache');
const crud = require('../crud');
const themes = require('../themes');
const settings = require('../settings');
const layout = require('../views/layout');
const pages = require('../views/pages');
const { placeholderSvg, esc } = require('../render');

const router = express.Router();
const wrap = (fn) => (req, res, next) => { try { fn(req, res, next); } catch (e) { next(e); } };

// ───────────────────────── page rendering (+ 60s full-page cache for anonymous visitors)
function serve(pageName, { status = 200 } = {}) {
  return wrap((req, res, next) => {
    const ctx = C.build(req, res);
    const S = ctx.S;
    let name = pageName; // local copy: never overwrite the route's own page name (a shared variable would "stick" in maintenance mode)
    if (S.maintenance_mode === '1' && !req.user && name !== 'maintenance') name = 'maintenance';
    const cacheable = !req.user && !ctx.preview && !('q' in req.query) && req.method === 'GET' && name !== 'maintenance';
    const key = cacheable ? `pg|${ctx.lang}|${ctx.theme.slug}|${ctx.event ? ctx.event.id : 0}|${name}|${req.path}|${parseInt(req.query.page, 10) || 1}` : null;
    let out = key ? cache.get(key) : null;
    if (!out) {
      const spec = pages[name](ctx, req);
      if (!spec) return next();
      out = { html: layout.render(ctx, spec), status: name === 'maintenance' ? 503 : status };
      if (key && out.status === 200) cache.put(key, out, 60000);
    }
    res.status(out.status).set({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': req.user ? 'no-store' : 'no-cache', Vary: 'Cookie, Accept-Encoding' });
    if (out.status === 503) res.set('Retry-After', '3600');
    res.send(out.html);
  });
}

// ───────────────────────── pages
router.get('/', serve('home'));
router.get('/home', serve('home'));
router.get('/products', serve('products'));
router.get('/products/category/:slug', serve('category'));
router.get('/products/:slug', serve('product'));
for (const n of ['sizes', 'applications', 'gallery', 'blog', 'faq', 'calculator', 'quote', 'contact', 'areas', 'search']) router.get('/' + n, serve(n));
router.get('/blog/:slug', serve('post'));
router.get('/pvc-pipes-in-:slug', serve('area'));

// ───────────────────────── generated assets
router.get('/theme/:file', wrap((req, res, next) => {
  const m = req.params.file.match(/^([a-z0-9-]{1,60})\.css$/); const t = m && themes.bySlug(m[1]);
  if (!t) return res.status(404).type('text').send('/* not found */');
  const extra = String(settings.get('custom_css') || '');
  const body = cache.memo(`themecss:${t.slug}`, 600000, () => themes.cssFor(t) + (extra ? `/* site custom css */\n${extra}\n` : ''));
  res.set({ 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': req.query.v ? 'public, max-age=31536000, immutable' : 'public, max-age=300' }).send(body);
}));

router.get('/placeholder/:spec', wrap((req, res) => {
  const m = req.params.spec.match(/^(\d{2,4})x(\d{2,4})\.svg$/); if (!m) return res.status(404).end();
  const w = Math.min(2000, Math.max(16, +m[1])); const h = Math.min(2000, Math.max(16, +m[2]));
  res.set({ 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'", 'X-Content-Type-Options': 'nosniff' }).send(placeholderSvg(w, h, String(req.query.label || '').slice(0, 40)));
}));

router.get('/robots.txt', wrap((req, res) => {
  const S = settings.all(); const lines = ['User-agent: *'];
  if (S.noindex_site === '1') lines.push('Disallow: /');
  else lines.push(`Disallow: ${cfg.ADMIN_PATH}/`, 'Disallow: /api/', 'Disallow: /search', 'Allow: /', ...String(S.robots_extra || '').split(/\r?\n/).map((l) => l.trim()).filter((l) => /^(Disallow|Allow|Crawl-delay):/i.test(l)));
  lines.push('', `Sitemap: ${cfg.SITE_URL}/sitemap.xml`);
  res.type('text/plain').set('Cache-Control', 'public, max-age=3600').send(lines.join('\n') + '\n');
}));

router.get('/sitemap.xml', wrap((req, res) => {
  const xml = cache.memo('sitemap', 600000, () => {
    const S = settings.all(); const ta = S.enable_ta === '1'; const urls = [];
    const add = (p, lastmod, pri = 0.6, freq = 'monthly') => urls.push({ p, lastmod: lastmod ? String(lastmod).slice(0, 10) : undefined, pri, freq });
    add('/', null, 1, 'weekly'); add('/products', null, 0.9, 'weekly');
    for (const c of crud.active('categories')) add(`/products/category/${c.slug}`, c.updated_at, 0.8);
    for (const p of crud.active('products')) add(`/products/${p.slug}`, p.updated_at, 0.8);
    for (const p of ['sizes', 'applications', 'gallery', 'faq', 'calculator', 'quote', 'contact', 'areas']) add('/' + p, null, 0.6);
    add('/blog', null, 0.6, 'weekly');
    for (const p of crud.active('posts', { where: "status='published'" })) add(`/blog/${p.slug}`, p.updated_at, 0.6);
    for (const a of crud.active('areas')) add(`/pvc-pipes-in-${a.slug}`, a.updated_at, 0.5);
    for (const p of crud.active('seo_pages', { where: 'noindex=0' })) add(`/${p.slug}`, p.updated_at, 0.9, 'monthly');
    for (const p of crud.active('pages', { where: 'noindex=0' })) add(`/${p.slug}`, p.updated_at, 0.4, 'yearly');
    const loc = (p, l) => cfg.SITE_URL + (l === 'ta' ? '/ta' + (p === '/' ? '' : p) : p);
    const body = urls.map((u) => `<url><loc>${esc(loc(u.p, 'en'))}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}<changefreq>${u.freq}</changefreq><priority>${u.pri}</priority>${ta ? `<xhtml:link rel="alternate" hreflang="en-IN" href="${esc(loc(u.p, 'en'))}"/><xhtml:link rel="alternate" hreflang="ta-IN" href="${esc(loc(u.p, 'ta'))}"/>` : ''}</url>${ta ? `<url><loc>${esc(loc(u.p, 'ta'))}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}<xhtml:link rel="alternate" hreflang="en-IN" href="${esc(loc(u.p, 'en'))}"/><xhtml:link rel="alternate" hreflang="ta-IN" href="${esc(loc(u.p, 'ta'))}"/></url>` : ''}`).join('');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${body}</urlset>`;
  });
  res.type('application/xml').set('Cache-Control', 'public, max-age=3600').send(xml);
}));

router.get('/manifest.webmanifest', wrap((req, res) => {
  const S = settings.all(); const t = themes.resolve(req).theme; const v = themes.complete(t);
  const mime = (u) => (/\.svg(\?|$)/i.test(u) ? 'image/svg+xml' : /\.png(\?|$)/i.test(u) ? 'image/png' : /\.webp(\?|$)/i.test(u) ? 'image/webp' : /\.jpe?g(\?|$)/i.test(u) ? 'image/jpeg' : undefined);
  const fav = S.favicon || '/images/favicon.svg'; const big = S.pwa_icon || '';
  const icons = big ? [{ src: big, sizes: '512x512', type: mime(big), purpose: 'any' }, { src: big, sizes: '192x192', type: mime(big), purpose: 'any' }] : [{ src: fav, sizes: 'any', type: mime(fav), purpose: 'any' }];
  res.type('application/manifest+json').set('Cache-Control', 'public, max-age=3600').send(JSON.stringify({
    name: S.site_name, short_name: S.brand_short.slice(0, 12), description: S.seo_description, start_url: '/', scope: '/', display: 'standalone', background_color: v.bg, theme_color: v.primary, lang: 'en-IN',
    icons,
  }));
}));
router.get('/favicon.ico', (req, res) => res.redirect(301, settings.get('favicon') || '/images/favicon.svg'));
router.get('/healthz', (req, res) => { try { require('../db').prepare('SELECT 1').get(); res.json({ ok: true, uptime: Math.round(process.uptime()) }); } catch { res.status(503).json({ ok: false }); } });

// Redirect manager (Admin → Redirects) then pretty 404
router.use(wrap((req, res, next) => {
  const p = req.path.replace(/\/+$/, '') || '/';
  const r = crud.active('redirects').find((x) => x.from_path.replace(/\/+$/, '') === p);
  if (r) { try { require('../db').prepare('UPDATE redirects SET hits=COALESCE(hits,0)+1 WHERE id=?').run(r.id); } catch { /* ignore */ } return res.redirect(parseInt(r.code, 10) === 302 ? 302 : 301, C.build(req, res).u(r.to_path)); }
  next();
}));
// Custom pages by slug (About, Privacy, …) – registered last so real routes win
router.get('/:slug', (req, res, next) => (/^[a-z0-9-]{1,80}$/.test(req.params.slug) ? serve('page')(req, res, next) : next()));
router.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  const ctx = C.build(req, res);
  res.status(404).set({ 'Cache-Control': 'no-store', 'Content-Type': 'text/html; charset=utf-8' }).send(layout.render(ctx, pages.notFound(ctx)));
});
module.exports = router;
