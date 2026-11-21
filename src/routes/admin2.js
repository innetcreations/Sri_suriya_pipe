'use strict';
// Admin part 2: settings, themes, users, my account (password + 2FA), activity log, backup/restore, health.
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const cfg = require('../config');
const db = require('../db');
const auth = require('../auth');
const crud = require('../crud');
const cache = require('../cache');
const audit = require('../audit');
const themes = require('../themes');
const settings = require('../settings');
const { SETTINGS, GROUPS } = require('../settings_schema');
const { html, raw, icon, jsonScript } = require('../render');
const { clean, rand, encrypt, decrypt, nowISO, fmtDate } = require('../util');
const V = require('../views/admin');

module.exports = function mount(router, { A, page, wrap, needs, intId, FLASH }) {
  const csrf = V.csrfInput;

  // ═════════════════════════════════════════ Settings
  const groupOf = (k) => GROUPS.find((g) => g[0] === k);
  const asField = (d, S) => {
    const base = { k: d.key, label: d.label, help: d.help };
    switch (d.type) {
      case 'bool': return [{ ...base, t: 'bool', checkLabel: 'On' }, S[d.key]];
      case 'select': return [{ ...base, t: 'select', options: d.options, def: d.def }, S[d.key]];
      case 'textarea': return [{ ...base, t: d.code ? 'json' : 'textarea', rows: d.code ? 8 : 4, max: d.code ? 20000 : 4000 }, S[d.key]];
      case 'number': return [{ ...base, t: 'number', min: d.min, max: d.max }, S[d.key]];
      case 'url': case 'email': case 'image': return [{ ...base, t: d.type }, S[d.key]];
      default: return [{ ...base, t: 'text', max: d.type === 'tel' ? 40 : (d.max || 300) }, S[d.key]];
    }
  };
  const secretField = (d, has) => html`<div class="a-field"><label for="f_${d.key}">${d.label}</label><input type="password" id="f_${d.key}" name="${d.key}" value="" autocomplete="new-password" placeholder="${has ? '•••••••• (saved – leave empty to keep)' : 'not set'}" maxlength="500">${d.help ? html`<small class="a-help">${d.help}</small>` : ''}<small class="a-help">Stored encrypted. Never shown again after saving.</small></div>`;

  const settingsPage = (req, res, g, { values, errors = {}, status = 200 } = {}) => {
    const S = settings.all(); const defs = SETTINGS.filter((d) => d.group === g[0]);
    const src = { ...S };
    if (values) for (const d of defs) src[d.key] = d.key in values ? values[d.key] : (d.type === 'bool' ? '0' : S[d.key]);
    res.status(status);
    page(req, res, { title: g[1],
      body: html`${errors._ ? html`<div class="a-alert err" role="alert">${errors._}</div>` : ''}<form method="post" action="${A}/settings/${g[0]}" class="a-form" data-dirty>${csrf(req)}<div class="a-grid">${defs.map((d) => (d.type === 'secret' ? secretField(d, !!S[d.key]) : V.field(...asField(d, src), { errors })))}</div>
      <div class="a-savebar"><button class="a-btn a-btn--primary a-btn--lg" type="submit">${icon('check', 18)} Save ${g[1]}</button></div></form>${g[0] === 'forms' ? html`<form method="post" action="${A}/settings/forms/test-mail" class="a-card a-testmail">${csrf(req)}<h2>Send a test e-mail</h2><p class="a-muted">Save the settings above first, then press the button. A test message goes to the “Send new enquiries to” address (check Spam too).</p><button class="a-btn" type="submit">${icon('check', 16)} Send test e-mail</button></form>` : ''}${g[0] === 'general' ? html`<p class="a-muted">Tip: items still showing placeholder text are listed on the dashboard checklist until you fill them in.</p>` : ''}` });
  };
  router.post('/settings/forms/test-mail', needs('admin'), wrap(async (req, res) => {
    const r = await require('../mailer').sendTest();
    audit.log(req, 'test-mail', 'settings', '', r.ok ? 'ok via ' + r.via : 'failed');
    const g = groupOf('forms');
    if (r.ok) return res.redirect(`${A}/settings/forms?m=mailok`);
    return settingsPage(req, res, g, { status: 502, errors: { _: `Test e-mail failed${r.via ? ' (' + r.via + ')' : ''}: ${r.error}` } });
  }));
  router.get('/settings', needs('admin'), (req, res) => res.redirect(`${A}/settings/general`));
  router.get('/settings/:group', needs('admin'), (req, res, next) => { const g = groupOf(req.params.group); if (!g) return next(); settingsPage(req, res, g); });
  router.post('/settings/:group', needs('admin'), (req, res, next) => {
    const g = groupOf(req.params.group); if (!g) return next();
    const keys = SETTINGS.filter((d) => d.group === g[0]).map((d) => d.key);
    const body = { ...req.body };
    // Safety: never let an admin lock themselves out with a wrong IP allow-list.
    if (g[0] === 'security' && body.admin_ip_allow) {
      const list = String(body.admin_ip_allow).split(',').map((x) => x.trim()).filter(Boolean); const me = String(req.ip || '').replace(/^::ffff:/, '');
      if (list.length && !list.includes(me) && me !== '127.0.0.1' && me !== '::1') return settingsPage(req, res, g, { values: body, status: 422, errors: { admin_ip_allow: `Your current IP (${me}) is not in the list – saving would lock you out.`, _: 'Settings were not saved.' } });
    }
    const r = settings.save(body, keys);
    audit.log(req, 'settings', g[0], '', r.saved.length + ' fields');
    if (Object.keys(r.errors).length) return settingsPage(req, res, g, { values: body, status: 422, errors: { ...r.errors, _: 'Some values are invalid – check the highlighted fields.' } });
    res.redirect(`${A}/settings/${g[0]}?m=saved`);
  });

  // ═════════════════════════════════════════ Themes
  const hex6 = (c) => { const s = String(c || '').trim(); if (/^#[0-9a-f]{6}$/i.test(s)) return s.toLowerCase(); if (/^#[0-9a-f]{3}$/i.test(s)) return ('#' + s.slice(1).split('').map((x) => x + x).join('')).toLowerCase(); if (/^#[0-9a-f]{8}$/i.test(s)) return s.slice(0, 7).toLowerCase(); return '#000000'; };
  const COLOR_LABEL = { bg: 'Page background', 'bg-alt': 'Alternate section background', surface: 'Cards', 'surface-2': 'Cards (secondary)', text: 'Text', 'text-muted': 'Muted text', primary: 'Primary / buttons', 'primary-contrast': 'Text on primary', secondary: 'Secondary (dark areas)', accent: 'Accent', border: 'Borders', success: 'Success', warning: 'Warning', danger: 'Danger', 'hero-from': 'Hero gradient start', 'hero-to': 'Hero gradient end' };
  const KIND = { builtin: 'Built-in', event: 'Festival', custom: 'Custom' };

  router.get('/themes', needs('admin'), (req, res) => {
    const list = themes.all(); const S = settings.all(); const ev = themes.activeEvent();
    const card = (t) => { const v = themes.complete(t); return html`<article class="a-theme${S.active_theme === t.slug ? ' on' : ''}"><div class="a-theme__sw" aria-hidden="true">${['bg', 'surface', 'primary', 'secondary', 'accent', 'text'].map((k) => html`<i style="background:${v[k]}"></i>`)}</div>
      <h3>${t.name}</h3><p>${V.badge(KIND[t.kind] || t.kind)} ${V.badge(t.dark ? 'Dark' : 'Light')} ${S.active_theme === t.slug ? V.badge('Default', 'ok') : ''} ${t.visitor ? V.badge('Visitors can pick', '') : ''}</p><p class="a-muted">Particles: ${t.particles.preset} · Sound: ${t.sound_pack}</p>
      <div class="a-theme__act"><a class="a-btn a-btn--sm" href="${A}/themes/${t.slug}">Edit</a><a class="a-btn a-btn--sm a-btn--ghost" href="/?preview_theme=${t.slug}" target="_blank" rel="noopener">Preview</a>
      ${S.active_theme !== t.slug ? html`<form method="post" action="${A}/themes/${t.slug}/activate" class="inl">${csrf(req)}<button class="a-btn a-btn--sm a-btn--ghost">Make default</button></form>` : ''}
      <form method="post" action="${A}/themes/${t.slug}/duplicate" class="inl">${csrf(req)}<button class="a-btn a-btn--sm a-btn--ghost">Duplicate</button></form>
      ${t.kind === 'custom' ? html`<form method="post" action="${A}/themes/${t.slug}/delete" class="inl" data-confirm="Delete theme “${t.name}”?">${csrf(req)}<button class="a-btn a-btn--sm a-btn--danger">Delete</button></form>` : html`<form method="post" action="${A}/themes/${t.slug}/reset" class="inl" data-confirm="Restore “${t.name}” to its original design?">${csrf(req)}<button class="a-btn a-btn--sm a-btn--ghost">Reset</button></form>`}
      <a class="a-btn a-btn--sm a-btn--ghost" href="${A}/themes/${t.slug}.json" download>Export</a></div></article>`; };
    const groups = [['Business themes', list.filter((t) => t.kind !== 'event' && t.kind !== 'custom')], ['Festival & global-event themes', list.filter((t) => t.kind === 'event')], ['Your custom themes', list.filter((t) => t.kind === 'custom')]];
    page(req, res, { title: 'Themes', wide: true, actions: html`<a class="a-btn a-btn--primary" href="${A}/themes/new">${icon('plus', 16)} New theme</a><a class="a-btn" href="${A}/c/events">Festival calendar</a>`,
      body: html`<div class="a-card"><p><b>How theme choice works:</b> ${S.theme_mode === 'events' ? html`festival themes switch on automatically between the dates in the Festival calendar; otherwise the default theme (“${(themes.bySlug(S.active_theme) || {}).name}”) is used.` : html`the default theme is always used (automatic festival switching is OFF – change it in <a href="${A}/settings/appearance">Appearance settings</a>).`} ${S.allow_visitor_theme === '1' ? 'Visitors may also pick a theme from the header.' : ''}</p>${ev ? html`<p>${icon('calendar', 16)} Today: <b>${ev.name}</b> is active.</p>` : ''}</div>
      ${groups.map(([title, ts]) => html`<h2 class="a-h2">${title}</h2><div class="a-themes">${ts.map(card)}${ts.length ? '' : html`<p class="a-muted">None yet.</p>`}</div>`)}
      <h2 class="a-h2">Import a theme</h2><form method="post" action="${A}/themes/import" class="a-card a-form">${csrf(req)}<div class="a-field wide"><label for="timp">Paste exported theme JSON</label><textarea id="timp" name="json" rows="5" class="mono" spellcheck="false" maxlength="60000"></textarea></div><button class="a-btn">Import</button></form>` });
  });

  const themeForm = (req, res, t, errors = {}, status = 200, draft = null) => {
    const isNew = !t; const base = t || draft || { name: '', dark: 0, vars: {}, particles: { preset: 'bubbles', density: 1 }, sound_pack: 'water', pipes: ['#1e88e5', '#ffffff', '#9e9e9e', '#f5f0e1'], custom_css: '', visitor: 1, kind: 'custom' };
    const v = themes.complete(base); const pipes = (base.pipes && base.pipes.length ? base.pipes : ['#1e88e5', '#ffffff', '#9e9e9e', '#f5f0e1']).concat(['', '', '', '']).slice(0, 4);
    const sel = (name, opts, cur) => html`<select name="${name}">${opts.map(([val, lab]) => html`<option value="${val}"${String(cur) === String(val) ? ' selected' : ''}>${lab}</option>`)}</select>`;
    res.status(status);
    page(req, res, { title: isNew ? 'New theme' : `Edit theme: ${base.name}`, wide: true, actions: html`<a class="a-btn a-btn--ghost" href="${A}/themes">← All themes</a>${!isNew ? html`<a class="a-btn" href="/?preview_theme=${base.slug}" target="_blank" rel="noopener">Open full preview</a>` : ''}`,
      body: html`${errors.name ? html`<div class="a-alert err">${errors.name}</div>` : ''}
      <script type="application/json" id="theme-maps">${raw(jsonScript({ fonts: themes.FONTS, shadows: themes.SHADOWS }))}</script>
      <form method="post" action="${A}/themes/${isNew ? 'new' : base.slug}" class="a-form a-theme-editor" data-dirty data-theme-form>${csrf(req)}
      <div class="a-theme-editor__form"><div class="a-card"><h2>Basics</h2><div class="a-grid"><div class="a-field"><label for="tn">Theme name <abbr title="required">*</abbr></label><input id="tn" name="name" value="${base.name}" required maxlength="60"></div>
      ${isNew ? html`<div class="a-field"><label for="ts">Short key (optional)</label><input id="ts" name="slug" maxlength="60" pattern="[a-z0-9\\-]*" placeholder="auto"></div>` : ''}
      <div class="a-field"><label class="a-check"><input type="checkbox" name="dark" value="1"${base.dark ? ' checked' : ''} data-tp-dark> <span>Dark theme (affects default colours and form controls)</span></label></div>
      ${base.kind !== 'event' ? html`<div class="a-field"><label class="a-check"><input type="checkbox" name="visitor" value="1"${base.visitor ? ' checked' : ''}> <span>Let visitors pick this theme in the header</span></label></div>` : ''}</div></div>
      <div class="a-card"><h2>Colours</h2><p class="a-muted">Pick the main colours; the contrast text colour is chosen automatically if you leave it unchanged. Check the preview on the right.</p><div class="a-colors">${themes.COLOR_KEYS.map((k) => html`<label class="a-color"><span>${COLOR_LABEL[k] || k}</span><span class="a-color__in"><input type="color" value="${hex6(v[k])}" data-cp aria-label="${COLOR_LABEL[k] || k} picker"><input type="text" name="v_${k}" value="${hex6(v[k])}" maxlength="9" spellcheck="false" data-cp-text data-var="${k}" aria-label="${COLOR_LABEL[k] || k} hex"></span></label>`)}</div></div>
      <div class="a-card"><h2>Style</h2><div class="a-grid"><div class="a-field"><label>Heading font</label>${sel('v_font-heading', Object.keys(themes.FONTS).map((f) => [f, f]), v['font-heading'])}</div><div class="a-field"><label>Body font</label>${sel('v_font-body', Object.keys(themes.FONTS).map((f) => [f, f]), v['font-body'])}</div>
      <div class="a-field"><label>Shadow style</label>${sel('v_shadow', Object.keys(themes.SHADOWS).map((f) => [f, f]), v.shadow)}</div><div class="a-field"><label>Corner roundness <output data-out="v_radius">${v.radius}</output> px</label><input type="range" name="v_radius" min="0" max="32" step="1" value="${v.radius}" data-range></div>
      <div class="a-field"><label>Animation speed <output data-out="v_anim">${v.anim}</output>×</label><input type="range" name="v_anim" min="0.4" max="2.5" step="0.1" value="${v.anim}" data-range></div></div></div>
      <div class="a-card"><h2>Effects</h2><div class="a-grid"><div class="a-field"><label>Particles</label>${sel('p_preset', themes.PARTICLES.map((f) => [f, f]), (base.particles || {}).preset || 'none')}</div><div class="a-field"><label>Particle density (0–3)</label><input type="number" name="p_density" min="0" max="3" step="0.1" value="${(base.particles || {}).density ?? 1}"></div>
      <div class="a-field"><label>Sound pack</label>${sel('sound_pack', themes.SOUND_PACKS.map((f) => [f, f]), base.sound_pack)}</div></div>
      <h3>3D pipe colours</h3><p class="a-muted">Colours of the pipes in the hero and the configurator (up to 4).</p><div class="a-grid four">${pipes.map((c, i) => html`<div class="a-field"><label>Pipe ${i + 1}</label><span class="a-color__in"><input type="color" value="${hex6(c || '#cccccc')}" data-cp aria-label="Pipe ${i + 1} picker"><input type="text" name="pipe_${i + 1}" value="${c}" maxlength="9" spellcheck="false" data-cp-text placeholder="#rrggbb"></span></div>`)}</div></div>
      <div class="a-card"><h2>Advanced: custom CSS</h2><p class="a-muted">Applied with this theme only. Plain CSS; @import and scripts are removed.</p><textarea name="custom_css" rows="6" class="mono" spellcheck="false" maxlength="20000">${base.custom_css || ''}</textarea></div>
      <div class="a-savebar"><button class="a-btn a-btn--primary a-btn--lg" type="submit">${icon('check', 18)} Save theme</button><a class="a-btn a-btn--ghost" href="${A}/themes">Cancel</a></div></div>
      <aside class="a-theme-editor__prev" aria-label="Live preview"><div class="a-theme-prev" data-theme-prev>
        <div class="tp-head"><b class="tp-logo">SRI SURIYA</b><span class="tp-nav"><i>Products</i><i>About</i><i>Contact</i></span><span class="tp-btn sm">Get quote</span></div>
        <div class="tp-hero"><small class="tp-eyebrow">PVC Pipe Manufacturer</small><h4>Quality pipes, delivered across Tamil Nadu</h4><p>Agriculture, plumbing, borewell and drainage systems.</p><span class="tp-btn">Request a quote</span> <span class="tp-btn ghost">Products</span></div>
        <div class="tp-cards"><div class="tp-card"><b>SWR Pipes</b><small>Drainage &amp; sewage</small><span class="tp-chip">Best seller</span></div><div class="tp-card"><b>Column Pipes</b><small>Borewell</small></div></div>
        <div class="tp-dark"><b>Why choose us</b><span>ISI-grade material · Dispatch from Kappalur</span></div>
        <div class="tp-status"><i class="ok">Success</i><i class="warn">Warning</i><i class="bad">Danger</i></div></div></aside></form>` });
  };
  router.get('/themes/new', needs('admin'), (req, res) => themeForm(req, res, null));
  router.post('/themes/new', needs('admin'), (req, res) => {
    const r = themes.save(req.body, null); if (r.error) return themeForm(req, res, null, { name: r.error }, 422, { name: req.body.name || '', dark: req.body.dark === '1' ? 1 : 0, vars: {}, particles: { preset: 'bubbles', density: 1 }, sound_pack: 'water', pipes: [], custom_css: '', visitor: 1, kind: 'custom' });
    audit.log(req, 'create', 'theme', r.slug, req.body.name); res.redirect(`${A}/themes/${r.slug}?m=created`);
  });
  router.post('/themes/import', needs('admin'), (req, res) => {
    let o = null; try { o = JSON.parse(String(req.body.json || '').slice(0, 60000)); } catch { /* invalid */ }
    const slug = themes.importCustom(o); if (!slug) return res.redirect(`${A}/themes?m=bad`);
    audit.log(req, 'import', 'theme', slug); res.redirect(`${A}/themes/${slug}?m=imported`);
  });
  router.get('/themes/:slug.json', needs('admin'), (req, res, next) => {
    const t = themes.bySlug(req.params.slug); if (!t) return next();
    res.set({ 'Content-Disposition': `attachment; filename="theme-${t.slug}.json"` }).json({ name: t.name, dark: !!t.dark, vars: themes.complete(t), particles: t.particles, sound_pack: t.sound_pack, pipes: t.pipes, custom_css: t.custom_css, visitor: !!t.visitor });
  });
  router.get('/themes/:slug', needs('admin'), (req, res, next) => { const t = themes.bySlug(req.params.slug); if (!t) return next(); themeForm(req, res, t); });
  router.post('/themes/:slug/activate', needs('admin'), (req, res) => { if (themes.bySlug(req.params.slug)) { settings.setOne('active_theme', req.params.slug); audit.log(req, 'activate', 'theme', req.params.slug); } res.redirect(`${A}/themes?m=updated`); });
  router.post('/themes/:slug/duplicate', needs('admin'), (req, res) => { const s = themes.duplicate(req.params.slug); audit.log(req, 'duplicate', 'theme', req.params.slug); res.redirect(s ? `${A}/themes/${s}?m=duplicated` : `${A}/themes?m=bad`); });
  router.post('/themes/:slug/delete', needs('admin'), (req, res) => { themes.remove(req.params.slug); audit.log(req, 'delete', 'theme', req.params.slug); res.redirect(`${A}/themes?m=deleted`); });
  router.post('/themes/:slug/reset', needs('admin'), (req, res) => { themes.reset(req.params.slug); audit.log(req, 'reset', 'theme', req.params.slug); res.redirect(`${A}/themes?m=updated`); });
  router.post('/themes/:slug', needs('admin'), (req, res, next) => {
    const t = themes.bySlug(req.params.slug); if (!t) return next();
    const r = themes.save(req.body, t); if (r.error) return themeForm(req, res, t, { name: r.error }, 422);
    audit.log(req, 'update', 'theme', t.slug, t.name); res.redirect(`${A}/themes/${t.slug}?m=saved`);
  });

  // ═════════════════════════════════════════ Users (super admin)
  const tempPassword = () => rand(10).replace(/[^A-Za-z0-9]/g, 'x') + 'aA1!' + rand(3).replace(/[^A-Za-z0-9]/g, 'z');
  const activeSupers = () => db.prepare("SELECT COUNT(*) n FROM users WHERE role='superadmin' AND active=1").get().n;
  const secretPage = (req, res, title, lines) => page(req, res, { title, body: html`<div class="a-card"><div class="a-alert ok"><b>Copy this now – it is shown only once.</b></div>${lines.map(([k, v]) => html`<p>${k}: <code class="a-secret">${v}</code></p>`)}<p class="a-muted">The person must change this password when they first sign in.</p><p><a class="a-btn" href="${A}/users">Back to users</a></p></div>` });

  router.get('/users', needs('superadmin'), (req, res) => {
    const rows = db.prepare('SELECT * FROM users ORDER BY id').all();
    page(req, res, { title: 'Users & roles', wide: true,
      body: html`<div class="a-card flush"><div class="a-scroll"><table class="a-table"><thead><tr><th>User</th><th>Role</th><th>2FA</th><th>Last sign-in</th><th>Status</th><th class="r">Actions</th></tr></thead><tbody>${rows.map((u) => html`<tr class="${u.active ? '' : 'off'}"><td><b>${u.name || '(no name)'}</b><br><small>${u.email}</small>${u.id === req.user.id ? html` ${V.badge('you', 'ok')}` : ''}</td>
      <td><form method="post" action="${A}/users/${u.id}/role" class="inl-form">${csrf(req)}<select name="role" aria-label="Role">${Object.entries(auth.ROLE_LABEL).map(([r, l]) => html`<option value="${r}"${u.role === r ? ' selected' : ''}>${l}</option>`)}</select><button class="a-btn a-btn--sm">Set</button></form></td>
      <td>${u.totp_enabled ? V.badge('on', 'ok') : V.badge('off', 'warn')}</td><td><small>${u.last_login_at ? fmtDate(u.last_login_at) : 'never'}</small></td><td>${u.active ? 'Active' : V.badge('Disabled', 'warn')}${u.locked_until > Date.now() ? html` ${V.badge('locked', 'warn')}` : ''}</td>
      <td class="r a-row-act"><form method="post" action="${A}/users/${u.id}/toggle" class="inl">${csrf(req)}<button class="a-btn a-btn--sm a-btn--ghost">${u.active ? 'Disable' : 'Enable'}</button></form>
      <form method="post" action="${A}/users/${u.id}/reset-password" class="inl" data-confirm="Create a new temporary password for ${u.email}? They will be signed out.">${csrf(req)}<button class="a-btn a-btn--sm a-btn--ghost">Reset password</button></form>
      ${u.totp_enabled ? html`<form method="post" action="${A}/users/${u.id}/reset-2fa" class="inl" data-confirm="Turn off 2FA for ${u.email}?">${csrf(req)}<button class="a-btn a-btn--sm a-btn--ghost">Reset 2FA</button></form>` : ''}
      ${u.id !== req.user.id ? html`<form method="post" action="${A}/users/${u.id}/delete" class="inl" data-confirm="Delete ${u.email} permanently?">${csrf(req)}<button class="a-btn a-btn--sm a-btn--danger">Delete</button></form>` : ''}</td></tr>`)}</tbody></table></div></div>
      <h2 class="a-h2">Add a user</h2><form method="post" action="${A}/users/new" class="a-card a-form">${csrf(req)}<div class="a-grid"><div class="a-field"><label for="ue">Email <abbr title="required">*</abbr></label><input id="ue" type="email" name="email" required maxlength="200"></div><div class="a-field"><label for="un">Name</label><input id="un" name="name" maxlength="80"></div>
      <div class="a-field"><label for="ur">Role</label><select id="ur" name="role">${Object.entries(auth.ROLE_LABEL).map(([r, l]) => html`<option value="${r}"${r === 'editor' ? ' selected' : ''}>${l}</option>`)}</select></div></div><p class="a-muted">A temporary password is generated and shown once.</p><button class="a-btn a-btn--primary">Create user</button></form>` });
  });
  router.post('/users/new', needs('superadmin'), wrap(async (req, res) => {
    const pw = tempPassword();
    try { const id = await auth.createUser({ email: req.body.email, name: req.body.name, role: req.body.role, password: pw, mustChange: true }); audit.log(req, 'create', 'user', id, req.body.email); secretPage(req, res, 'User created', [['Email', clean(req.body.email, 200).toLowerCase()], ['Temporary password', pw]]); }
    catch (e) { res.redirect(`${A}/users?m=bad`); }
  }));
  const target = (req) => db.prepare('SELECT * FROM users WHERE id=?').get(intId(req.params.id));
  router.post('/users/:id/role', needs('superadmin'), (req, res) => {
    const u = target(req); if (!u || !auth.ROLES[req.body.role]) return res.redirect(`${A}/users?m=bad`);
    if (u.role === 'superadmin' && req.body.role !== 'superadmin' && activeSupers() <= 1) return res.redirect(`${A}/users?m=bad`);
    db.prepare('UPDATE users SET role=? WHERE id=?').run(req.body.role, u.id);
    audit.log(req, 'role', 'user', u.id, `${u.role} → ${req.body.role}`); res.redirect(`${A}/users?m=updated`);
  });
  router.post('/users/:id/toggle', needs('superadmin'), (req, res) => {
    const u = target(req); if (!u || u.id === req.user.id) return res.redirect(`${A}/users?m=bad`);
    if (u.active && u.role === 'superadmin' && activeSupers() <= 1) return res.redirect(`${A}/users?m=bad`);
    db.prepare('UPDATE users SET active=1-active WHERE id=?').run(u.id); db.prepare('DELETE FROM sessions WHERE user_id=?').run(u.id);
    audit.log(req, 'toggle', 'user', u.id); res.redirect(`${A}/users?m=updated`);
  });
  router.post('/users/:id/reset-password', needs('superadmin'), wrap(async (req, res) => {
    const u = target(req); if (!u) return res.redirect(`${A}/users?m=bad`);
    const pw = tempPassword(); await auth.setPassword(u.id, pw, { mustChange: true }); audit.log(req, 'reset_password', 'user', u.id);
    if (u.id === req.user.id) return res.redirect(`${A}/login`);
    secretPage(req, res, 'Password reset', [['Email', u.email], ['Temporary password', pw]]);
  }));
  router.post('/users/:id/reset-2fa', needs('superadmin'), (req, res) => {
    const u = target(req); if (!u) return res.redirect(`${A}/users?m=bad`);
    db.prepare('UPDATE users SET totp_enabled=0, totp_secret=NULL WHERE id=?').run(u.id); db.prepare('DELETE FROM sessions WHERE user_id=?').run(u.id);
    audit.log(req, 'reset_2fa', 'user', u.id); res.redirect(`${A}/users?m=updated`);
  });
  router.post('/users/:id/delete', needs('superadmin'), (req, res) => {
    const u = target(req); if (!u || u.id === req.user.id) return res.redirect(`${A}/users?m=bad`);
    if (u.role === 'superadmin' && u.active && activeSupers() <= 1) return res.redirect(`${A}/users?m=bad`);
    db.prepare('DELETE FROM users WHERE id=?').run(u.id); audit.log(req, 'delete', 'user', u.id, u.email); res.redirect(`${A}/users?m=deleted`);
  });

  // ═════════════════════════════════════════ My account: password + 2FA
  const accountPage = async (req, res, { err, setup, status = 200 } = {}) => {
    const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id); let qr = null;
    if (setup && u.totp_secret && !u.totp_enabled) qr = await auth.totpQr(u.email, decrypt(u.totp_secret));
    const force = req.query.force === '1';
    res.status(status);
    page(req, res, { title: 'My account',
      body: html`${force && req.user.mustChange ? html`<div class="a-alert err"><b>Please choose a new password</b> before continuing.</div>` : ''}${force && !req.user.mustChange && settings.bool('require_2fa') && !req.user.totp ? html`<div class="a-alert err"><b>Two-factor authentication is required.</b> Turn it on below to continue.</div>` : ''}${err ? html`<div class="a-alert err" role="alert">${err}</div>` : ''}
      <div class="a-cols"><section class="a-card"><h2>Profile</h2><dl class="a-dl"><dt>Name</dt><dd>${u.name || '—'}</dd><dt>Email</dt><dd>${u.email}</dd><dt>Role</dt><dd>${auth.ROLE_LABEL[u.role]}</dd><dt>Last sign-in</dt><dd>${u.last_login_at ? fmtDate(u.last_login_at) : '—'}</dd></dl>
      <form method="post" action="${A}/account/profile" class="a-form">${csrf(req)}<div class="a-field"><label for="pn">Display name</label><input id="pn" name="name" value="${u.name}" maxlength="80"></div><button class="a-btn">Save name</button></form></section>
      <section class="a-card"><h2>Change password</h2><form method="post" action="${A}/account/password" class="a-form" autocomplete="off">${csrf(req)}<div class="a-field"><label for="cp">Current password</label><input id="cp" type="password" name="current" required autocomplete="current-password" maxlength="200"></div><div class="a-field"><label for="np">New password</label><input id="np" type="password" name="password" required autocomplete="new-password" minlength="12" maxlength="200"><small class="a-help">At least 12 characters. Use a passphrase or a password manager. You will be signed out of other devices.</small></div><div class="a-field"><label for="np2">Repeat new password</label><input id="np2" type="password" name="password2" required autocomplete="new-password" maxlength="200"></div><button class="a-btn a-btn--primary">Change password</button></form></section></div>
      <section class="a-card"><h2>Two-factor authentication (2FA)</h2>${u.totp_enabled ? html`<p>${V.badge('ON', 'ok')} You need a code from your authenticator app each time you sign in.</p><form method="post" action="${A}/account/2fa/disable" class="a-form" data-confirm="Turn off 2FA? Your account becomes less secure.">${csrf(req)}<div class="a-field"><label for="dp">Confirm with your password</label><input id="dp" type="password" name="current" required autocomplete="current-password" maxlength="200"></div><button class="a-btn a-btn--danger">Turn off 2FA</button></form>`
        : qr ? html`<ol><li>Install an authenticator app (Google Authenticator, Microsoft Authenticator, Authy).</li><li>Scan this QR code, or type the key manually.</li><li>Enter the 6-digit code to finish.</li></ol><div class="a-2fa"><img src="${qr.dataUrl}" alt="QR code for authenticator app" width="220" height="220"><div><p>Key: <code class="a-secret">${decrypt(u.totp_secret)}</code></p><form method="post" action="${A}/account/2fa/enable" class="a-form">${csrf(req)}<div class="a-field"><label for="tc">6-digit code</label><input id="tc" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="7" required autofocus></div><button class="a-btn a-btn--primary">Turn on 2FA</button></form></div></div>`
          : html`<p>${V.badge('OFF', 'warn')} Strongly recommended for every admin: a stolen password alone will not be enough to sign in.</p><form method="post" action="${A}/account/2fa/start">${csrf(req)}<button class="a-btn a-btn--primary">Set up 2FA</button></form>`}</section>` });
  };
  router.get('/account', wrap((req, res) => accountPage(req, res, { setup: req.query.setup === '1' })));
  router.post('/account/profile', (req, res) => { db.prepare('UPDATE users SET name=? WHERE id=?').run(clean(req.body.name, 80), req.user.id); audit.log(req, 'profile', 'user', req.user.id); res.redirect(`${A}/account?m=saved`); });
  router.post('/account/password', wrap(async (req, res) => {
    const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
    if (!(await auth.verifyPassword(String(req.body.current || '').slice(0, 200), u.pass_hash))) { audit.log(req, 'pw_change_failed', 'user', u.id); return accountPage(req, res, { err: 'Your current password is not correct.', status: 422 }); }
    if (req.body.password !== req.body.password2) return accountPage(req, res, { err: 'The two new passwords do not match.', status: 422 });
    const bad = auth.checkPassword(String(req.body.password || ''), u.email); if (bad) return accountPage(req, res, { err: bad, status: 422 });
    if (await auth.verifyPassword(String(req.body.password), u.pass_hash)) return accountPage(req, res, { err: 'Choose a password you have not used before.', status: 422 });
    await auth.setPassword(u.id, req.body.password, { mustChange: false }); audit.log(req, 'password', 'user', u.id);
    auth.completeLogin(db.prepare('SELECT * FROM users WHERE id=?').get(u.id), req, res); res.redirect(`${A}/account?m=pw`);
  }));
  router.post('/account/2fa/start', wrap(async (req, res) => {
    const u = db.prepare('SELECT totp_enabled FROM users WHERE id=?').get(req.user.id); if (u.totp_enabled) return res.redirect(`${A}/account`);
    db.prepare('UPDATE users SET totp_secret=?, totp_enabled=0 WHERE id=?').run(encrypt(auth.newTotpSecret()), req.user.id);
    res.redirect(`${A}/account?setup=1`);
  }));
  router.post('/account/2fa/enable', wrap(async (req, res) => {
    const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id); if (!u.totp_secret || u.totp_enabled) return res.redirect(`${A}/account`);
    if (!auth.verifyTotp(u.id, decrypt(u.totp_secret), req.body.code)) return accountPage(req, res, { setup: true, err: 'That code did not match. Check your phone clock and try again.', status: 422 });
    db.prepare('UPDATE users SET totp_enabled=1 WHERE id=?').run(u.id); audit.log(req, '2fa_enable', 'user', u.id); res.redirect(`${A}/account?m=2fa_on`);
  }));
  router.post('/account/2fa/disable', wrap(async (req, res) => {
    const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
    if (settings.bool('require_2fa')) return accountPage(req, res, { err: '2FA is required by the site settings and cannot be turned off.', status: 422 });
    if (!(await auth.verifyPassword(String(req.body.current || '').slice(0, 200), u.pass_hash))) return accountPage(req, res, { err: 'Your password is not correct.', status: 422 });
    db.prepare('UPDATE users SET totp_enabled=0, totp_secret=NULL WHERE id=?').run(u.id); audit.log(req, '2fa_disable', 'user', u.id); res.redirect(`${A}/account?m=2fa_off`);
  }));

  // ═════════════════════════════════════════ Activity log
  router.get('/audit', needs('admin'), (req, res) => {
    const pg = Math.max(1, parseInt(req.query.page, 10) || 1); const per = 50; const q = String(req.query.q || '').slice(0, 60);
    const w = q ? "WHERE (action LIKE ? ESCAPE '\\' OR entity LIKE ? ESCAPE '\\' OR user_email LIKE ? ESCAPE '\\' OR detail LIKE ? ESCAPE '\\' OR ip LIKE ? ESCAPE '\\')" : ''; const l = `%${q.replace(/[\\%_]/g, '\\$&')}%`; const args = q ? [l, l, l, l, l] : [];
    const total = db.prepare(`SELECT COUNT(*) n FROM audit_log ${w}`).get(...args).n; const rows = db.prepare(`SELECT * FROM audit_log ${w} ORDER BY id DESC LIMIT ${per} OFFSET ${(pg - 1) * per}`).all(...args);
    page(req, res, { title: 'Activity log', wide: true, actions: html`<form class="a-search" method="get"><input type="search" name="q" value="${q}" placeholder="Search log…" aria-label="Search log"></form>`,
      body: html`<p class="a-note">Every sign-in, failed attempt, content change, export and security event is recorded. Old entries are removed after about 6 months.</p><div class="a-card flush"><div class="a-scroll"><table class="a-table"><thead><tr><th>When (UTC)</th><th>User</th><th>Action</th><th>Item</th><th>Details</th><th>IP</th></tr></thead><tbody>${rows.map((r) => html`<tr><td><small>${String(r.ts).replace('T', ' ').slice(0, 19)}</small></td><td>${r.user_email || '—'}</td><td><code>${r.action}</code></td><td>${[r.entity, r.entity_id].filter(Boolean).join(' #')}</td><td>${r.detail}</td><td><small>${r.ip}</small></td></tr>`)}${rows.length ? '' : html`<tr><td colspan="6" class="a-empty">Nothing logged.</td></tr>`}</tbody></table></div></div>${V.pager(`${A}/audit${q ? '?q=' + encodeURIComponent(q) : ''}`, pg, total, per)}` });
  });

  // ═════════════════════════════════════════ Backup & restore
  const SECRET_KEYS = new Set(SETTINGS.filter((d) => d.type === 'secret').map((d) => d.key));
  const exportBundle = () => ({
    app: 'sri-suriya', version: 1, exported_at: nowISO(), content: crud.exportAll(),
    settings: Object.fromEntries(Object.entries(settings.all()).filter(([k]) => !SECRET_KEYS.has(k))),
    themes: themes.all().filter((t) => t.kind === 'custom').map((t) => ({ name: t.name, dark: !!t.dark, vars: t.vars, particles: t.particles, sound_pack: t.sound_pack, pipes: t.pipes, custom_css: t.custom_css, visitor: !!t.visitor })),
  });
  router.get('/backup', needs('admin'), (req, res) => {
    const dbSize = (() => { try { return fs.statSync(path.join(cfg.DATA_DIR, 'app.db')).size; } catch { return 0; } })();
    page(req, res, { title: 'Backup & restore',
      body: html`<div class="a-cols"><section class="a-card"><h2>1 · Download your content</h2><p>All products, pages, FAQs, menus, festival dates, settings and your custom themes in one file. Passwords and secret keys are <b>not</b> included. Images are not inside this file – see below.</p><a class="a-btn a-btn--primary" href="${A}/backup/content.json">${icon('download', 16)} Download content backup (.json)</a></section>
      ${auth.can(req.user, 'superadmin') ? html`<section class="a-card"><h2>2 · Full database snapshot</h2><p>A complete copy of the database (${(dbSize / 1048576).toFixed(1)} MB) including enquiries, users and activity log. Keep it private.</p><form method="post" action="${A}/backup/database">${csrf(req)}<button class="a-btn">${icon('download', 16)} Download database (.db)</button></form></section>` : ''}</div>
      <section class="a-card"><h2>Your uploaded images &amp; files</h2><p>They live in the <code>public/uploads</code> folder on the server. Back this folder up together with the <code>data</code> folder (database). On most hosts a daily disk snapshot does both – see the README.</p></section>
      ${auth.can(req.user, 'superadmin') ? html`<section class="a-card"><h2>Restore content</h2><div class="a-alert err"><b>This replaces ALL current content, settings and custom themes</b> with the file. Download a backup first.</div><div class="a-field"><label for="imp">Choose a content backup (.json)</label><input id="imp" type="file" accept="application/json,.json" data-import-json="${A}/backup/import"></div><output class="a-import-out" data-import-out></output></section>` : ''}` });
  });
  router.get('/backup/content.json', needs('admin'), (req, res) => {
    audit.log(req, 'export', 'content', '');
    res.set({ 'Content-Disposition': `attachment; filename="sri-suriya-content-${new Date().toISOString().slice(0, 10)}.json"`, 'Content-Type': 'application/json; charset=utf-8' }).send(JSON.stringify(exportBundle(), null, 1));
  });
  router.post('/backup/database', needs('superadmin'), wrap(async (req, res) => {
    const tmp = path.join(os.tmpdir(), `ssp-backup-${rand(8).replace(/[^A-Za-z0-9]/g, 'x')}.db`);
    try { await db.backup(tmp); audit.log(req, 'export', 'database', ''); } catch (e) { return res.redirect(`${A}/backup?m=bad`); }
    res.download(tmp, `sri-suriya-${new Date().toISOString().slice(0, 10)}.db`, () => fs.unlink(tmp, () => {}));
  }));
  router.post('/backup/import', needs('superadmin'), express.json({ limit: '25mb' }), (req, res) => {
    try {
      const d = req.body; if (!d || d.app !== 'sri-suriya' || !d.content) return res.status(400).json({ error: 'This does not look like a Sri Suriya content backup.' });
      const rows = crud.importAll(d.content, req); let themesN = 0;
      if (d.settings && typeof d.settings === 'object') { const keys = SETTINGS.filter((s) => s.type !== 'secret' && s.key in d.settings).map((s) => s.key); settings.save({ ...d.settings }, keys); }
      if (Array.isArray(d.themes)) { db.prepare("DELETE FROM themes WHERE kind='custom'").run(); for (const t of d.themes.slice(0, 100)) if (themes.importCustom(t)) themesN++; cache.bump(); }
      res.json({ ok: true, message: `Restored ${rows} content rows${themesN ? ` and ${themesN} custom theme(s)` : ''}.` });
    } catch (e) { res.status(400).json({ error: 'Restore failed: ' + String(e.message || e).slice(0, 120) }); }
  });
  router.use((err, req, res, next) => { if (err && /\/backup\/import$/.test(req.path)) return res.status(400).json({ error: err.type === 'entity.too.large' ? 'File is too large.' : 'Could not read the file.' }); next(err); });

  // ═════════════════════════════════════════ Health, cache and security checklist
  router.get('/health', needs('admin'), (req, res) => {
    const S = settings.all(); const count = (t) => db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n; const m = process.memoryUsage();
    const fsize = (f) => { try { return fs.statSync(f).size; } catch { return 0; } };
    const mb = (n) => (n / 1048576).toFixed(1) + ' MB';
    const me = db.prepare('SELECT COUNT(*) n FROM users WHERE totp_enabled=1').get().n;
    const checks = [
      [cfg.HTTPS, 'Site is served over HTTPS (SITE_URL starts with https://)'],
      [cfg.isProd, 'NODE_ENV=production'],
      [!db.prepare("SELECT 1 FROM users WHERE email='admin@localhost.local'").get(), 'Default admin e-mail has been changed'],
      [req.user.totp, 'Your account uses 2-factor authentication'],
      [me >= db.prepare('SELECT COUNT(*) n FROM users WHERE active=1').get().n, 'Every active user has 2FA'],
      [cfg.ADMIN_PATH !== '/admin', 'Admin address is not the default /admin (optional hardening: set ADMIN_PATH in .env)'],
      [!!cfg.ALLOWED_HOSTS.length, 'ALLOWED_HOSTS is set (blocks Host-header attacks)'],
      [!!process.env.APP_SECRET, 'APP_SECRET is set in the environment (so it survives re-deploys)'],
      [S.maintenance_mode !== '1', 'Maintenance mode is OFF'],
      [!!(S.smtp_host && S.notify_email), 'E-mail notifications for new enquiries are configured'],
    ];
    page(req, res, { title: 'Health & cache', wide: true,
      body: html`<div class="a-cols"><section class="a-card"><h2>Server</h2><dl class="a-dl"><dt>Node.js</dt><dd>${process.version}</dd><dt>Process uptime</dt><dd>${Math.floor(process.uptime() / 3600)} h ${Math.floor(process.uptime() / 60) % 60} min</dd><dt>Memory (RSS)</dt><dd>${mb(m.rss)}</dd><dt>Database</dt><dd>${mb(fsize(path.join(cfg.DATA_DIR, 'app.db')))}</dd><dt>Cache</dt><dd>${cache.size()} entries · ${cache.stats.hits} hits / ${cache.stats.misses} misses</dd><dt>Load (1/5/15 min)</dt><dd>${os.loadavg().map((x) => x.toFixed(2)).join(' / ')}</dd><dt>Version stamp</dt><dd><code>${cache.version()}</code></dd></dl>
      <form method="post" action="${A}/health/cache" class="inl">${csrf(req)}<button class="a-btn">Clear cache</button></form> <form method="post" action="${A}/health/optimize" class="inl">${csrf(req)}<button class="a-btn a-btn--ghost">Optimise database</button></form></section>
      <section class="a-card"><h2>Content</h2><dl class="a-dl"><dt>Products</dt><dd>${count('products')}</dd><dt>Pages / articles</dt><dd>${count('pages')} / ${count('posts')}</dd><dt>Enquiries</dt><dd>${count('enquiries')}</dd><dt>Media files</dt><dd>${count('media')}</dd><dt>Users</dt><dd>${count('users')}</dd><dt>Active sessions</dt><dd>${db.prepare("SELECT COUNT(*) n FROM sessions WHERE expires_at>?").get(Date.now()).n}</dd></dl></section></div>
      <section class="a-card"><h2>Security checklist</h2><ul class="a-checks">${checks.map(([ok, label]) => html`<li class="${ok ? 'ok' : 'todo'}">${icon(ok ? 'check' : 'alert', 16)} ${label}</li>`)}</ul></section>` });
  });
  router.post('/health/cache', needs('admin'), (req, res) => { cache.clear(); audit.log(req, 'cache_clear', 'system', ''); res.redirect(`${A}/health?m=cache`); });
  router.post('/health/optimize', needs('admin'), (req, res) => { try { db.pragma('wal_checkpoint(TRUNCATE)'); db.pragma('optimize'); } catch { /* ignore */ } audit.log(req, 'optimize', 'system', ''); res.redirect(`${A}/health?m=updated`); });

  // unknown admin URL → friendly 404 (inside the authenticated area)
  router.use((req, res) => res.status(404).type('html').send(V.layout(req, { title: 'Not found', body: html`<div class="a-card"><h2>Page not found</h2><p><a href="${A}">Back to dashboard</a></p></div>` }).toString()));
};
