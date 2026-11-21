'use strict';
const express = require('express');
const cfg = require('../config');
const db = require('../db');
const auth = require('../auth');
const sec = require('../security');
const crud = require('../crud');
const media = require('../media');
const settings = require('../settings');
const analytics = require('../analytics');
const audit = require('../audit');
const themes = require('../themes');
const V = require('../views/admin');
const { MODELS } = require('../schema');
const { SETTINGS, GROUPS } = require('../settings_schema');
const { html, raw, esc, icon } = require('../render');
const { clean, decrypt: decryptSafe, nowISO, fmtDate } = require('../util');

const A = cfg.ADMIN_PATH;
const router = express.Router();
const FLASH = {
  saved: ['ok', 'Saved.'], created: ['ok', 'Created.'], deleted: ['ok', 'Deleted.'], duplicated: ['ok', 'Duplicated (hidden until you switch it on).'], moved: ['ok', 'Order updated.'], imported: ['ok', 'Imported.'],
  pw: ['ok', 'Password changed.'], '2fa_on': ['ok', 'Two-factor authentication is now ON.'], '2fa_off': ['ok', 'Two-factor authentication is OFF.'], cache: ['ok', 'Cache cleared.'], updated: ['ok', 'Updated.'],
  mailok: ['ok', 'Test e-mail sent. Check your inbox (and Spam).'],
  linked: ['ok', 'Link added to the media library.'], linkbad: ['err', 'That link could not be added. Paste a full https:// link (for Google Drive: Share → Anyone with the link → Copy link).'],
  forbidden: ['err', 'You do not have permission for that.'], bad: ['err', 'That did not work. Please check the details.'],
};
const ROLE_RANK = auth.ROLES;
const needs = (role) => (req, res, next) => (auth.can(req.user, role) ? next() : res.status(403).type('html').send(`<!doctype html><meta charset=utf-8><title>Forbidden</title><body style="font-family:system-ui;padding:3rem"><h1>403 – Not allowed</h1><p>This section needs the <b>${role}</b> role. Your role: ${req.user.role}.</p><p><a href="${A}">Back to dashboard</a></p>`));
const page = (req, res, opts) => { res.set('Cache-Control', 'no-store').type('html').send(V.layout(req, opts)); };
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const intId = (v) => { const n = parseInt(v, 10); return Number.isInteger(n) && n > 0 ? n : null; };

// ───────────────────────── baseline protections for everything under the admin path
router.use((req, res, next) => {
  res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow, noarchive', 'Referrer-Policy': 'same-origin' });
  if (!auth.ipAllowed(req)) return res.status(404).type('text').send('Not found');
  next();
});
router.use(auth.loadSession);
router.use(express.urlencoded({ extended: false, limit: '400kb', parameterLimit: 1500 }));
router.use(express.json({ limit: '2mb' }));
router.use((req, res, next) => { // duplicate form keys (e.g. repeated checkboxes) -> last value
  if (req.body && typeof req.body === 'object') for (const k of Object.keys(req.body)) if (Array.isArray(req.body[k])) req.body[k] = req.body[k][req.body[k].length - 1];
  next();
});

// ───────────────────────── login / 2FA (no session yet)
const shell = (title, inner) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${title}</title><link rel="icon" href="${esc(settings.get('favicon') || '/images/favicon.svg')}"><link rel="stylesheet" href="/css/fonts.css"><link rel="stylesheet" href="/css/admin.css"></head><body class="a-login"><main class="a-login__box"><div class="a-login__logo">${settings.get('admin_logo') ? `<img class="a-login__img" src="${esc(settings.get('admin_logo'))}" alt="Sri Suriya Admin">` : 'Sri Suriya <small>Admin</small>'}</div>${inner}</main></body></html>`;
const safeNext = (n) => (typeof n === 'string' && n.startsWith(A + '/') && !n.startsWith('//') && n.length < 300 ? n : A);

router.get('/login', (req, res) => {
  if (req.user) return res.redirect(A);
  const lt = auth.issueLoginToken(res);
  res.type('html').send(shell('Sign in', html`<h1>Sign in</h1>${req.query.m === 'out' ? html`<p class="a-alert ok">You have been signed out.</p>` : ''}${req.query.m === 'exp' ? html`<p class="a-alert err">Your session expired. Please sign in again.</p>` : ''}
    <form method="post" action="${A}/login" autocomplete="on"><input type="hidden" name="_lt" value="${lt}"><input type="hidden" name="next" value="${safeNext(req.query.next)}">
    <label>Email<input type="email" name="email" required autocomplete="username" autofocus maxlength="200"></label><label>Password<input type="password" name="password" required autocomplete="current-password" maxlength="200"></label>
    <button class="a-btn a-btn--primary a-btn--block" type="submit">Sign in</button></form><p class="a-login__note">Authorised staff only. Activity is logged.</p>`).toString());
});
router.post('/login', sec.limiters.login, wrap(async (req, res) => {
  if (!auth.verifyLoginToken(req)) return res.redirect(A + '/login?m=exp');
  const r = await auth.attemptLogin(req.body.email, req.body.password, req);
  const lt = auth.issueLoginToken(res);
  const fail = (m) => res.status(401).type('html').send(shell('Sign in', html`<h1>Sign in</h1><p class="a-alert err" role="alert">${m}</p><form method="post" action="${A}/login"><input type="hidden" name="_lt" value="${lt}"><input type="hidden" name="next" value="${safeNext(req.body.next)}"><label>Email<input type="email" name="email" required autocomplete="username" value="${clean(req.body.email, 200)}" maxlength="200"></label><label>Password<input type="password" name="password" required autocomplete="current-password" autofocus maxlength="200"></label><button class="a-btn a-btn--primary a-btn--block" type="submit">Sign in</button></form>`).toString());
  if (r.error) return fail(r.error);
  const next = safeNext(req.body.next);
  if (r.user.totp_enabled) { auth.startSession(res, r.user, req, '2fa'); return res.redirect(A + '/2fa?next=' + encodeURIComponent(next)); }
  auth.completeLogin(r.user, req, res); res.redirect(next);
}));

const twoFaTries = new Map();
router.get('/2fa', (req, res) => {
  if (!req.pending) return res.redirect(A + '/login');
  res.type('html').send(shell('Verification', html`<h1>Two-step verification</h1><p>Enter the 6-digit code from your authenticator app.</p><form method="post" action="${A}/2fa"><input type="hidden" name="_csrf" value="${req.pending.csrf}"><input type="hidden" name="next" value="${safeNext(req.query.next)}"><label>Code<input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9 ]{6,7}" maxlength="7" required autofocus></label><button class="a-btn a-btn--primary a-btn--block" type="submit">Verify</button></form><p class="a-login__note"><a href="${A}/login">Cancel</a></p>`).toString());
});
router.post('/2fa', sec.limiters.login, wrap(async (req, res) => {
  if (!req.pending || !auth.verifyCsrf(req)) return res.redirect(A + '/login');
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.pending.id);
  const key = req.pending.sessId; const tries = (twoFaTries.get(key) || 0) + 1; twoFaTries.set(key, tries);
  if (tries > 5) { db.prepare('DELETE FROM sessions WHERE id=?').run(key); twoFaTries.delete(key); audit.log({ ip: req.ip, user: u }, '2fa_lockout', 'user', u.id); return res.redirect(A + '/login?m=exp'); }
  if (!u || !auth.verifyTotp(u.id, decryptSafe(u.totp_secret), req.body.code)) {
    audit.log({ ip: req.ip, user: u }, '2fa_failed', 'user', u && u.id); auth.recordLogin(req, { user: u, note: 'wrong 2-step code' });
    return res.status(401).type('html').send(shell('Verification', html`<h1>Two-step verification</h1><p class="a-alert err" role="alert">That code is not valid. Try the next code.</p><form method="post" action="${A}/2fa"><input type="hidden" name="_csrf" value="${req.pending.csrf}"><input type="hidden" name="next" value="${safeNext(req.body.next)}"><label>Code<input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="7" required autofocus></label><button class="a-btn a-btn--primary a-btn--block" type="submit">Verify</button></form>`).toString());
  }
  twoFaTries.delete(key); db.prepare('DELETE FROM sessions WHERE id=?').run(key);
  auth.completeLogin(u, req, res); res.redirect(safeNext(req.body.next));
}));

// ───────────────────────── everything below needs a full session
router.use(auth.requireAuth(A + '/login'));
router.use(sec.limiters.admin);
router.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD' && !/\/media\/upload$/.test(req.path) && !auth.verifyCsrf(req)) return res.status(403).type('text').send('Security check failed (CSRF). Reload the page and try again.');
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.user.role === 'viewer' && !/^\/(logout|account)/.test(req.path)) return res.status(403).type('text').send('Your account is read-only.');
  const m = FLASH[req.query.m]; if (m) req.flash = { t: m[0], m: m[1] };
  // forced password change / mandatory 2FA
  const free = /^\/(logout|account)/.test(req.path);
  if (!free && (req.user.mustChange || (settings.bool('require_2fa') && !req.user.totp))) return res.redirect(A + '/account?force=1');
  next();
});
router.post('/logout', (req, res) => { audit.log(req, 'logout', 'user', req.user.id); auth.endSession(req, res); res.redirect(A + '/login?m=out'); });

// ───────────────────────── dashboard
const svgChart = (series) => {
  const w = 720; const h = 190; const pad = 28; const max = Math.max(5, ...series.map((s) => s.views)); const step = (w - pad * 2) / Math.max(1, series.length - 1);
  const pt = (i, v) => `${(pad + i * step).toFixed(1)},${(h - pad - (v / max) * (h - pad * 2)).toFixed(1)}`;
  const views = series.map((s, i) => pt(i, s.views)).join(' '); const vis = series.map((s, i) => pt(i, s.visitors)).join(' ');
  return raw(`<svg viewBox="0 0 ${w} ${h}" class="a-chart" role="img" aria-label="Page views and visitors, last 30 days"><g stroke="currentColor" opacity=".12">${[0, 1, 2, 3].map((i) => `<line x1="${pad}" x2="${w - pad}" y1="${pad + i * (h - pad * 2) / 3}" y2="${pad + i * (h - pad * 2) / 3}"/>`).join('')}</g>
  <polyline fill="none" stroke="var(--a-primary)" stroke-width="2.5" stroke-linejoin="round" points="${views}"/><polyline fill="none" stroke="var(--a-accent)" stroke-width="2" stroke-dasharray="5 4" points="${vis}"/>
  <text x="${pad}" y="14" font-size="11" fill="currentColor" opacity=".6">max ${max}</text><text x="${pad}" y="${h - 6}" font-size="11" fill="currentColor" opacity=".6">${series[0].day.slice(5)}</text><text x="${w - pad}" y="${h - 6}" font-size="11" text-anchor="end" fill="currentColor" opacity=".6">${series[series.length - 1].day.slice(5)}</text></svg>`);
};
function checklist() {
  const S = settings.all(); const out = [];
  for (const d of SETTINGS) if (d.ph && (!S[d.key] || (d.def && S[d.key] === d.def))) out.push({ label: d.label, group: d.group });
  if (db.prepare("SELECT 1 FROM users WHERE email='admin@localhost.local'").get()) out.push({ label: 'Change the default admin e-mail (Users & roles)', group: null, href: '/users' });
  const noImg = db.prepare("SELECT COUNT(*) n FROM products WHERE active=1 AND (image IS NULL OR image='')").get().n; if (noImg) out.push({ label: `Add photos to ${noImg} product(s) – placeholders are showing`, href: '/c/products' });
  if (!db.prepare('SELECT 1 FROM testimonials WHERE active=1').get()) out.push({ label: 'Add real customer testimonials, then switch them on', href: '/c/testimonials' });
  const ph = db.prepare("SELECT COUNT(*) n FROM gallery WHERE image LIKE '/placeholder/%'").get().n; if (ph) out.push({ label: `Replace ${ph} placeholder gallery photo(s)`, href: '/c/gallery' });
  if (cfg.IS_VERCEL && !db.isReplica && !require('../supabase').enabled) out.push({ label: 'Vercel needs a cloud database (Supabase or Turso) - without it every change is lost when the server restarts. See docs/INTEGRATIONS.md.', href: '/integrations' });
  if (cfg.isProd && !cfg.HTTPS) out.push({ label: 'SITE_URL is not https:// – enable HTTPS and set SITE_URL in .env', href: null });
  return out;
}
router.get('/', wrap(async (req, res) => {
  const an = analytics.summary(30); const S = settings.all();
  const enq = db.prepare("SELECT COUNT(*) total, SUM(status='new') nw, SUM(created_at>=?) today FROM enquiries WHERE spam=0").get(new Date(Date.now() - 864e5).toISOString());
  const latest = db.prepare('SELECT * FROM enquiries WHERE spam=0 ORDER BY id DESC LIMIT 6').all();
  const open = db.prepare("SELECT q, COUNT(*) n FROM chat_log WHERE matched=0 GROUP BY lower(q) ORDER BY n DESC, id DESC LIMIT 6").all();
  const th = themes.resolve({ cookies: {} }); const todo = checklist(); const cnt = (t) => db.prepare(`SELECT COUNT(*) n FROM ${t} WHERE active=1`).get().n;
  const card = (label, val, sub, ic) => html`<div class="a-kpi"><span class="a-kpi__i">${icon(ic, 22)}</span><div><b>${val}</b><span>${label}</span>${sub ? html`<small>${sub}</small>` : ''}</div></div>`;
  page(req, res, { title: 'Dashboard', wide: true, body: html`
    <div class="a-kpis">${card('New enquiries', enq.nw || 0, `${enq.total || 0} total · ${enq.today || 0} in last 24h`, 'mail')}${card('Page views (30 d)', an.totalViews.toLocaleString('en-IN'), 'Cookie-free, privacy-friendly', 'eye')}${card('Visitors (30 d)', an.totalVisitors.toLocaleString('en-IN'), `${analytics.live(5)} online now`, 'users')}${card('Live products', cnt('products'), `${cnt('categories')} categories · ${cnt('posts')} articles`, 'box')}</div>
    <div class="a-cols"><section class="a-card"><h2>Traffic – last 30 days</h2>${svgChart(an.series)}<p class="a-legend"><i style="background:var(--a-primary)"></i> Page views <i style="background:var(--a-accent)"></i> Visitors</p></section>
    <section class="a-card"><h2>Now showing</h2><p>Theme: <b>${th.theme.name}</b> <span class="a-badge">${th.source}</span></p>${th.event ? html`<p>Festival: <b>${th.event.name}</b></p>` : html`<p class="a-muted">No festival theme is active today.</p>`}<p><a class="a-btn" href="${A}/themes">Manage themes</a> <a class="a-btn a-btn--ghost" href="${A}/c/events">Festival calendar</a></p><hr><p class="a-muted">Maintenance mode: <b>${S.maintenance_mode === '1' ? 'ON' : 'off'}</b> · Languages: English${S.enable_ta === '1' ? ' + Tamil' : ''}</p></section></div>
    <div class="a-cols">${todo.length ? html`<section class="a-card a-todo"><h2>Setup checklist <span class="a-badge warn">${todo.length}</span></h2><ul>${todo.map((t) => html`<li>${icon('alert', 16)} ${t.href !== undefined && t.href !== null ? html`<a href="${A}${t.href}">${t.label}</a>` : t.group ? html`<a href="${A}/settings/${t.group}">${t.label}</a>` : t.label}</li>`)}</ul></section>` : html`<section class="a-card"><h2>Setup checklist</h2><p>${icon('check', 16)} Everything important is filled in.</p></section>`}
    <section class="a-card"><h2>Latest enquiries</h2>${latest.length ? html`<table class="a-table"><tbody>${latest.map((e) => html`<tr><td><a href="${A}/enquiries/${e.id}"><b>${e.name}</b></a><br><small>${e.product || e.type}</small></td><td>${e.phone}</td><td>${V.badge(e.status, e.status === 'new' ? 'warn' : '')}</td><td><small>${fmtDate(e.created_at)}</small></td></tr>`)}</tbody></table><p><a href="${A}/enquiries">All enquiries →</a></p>` : html`<p class="a-muted">No enquiries yet.</p>`}</section></div>
    <div class="a-cols three"><section class="a-card"><h2>Top pages <a class="a-btn a-btn--sm a-btn--ghost" href="${A}/visitors">All visitor details</a></h2><ol class="a-list">${an.top.map((t) => html`<li><code>${t.path}</code><b>${t.views}</b></li>`)}${an.top.length ? '' : html`<li class="a-muted">No data yet</li>`}</ol></section>
    <section class="a-card"><h2>Referrers</h2><ol class="a-list">${an.refs.map((t) => html`<li>${t.val}<b>${t.n}</b></li>`)}${an.refs.length ? '' : html`<li class="a-muted">No data yet</li>`}</ol><h2 style="margin-top:1rem">Devices</h2><ol class="a-list">${an.devs.map((t) => html`<li>${t.kind}<b>${t.n}</b></li>`)}</ol></section>
    <section class="a-card"><h2>Chat questions with no answer</h2><p class="a-muted">Add these as FAQs.</p><ol class="a-list">${open.map((t) => html`<li>${t.q}<b>${t.n}</b></li>`)}${open.length ? '' : html`<li class="a-muted">None 🎉</li>`}</ol><a class="a-btn" href="${A}/c/faqs/new">Add FAQ</a></section></div>` });
}));

// ───────────────────────── content models (generic CRUD)
const PUBLIC_URL = { category: (r) => `/products/category/${r.slug}`, product: (r) => `/products/${r.slug}`, blog: (r) => `/blog/${r.slug}`, page: (r) => `/${r.slug}`, landing: (r) => `/${r.slug}`, area: (r) => `/pvc-pipes-in-${r.slug}` };
function modelGuard(req, res, next) {
  const key = req.params.model; const m = MODELS[key]; if (!m) return res.status(404).type('text').send('Unknown section');
  if (m.group === 'Appearance' && !auth.can(req.user, 'admin')) return res.status(403).type('text').send('Admins only');
  req.model = key; req.m = m; next();
}
router.get('/c/:model', modelGuard, wrap(async (req, res) => {
  const key = req.model; const m = req.m; const q = String(req.query.q || '').slice(0, 60); const pg = Math.max(1, parseInt(req.query.page, 10) || 1); const per = 30;
  const { rows, total } = crud.list(key, { q, page: pg, per });
  const cols = m.fields.filter((x) => x.list).slice(0, 5); const relMaps = {};
  for (const c of cols) if (c.t === 'rel') relMaps[c.k] = Object.fromEntries(crud.list(c.rel, { per: 200, hydrateRows: false }).rows.map((r) => [r.id, r[MODELS[c.rel].title]]));
  const cell = (c, r) => { const v = r[c.k]; switch (c.t) { case 'image': return v ? html`<img class="a-thumb" src="${v}" alt="" loading="lazy">` : html`<span class="a-muted">—</span>`; case 'bool': return v ? '✓' : ''; case 'rel': return relMaps[c.k][v] || ''; case 'select': { const o = crud.options(c).find((x) => String(x[0]) === String(v)); return o ? o[1] : v; } case 'datetime': return v ? String(v).replace('T', ' ') : ''; default: return String(v == null ? '' : v).slice(0, 80); } };
  const canMove = m.sortable && !q;
  page(req, res, { title: m.label, wide: true, actions: html`<form class="a-search" method="get"><input type="search" name="q" value="${q}" placeholder="Search…" aria-label="Search"></form><a class="a-btn a-btn--primary" href="${A}/c/${key}/new">${icon('plus', 16)} New ${m.singular}</a>`,
    body: html`${m.help ? html`<p class="a-note">${m.help}</p>` : ''}<div class="a-card flush"><div class="a-scroll"><table class="a-table"><thead><tr>${canMove ? html`<th></th>` : ''}${cols.map((c) => html`<th>${c.label || c.k.replace(/_/g, ' ')}</th>`)}<th>Status</th><th class="r">Actions</th></tr></thead><tbody>
    ${rows.map((r) => html`<tr class="${r.active ? '' : 'off'}">${canMove ? html`<td class="a-mv"><form method="post" action="${A}/c/${key}/${r.id}/move">${V.csrfInput(req)}<button name="dir" value="up" title="Move up" aria-label="Move up">▲</button><button name="dir" value="down" title="Move down" aria-label="Move down">▼</button></form></td>` : ''}
    ${cols.map((c, i) => html`<td>${i === 0 ? html`<a href="${A}/c/${key}/${r.id}"><b>${cell(c, r) || '(untitled)'}</b></a>` : cell(c, r)}</td>`)}
    <td><form method="post" action="${A}/c/${key}/${r.id}/toggle">${V.csrfInput(req)}<button class="a-switch ${r.active ? 'on' : ''}" title="Show / hide on website" aria-pressed="${!!r.active}"><i></i><span class="sr">${r.active ? 'Visible' : 'Hidden'}</span></button></form></td>
    <td class="r a-row-act"><a class="a-btn a-btn--sm" href="${A}/c/${key}/${r.id}">Edit</a>${m.public && r.slug ? html`<a class="a-btn a-btn--sm a-btn--ghost" href="${PUBLIC_URL[m.public](r)}" target="_blank" rel="noopener">View</a>` : ''}
    <form method="post" action="${A}/c/${key}/${r.id}/duplicate" class="inl">${V.csrfInput(req)}<button class="a-btn a-btn--sm a-btn--ghost">Duplicate</button></form>
    <form method="post" action="${A}/c/${key}/${r.id}/delete" class="inl" data-confirm="Delete this ${m.singular.toLowerCase()}? This cannot be undone.">${V.csrfInput(req)}<button class="a-btn a-btn--sm a-btn--danger">Delete</button></form></td></tr>`)}
    ${rows.length ? '' : html`<tr><td colspan="${cols.length + 3}" class="a-empty">Nothing here yet. <a href="${A}/c/${key}/new">Create the first ${m.singular.toLowerCase()}</a>.</td></tr>`}</tbody></table></div></div>${V.pager(`${A}/c/${key}${q ? '?q=' + encodeURIComponent(q) : ''}`, pg, total, per)}<p class="a-muted">${total} item(s)</p>` });
}));
const formPage = (req, res, key, row, extra = {}) => {
  const m = MODELS[key];
  page(req, res, { title: row ? `Edit ${m.singular}` : `New ${m.singular}`, actions: html`<a class="a-btn a-btn--ghost" href="${A}/c/${key}">← Back to ${m.label}</a>`,
    body: html`${extra.errors && Object.keys(extra.errors).length ? html`<div class="a-alert err" role="alert"><b>Please fix:</b><ul>${Object.values(extra.errors).map((e) => html`<li>${e}</li>`)}</ul></div>` : ''}
    <form method="post" action="${A}/c/${key}/${row ? row.id : 'new'}" class="a-form" data-dirty>${V.csrfInput(req)}${V.modelForm(key, row, extra)}<div class="a-savebar"><button class="a-btn a-btn--primary a-btn--lg" type="submit">${icon('check', 18)} Save</button><a class="a-btn a-btn--ghost" href="${A}/c/${key}">Cancel</a></div></form>` });
};
router.get('/c/:model/new', modelGuard, (req, res) => formPage(req, res, req.model, null));
router.post('/c/:model/new', modelGuard, (req, res) => {
  req.body.active = req.body.active === '1' ? '1' : '0'; // unchecked checkbox is simply absent
  const r = crud.create(req.model, req.body, req);
  if (r.errors) { res.status(422); return formPage(req, res, req.model, null, { errors: r.errors, values: req.body }); }
  res.redirect(`${A}/c/${req.model}?m=created`);
});
router.get('/c/:model/:id', modelGuard, (req, res, next) => { const id = intId(req.params.id); if (!id) return next(); const row = crud.get(req.model, id); if (!row) return res.status(404).type('text').send('Not found'); formPage(req, res, req.model, row); });
router.post('/c/:model/:id/toggle', modelGuard, (req, res) => { crud.toggle(req.model, intId(req.params.id), req); res.redirect(`${A}/c/${req.model}?m=updated`); });
router.post('/c/:model/:id/duplicate', modelGuard, (req, res) => { crud.duplicate(req.model, intId(req.params.id), req); res.redirect(`${A}/c/${req.model}?m=duplicated`); });
router.post('/c/:model/:id/delete', modelGuard, (req, res) => { crud.remove(req.model, intId(req.params.id), req); res.redirect(`${A}/c/${req.model}?m=deleted`); });
router.post('/c/:model/:id/move', modelGuard, (req, res) => { crud.move(req.model, intId(req.params.id), req.body.dir === 'up' ? 'up' : 'down', req); res.redirect(`${A}/c/${req.model}?m=moved`); });
router.post('/c/:model/:id', modelGuard, (req, res) => {
  const id = intId(req.params.id); req.body.active = req.body.active === '1' ? '1' : '0';
  const r = crud.update(req.model, id, req.body, req);
  if (r.notFound) return res.status(404).type('text').send('Not found');
  if (r.errors) { res.status(422); return formPage(req, res, req.model, crud.get(req.model, id), { errors: r.errors, values: req.body }); }
  res.redirect(`${A}/c/${req.model}?m=saved`);
});

// ───────────────────────── enquiries
const STATUSES = ['new', 'contacted', 'quoted', 'won', 'lost', 'closed'];
const csvCell = (v) => { let s = String(v == null ? '' : v).replace(/\r?\n/g, ' '); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
function enqQuery(req) {
  const w = ['spam=?']; const a = [req.query.spam === '1' ? 1 : 0];
  if (STATUSES.includes(req.query.status)) { w.push('status=?'); a.push(req.query.status); }
  if (['quote', 'order', 'dealer', 'support'].includes(req.query.type)) { w.push('type=?'); a.push(req.query.type); }
  const q = String(req.query.q || '').slice(0, 60); if (q) { w.push("(name LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\' OR ref LIKE ? ESCAPE '\\' OR product LIKE ? ESCAPE '\\' OR location LIKE ? ESCAPE '\\')"); const l = `%${q.replace(/[\\%_]/g, '\\$&')}%`; a.push(l, l, l, l, l); }
  return { where: 'WHERE ' + w.join(' AND '), args: a, q };
}
router.get('/enquiries.csv', needs('editor'), (req, res) => {
  const { where, args } = enqQuery(req); const rows = db.prepare(`SELECT * FROM enquiries ${where} ORDER BY id DESC LIMIT 20000`).all(...args);
  const head = ['Ref', 'Date', 'Type', 'Status', 'Name', 'Phone', 'Email', 'Product', 'Size', 'Colour', 'Qty', 'Location', 'Message', 'Items', 'Notes'];
  const lines = [head.map(csvCell).join(',')].concat(rows.map((e) => [e.ref, e.created_at, e.type, e.status, e.name, e.phone, e.email, e.product, e.size, e.color, e.qty, e.location, e.message, JSON.parse(e.items || '[]').map((i) => `${i.name} ${i.size || ''} x${i.qty}`).join('; '), e.notes].map(csvCell).join(',')));
  audit.log(req, 'export', 'enquiries', '', `${rows.length} rows`);
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="enquiries-${new Date().toISOString().slice(0, 10)}.csv"` }).send('﻿' + lines.join('\r\n'));
});
router.get('/enquiries', needs('editor'), (req, res) => {
  const { where, args, q } = enqQuery(req); const pg = Math.max(1, parseInt(req.query.page, 10) || 1); const per = 30;
  const total = db.prepare(`SELECT COUNT(*) n FROM enquiries ${where}`).get(...args).n; const rows = db.prepare(`SELECT * FROM enquiries ${where} ORDER BY id DESC LIMIT ${per} OFFSET ${(pg - 1) * per}`).all(...args);
  const spamN = db.prepare('SELECT COUNT(*) n FROM enquiries WHERE spam=1').get().n; const qs = new URLSearchParams(Object.fromEntries(['status', 'type', 'q', 'spam'].filter((k) => req.query[k]).map((k) => [k, String(req.query[k]).slice(0, 60)]))).toString();
  page(req, res, { title: 'Enquiries', wide: true, actions: html`<a class="a-btn" href="${A}/enquiries.csv?${qs}">${icon('download', 16)} Export CSV</a>`,
    body: html`<form class="a-filters" method="get"><input type="search" name="q" value="${q}" placeholder="Search name, phone, ref, product…"><select name="status"><option value="">All statuses</option>${STATUSES.map((s) => html`<option${req.query.status === s ? ' selected' : ''}>${s}</option>`)}</select><select name="type"><option value="">All types</option>${['quote', 'order', 'dealer', 'support'].map((s) => html`<option${req.query.type === s ? ' selected' : ''}>${s}</option>`)}</select><label class="a-check"><input type="checkbox" name="spam" value="1"${req.query.spam === '1' ? ' checked' : ''}> <span>Spam folder (${spamN})</span></label><button class="a-btn">Filter</button></form>
    <div class="a-card flush"><div class="a-scroll"><table class="a-table"><thead><tr><th>Ref</th><th>Received</th><th>Customer</th><th>Request</th><th>Status</th><th></th></tr></thead><tbody>${rows.map((e) => html`<tr class="${e.status === 'new' ? 'hl' : ''}"><td><code>${e.ref}</code></td><td><small>${String(e.created_at).replace('T', ' ').slice(0, 16)}</small></td><td><a href="${A}/enquiries/${e.id}"><b>${e.name}</b></a><br><a href="tel:${e.phone}">${e.phone}</a></td><td>${e.product || JSON.parse(e.items || '[]').map((i) => i.name).slice(0, 2).join(', ') || e.type}<br><small>${[e.size, e.color, e.qty, e.location].filter(Boolean).join(' · ')}</small></td><td>${V.badge(e.status, e.status === 'new' ? 'warn' : e.status === 'won' ? 'ok' : '')}</td><td class="r"><a class="a-btn a-btn--sm" href="${A}/enquiries/${e.id}">Open</a></td></tr>`)}${rows.length ? '' : html`<tr><td colspan="6" class="a-empty">No enquiries match.</td></tr>`}</tbody></table></div></div>${V.pager(`${A}/enquiries${qs ? '?' + qs : ''}`, pg, total, per)}` });
});
router.get('/enquiries/:id', needs('editor'), (req, res, next) => {
  const e = db.prepare('SELECT * FROM enquiries WHERE id=?').get(intId(req.params.id)); if (!e) return next();
  const items = JSON.parse(e.items || '[]'); const wa = `https://wa.me/${e.phone.replace(/\D/g, '').replace(/^(\d{10})$/, '91$1')}?text=${encodeURIComponent(`Hello ${e.name}, thank you for your enquiry (${e.ref}) to Sri Suriya Polymers.`)}`;
  page(req, res, { title: `Enquiry ${e.ref}`, actions: html`<a class="a-btn a-btn--ghost" href="${A}/enquiries">← All enquiries</a>`,
    body: html`<div class="a-cols"><section class="a-card"><h2>${e.name}</h2><dl class="a-dl"><dt>Phone</dt><dd><a href="tel:${e.phone}">${e.phone}</a> · <a href="${wa}" target="_blank" rel="noopener noreferrer">WhatsApp</a></dd>${e.email ? html`<dt>Email</dt><dd><a href="mailto:${e.email}">${e.email}</a></dd>` : ''}<dt>Received</dt><dd>${String(e.created_at).replace('T', ' ').slice(0, 19)} UTC</dd><dt>Type</dt><dd>${e.type}</dd>${e.product ? html`<dt>Product</dt><dd>${e.product}</dd>` : ''}${e.size ? html`<dt>Size</dt><dd>${e.size}</dd>` : ''}${e.color ? html`<dt>Colour</dt><dd>${e.color}</dd>` : ''}${e.qty ? html`<dt>Quantity</dt><dd>${e.qty}</dd>` : ''}${e.location ? html`<dt>Location</dt><dd>${e.location}</dd>` : ''}<dt>Language</dt><dd>${e.lang}</dd></dl>${e.message ? html`<h3>Message</h3><p class="a-pre">${e.message}</p>` : ''}${items.length ? html`<h3>Quote list</h3><ul>${items.map((i) => html`<li><b>${i.name}</b> ${i.size || ''} ${i.color || ''} × ${i.qty}</li>`)}</ul>` : ''}</section>
    <section class="a-card"><h2>Follow-up</h2><form method="post" action="${A}/enquiries/${e.id}" class="a-form">${V.csrfInput(req)}<div class="a-field"><label for="st">Status</label><select id="st" name="status">${STATUSES.map((s) => html`<option${e.status === s ? ' selected' : ''}>${s}</option>`)}</select></div><div class="a-field"><label for="nt">Internal notes</label><textarea id="nt" name="notes" rows="6" maxlength="3000">${e.notes}</textarea></div><label class="a-check"><input type="checkbox" name="spam" value="1"${e.spam ? ' checked' : ''}> <span>This is spam</span></label><div class="a-savebar"><button class="a-btn a-btn--primary">Save</button></div></form>
    <form method="post" action="${A}/enquiries/${e.id}/delete" data-confirm="Delete this enquiry permanently?">${V.csrfInput(req)}<button class="a-btn a-btn--danger">Delete enquiry</button></form></section></div>` });
});
router.post('/enquiries/:id', needs('editor'), (req, res) => {
  const id = intId(req.params.id); const st = STATUSES.includes(req.body.status) ? req.body.status : 'new';
  db.prepare('UPDATE enquiries SET status=?, notes=?, spam=?, updated_at=? WHERE id=?').run(st, clean(req.body.notes, 3000), req.body.spam === '1' ? 1 : 0, nowISO(), id);
  audit.log(req, 'update', 'enquiry', id, st); res.redirect(`${A}/enquiries/${id}?m=saved`);
});
router.post('/enquiries/:id/delete', needs('editor'), (req, res) => { const id = intId(req.params.id); db.prepare('DELETE FROM enquiries WHERE id=?').run(id); audit.log(req, 'delete', 'enquiry', id); res.redirect(`${A}/enquiries?m=deleted`); });

// ───────────────────────── media library
const SRC_LABEL = { local: 'This site', drive: 'Google Drive', link: 'Link', assets: 'Assets folder' };
const driveCaps = () => {
  const d = require('../drive').enabled(); const l = cfg.UPLOADS_WRITABLE; const pref = settings.get('upload_target') || 'auto';
  // auto = Drive when it is connected, otherwise this website's own files; a forced choice that is not possible here falls back to the other one.
  const def = pref === 'local' ? (l ? 'local' : 'drive') : pref === 'drive' ? (d ? 'drive' : l ? 'local' : 'drive') : (d ? 'drive' : l ? 'local' : 'drive');
  return { drive: d, local: l, def };
};
const targetSelect = (id = 'media-target') => { const c = driveCaps(); return html`<select id="${id}" class="a-sel-sm" aria-label="Where to store new uploads">${c.local ? html`<option value="local" ${c.def === 'local' ? 'selected' : ''}>Store on this website</option>` : ''}${c.drive ? html`<option value="drive" ${c.def === 'drive' ? 'selected' : ''}>Store in my Google Drive</option>` : ''}${!c.local && !c.drive ? html`<option value="" selected>Uploads unavailable – paste a link</option>` : ''}</select>`; };
router.get('/media', needs('editor'), (req, res) => {
  const source = ['local', 'drive', 'link', 'assets'].includes(req.query.src) ? req.query.src : '';
  const q = String(req.query.q || '').slice(0, 60); const kind = ['image', 'video', 'file', 'audio', 'model'].includes(req.query.kind) ? req.query.kind : '';
  let rows; let total;
  if (source === 'assets') { rows = media.scanAssets({ kind, q }).map((m, i) => ({ ...m, id: 0 })); total = rows.length; }
  else ({ rows, total } = media.list({ kind, q, source, page: Math.max(1, parseInt(req.query.page, 10) || 1), per: 60 }));
  const folder = settings.get('drive_folder_url'); const caps = driveCaps();
  const tab = (src, label) => html`<a class="a-tab ${source === src ? 'on' : ''}" href="${A}/media?src=${src}${kind ? '&kind=' + kind : ''}">${label}</a>`;
  const thumb = (m) => m.kind === 'image' ? html`<img src="${m.file}" alt="" loading="lazy" referrerpolicy="no-referrer">` : m.kind === 'video' ? html`<span>▶ VIDEO</span>` : html`<span>${String(m.kind || 'file').toUpperCase()}</span>`;
  page(req, res, { title: 'Media library', wide: true,
    actions: html`${targetSelect('media-target-page')}<label class="a-btn a-btn--primary a-file">${icon('upload', 16)} Upload files<input type="file" id="media-up-page" multiple accept="image/*,video/mp4,video/webm,application/pdf,.glb,audio/*"></label>${folder ? html`<a class="a-btn" href="${folder}" target="_blank" rel="noopener">${icon('external', 16)} Open my Drive folder</a>` : ''}`,
    body: html`<p class="a-note">Images up to ${cfg.UPLOAD_MAX_MB} MB, videos (MP4/WebM) up to ${cfg.VIDEO_MAX_MB} MB, PDF/GLB/audio. SVG and HTML are blocked for security. Tip: WebP/JPG under 300 KB per photo keeps the site fast. ${caps.local ? html`Files you upload here are saved in <code>public/assets/uploads</code> inside the project.` : html`<b>This host cannot store files on disk</b> – upload to Google Drive or paste a link.`}</p>
    <form class="a-linkbox" method="post" action="${A}/media/link">${V.csrfInput(req)}
      <b>Add by link</b> <input name="url" type="url" required placeholder="Paste a public Google Drive link or any https:// image / video / PDF link" aria-label="Link"><input name="title" maxlength="120" placeholder="Name (optional)" aria-label="Name"><select name="kind" aria-label="Type"><option value="">Auto-detect</option><option value="image">Image</option><option value="video">Video</option><option value="file">PDF / file</option></select><button class="a-btn a-btn--primary">${icon('plus', 16)} Add</button>
      <small class="a-help">Google Drive: right-click the file → Share → “Anyone with the link” → Copy link. It is converted automatically.</small></form>
    <div class="a-tabs-row">${tab('', 'All')}${tab('local', 'Uploaded here')}${tab('drive', 'Google Drive')}${tab('link', 'Links')}${tab('assets', 'Assets folder')}<form class="inl" method="get" action="${A}/media"><input type="hidden" name="src" value="${source}"><input type="search" name="q" value="${q}" placeholder="Search…" aria-label="Search files"></form></div>
    <div class="a-media-grid page">${rows.map((m) => html`<figure class="a-media"><div class="a-media__p">${thumb(m)}</div><figcaption><b title="${m.original}">${m.original}</b><small>${SRC_LABEL[m.source] || ''}${m.size ? ' · ' + Math.round(m.size / 1024) + ' KB' : ''}</small><div><button type="button" class="a-btn a-btn--sm" data-copy="${m.file}">Copy URL</button>${m.id ? html`<form method="post" action="${A}/media/${m.id}/delete" class="inl" data-confirm="${m.source === 'local' ? 'Delete this file? Pages using it will show a placeholder.' : 'Remove this from the library? (The file stays in Google Drive / on the other website.)'}">${V.csrfInput(req)}<button class="a-btn a-btn--sm a-btn--danger">${m.source === 'local' ? 'Delete' : 'Remove'}</button></form>` : ''}</div></figcaption></figure>`)}${rows.length ? '' : html`<p class="a-empty">${source === 'assets' ? html`Nothing found. Copy images/videos into <code>public/assets/images</code> or <code>public/assets/videos</code> and reload.` : 'No files yet.'}</p>`}</div>${source === 'assets' ? '' : V.pager(`${A}/media`, Math.max(1, parseInt(req.query.page, 10) || 1), total, 60)}` });
});
router.get('/media/api', needs('editor'), (req, res) => {
  const kind = String(req.query.kind || ''); const q = String(req.query.q || '').slice(0, 60); const src = String(req.query.src || '');
  const caps = driveCaps();
  if (src === 'assets') return res.json({ files: media.scanAssets({ kind, q }).map((m) => ({ id: 0, file: m.file, name: m.original, kind: m.kind, size: m.size, source: 'assets' })), caps });
  const { rows } = media.list({ kind, q, per: 80 });
  res.json({ files: rows.map((m) => ({ id: m.id, file: m.file, name: m.original, kind: m.kind, size: m.size, source: m.source })), caps });
});
router.post('/media/link', needs('editor'), wrap(async (req, res) => {
  const r = media.addLink(String(req.body.url || ''), { title: String(req.body.title || ''), kind: String(req.body.kind || '') }, req);
  if (/json/.test(req.get('accept') || '')) return res.status(r.error ? 400 : 200).json(r.error ? { error: r.error } : { file: r });
  res.redirect(`${A}/media?m=${r.error ? 'linkbad' : 'linked'}`);
}));
router.post('/media/upload', needs('editor'), (req, res, next) => { if (!auth.verifyCsrf(req)) return res.status(403).json({ error: 'Security check failed' }); next(); }, sec.limiters.upload, media.upload.array('files', 10), wrap(async (req, res) => {
  const out = []; const errors = []; const asked = req.body && req.body.target; const target = asked === 'drive' || asked === 'local' ? asked : driveCaps().def;   // no explicit choice → the default from Settings → Media
  for (const f of req.files || []) { const r = await media.save(f, req, target); if (r.error) errors.push(r.error); else out.push(r); }
  res.status(out.length ? 200 : 400).json({ files: out, errors });
}));
router.post('/media/:id/delete', needs('editor'), (req, res) => { media.remove(intId(req.params.id), req); res.redirect(`${A}/media?m=deleted`); });
router.use((err, req, res, next) => { // multer errors on upload
  if (err && /\/media\/upload$/.test(req.path)) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? `File too large (max ${Math.max(cfg.UPLOAD_MAX_MB, cfg.VIDEO_MAX_MB)} MB). For bigger files upload to Google Drive and paste the link.` : 'Upload failed' });
  next(err);
});

// admin3 must be mounted BEFORE admin2, whose last line is the catch-all "Not found" page
require('./admin3')(router, { A, page, wrap, needs, intId, FLASH });
require('./admin2')(router, { A, page, wrap, needs, intId, FLASH, V });
module.exports = router;
