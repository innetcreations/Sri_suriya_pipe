'use strict';
const { html, raw, esc, icon, ICON_NAMES, jsonScript } = require('../render');
const cfg = require('../config');
const crud = require('../crud');
const auth = require('../auth');
const db = require('../db');
const settings = require('../settings');
const { MODELS, GROUP_ORDER } = require('../schema');
const { GROUPS } = require('../settings_schema');

const A = cfg.ADMIN_PATH;
const GROUP_ICON = { Catalogue: 'box', Website: 'layout', 'Pages & SEO': 'search', Appearance: 'palette' };

function nav(req) {
  const role = req.user.role; const can = (r) => auth.can(req.user, r); const cur = req.path;
  const newEnq = db.prepare("SELECT COUNT(*) n FROM enquiries WHERE status='new' AND spam=0").get().n;
  const link = (href, label, ic, extra = '') => html`<a href="${A}${href}" class="${cur === href || (href !== '' && cur.startsWith(href + '/')) ? 'on' : ''}">${icon(ic, 18)}<span>${label}</span>${extra}</a>`;
  const groups = GROUP_ORDER.map((g) => ({ g, models: Object.entries(MODELS).filter(([, m]) => m.group === g && (g !== 'Appearance' || can('admin'))) })).filter((x) => x.models.length);
  return html`<nav class="a-nav" aria-label="Admin">
    ${link('', 'Dashboard', 'home')}${link('/visitors', 'Visitors', 'eye')}${link('/seo', 'SEO Centre', 'search')}${link('/enquiries', 'Enquiries', 'mail', newEnq ? html`<b class="pill">${newEnq}</b>` : '')}
    ${groups.map(({ g, models }) => html`<p class="a-nav__h">${g}</p>${models.map(([k, m]) => link('/c/' + k, m.label, m.icon || 'file'))}${g === 'Appearance' ? html`${link('/themes', 'Themes', 'palette')}` : ''}`)}
    <p class="a-nav__h">Files</p>${link('/media', 'Media library', 'image')}
    ${can('admin') ? html`<p class="a-nav__h">Settings</p>${GROUPS.map(([k, label, ic]) => link('/settings/' + k, label, ic))}` : ''}
    <p class="a-nav__h">System</p>${can('superadmin') ? link('/users', 'Users & roles', 'users') : ''}${can('admin') ? link('/devices', 'Login & devices', 'key') : ''}${can('admin') ? link('/audit', 'Activity log', 'file') : ''}${can('admin') ? link('/integrations', 'Integrations', 'link') : ''}${can('admin') ? link('/backup', 'Backup & restore', 'database') : ''}${can('admin') ? link('/health', 'Health & cache', 'gear') : ''}${link('/account', 'My account', 'lock')}
  </nav>`;
}

function layout(req, { title, body, wide = false, actions = '' }) {
  const csrf = req.sess.csrf;
  return html`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive">
<title>${title} · Admin</title><link rel="icon" href="${settings.get('favicon') || '/images/favicon.svg'}"><link rel="stylesheet" href="/css/fonts.css"><link rel="stylesheet" href="/css/admin.css?v=${require('../cache').version()}"><meta name="csrf" content="${csrf}"></head>
<body class="admin"><a class="skip" href="#main">Skip to content</a>
<header class="a-top"><button class="a-burger" type="button" data-a-menu aria-label="Menu">${icon('menu', 22)}</button><a class="a-logo" href="${A}">${settings.get('admin_logo') || settings.get('logo') ? html`<img src="${settings.get('admin_logo') || settings.get('logo')}" alt="${settings.get('site_name')}" height="32" class="a-logo__img"><small>Admin</small>` : html`Sri Suriya <small>Admin</small>`}</a>
  <div class="a-top__r"><a class="a-btn a-btn--ghost" href="/" target="_blank" rel="noopener">${icon('external', 16)} View site</a><span class="a-user">${req.user.name || req.user.email}<small>${req.user.role}</small></span>
  <form method="post" action="${A}/logout"><input type="hidden" name="_csrf" value="${csrf}"><button class="a-btn a-btn--ghost" type="submit">${icon('logout', 16)} Sign out</button></form></div></header>
<div class="a-shell"><aside class="a-side">${nav(req)}</aside><main id="main" class="a-main${wide ? ' wide' : ''}" tabindex="-1">
  <div class="a-head"><h1>${title}</h1><div class="a-actions">${actions}</div></div>${req.flash ? html`<div class="a-alert ${req.flash.t}" role="status">${req.flash.m}</div>` : ''}${body}</main></div>
<div class="a-modal" id="media-modal" hidden><div class="a-modal__box"><div class="a-modal__h"><b>Choose a file</b><button type="button" class="a-x" data-modal-close aria-label="Close">×</button></div>
  <div class="a-modal__tabs" role="tablist"><button type="button" role="tab" class="a-tab on" data-mtab="lib">My files</button><button type="button" role="tab" class="a-tab" data-mtab="assets">Assets folder</button><button type="button" role="tab" class="a-tab" data-mtab="link">Paste a link</button></div>
  <div class="a-modal__tools" data-mpanel="lib"><input type="search" id="media-q" placeholder="Search files…"><select id="media-target" class="a-sel-sm" aria-label="Where to store new uploads"></select><label class="a-btn a-btn--primary a-file">${icon('upload', 16)} Upload<input type="file" id="media-up" multiple accept="image/*,video/mp4,video/webm,application/pdf,.glb,audio/*"></label></div>
  <div class="a-modal__tools" data-mpanel="link" hidden><input type="url" id="media-link" placeholder="Paste a public Google Drive link or any https:// link" aria-label="Link"><button type="button" class="a-btn a-btn--primary" id="media-link-add">Add &amp; use</button><small class="a-help">Drive: Share → “Anyone with the link” → Copy link. It is converted automatically.</small></div>
  <div class="a-media-grid" id="media-grid" aria-live="polite"></div></div></div>
<div class="a-toast" id="a-toast" role="status" aria-live="polite"></div><script src="/js/admin.js?v=${require('../cache').version()}" defer></script></body></html>`.toString();
}

// ───────────────────────── form fields
function relOptions(model) { return crud.list(model, { per: 200, hydrateRows: false }).rows.map((r) => [r.id, r[MODELS[model].title]]); }

function field(x, value, { errors = {}, name = x.k, ta = false, ref = null } = {}) {
  const id = 'f_' + name; const err = errors[name]; const label = x.label || x.k.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
  const v = ta ? (value == null ? '' : value) : crud.formValue(x, value);
  const req = x.req && !ta;
  const help = x.help ? html`<small class="a-help">${x.help}</small>` : '';
  let input;
  switch (x.t) {
    case 'textarea': input = html`<textarea id="${id}" name="${name}" rows="${x.rows || 4}" maxlength="${x.max || 5000}">${v}</textarea>`; break;
    case 'json': input = html`<textarea id="${id}" name="${name}" rows="4" spellcheck="false" class="mono">${v}</textarea>`; break;
    case 'kv': input = html`<textarea id="${id}" name="${name}" rows="5" spellcheck="false" class="mono" placeholder="Key: Value">${v}</textarea>`; break;
    case 'images': input = html`<div class="a-img-multi"><textarea id="${id}" name="${name}" rows="3" spellcheck="false" class="mono" placeholder="/uploads/… one per line">${v}</textarea><button type="button" class="a-btn" data-pick-multi="${id}">${icon('image', 16)} Add images</button></div>`; break;
    case 'html': input = html`<div class="a-rte" data-rte><div class="a-rte__bar" role="toolbar" aria-label="Formatting">
      <button type="button" data-cmd="bold" title="Bold"><b>B</b></button><button type="button" data-cmd="italic" title="Italic"><i>I</i></button><button type="button" data-cmd="formatBlock" data-val="h2">H2</button><button type="button" data-cmd="formatBlock" data-val="h3">H3</button><button type="button" data-cmd="formatBlock" data-val="p">¶</button>
      <button type="button" data-cmd="insertUnorderedList">• List</button><button type="button" data-cmd="insertOrderedList">1. List</button><button type="button" data-cmd="createLink">Link</button><button type="button" data-rte-img>Image</button><button type="button" data-cmd="removeFormat">Clear</button><button type="button" data-rte-src>&lt;/&gt;</button></div>
      <div class="a-rte__ed" contenteditable="true" role="textbox" aria-multiline="true" aria-label="${label}">${raw(v)}</div><textarea id="${id}" name="${name}" hidden>${v}</textarea></div>`; break;
    case 'bool': input = html`<label class="a-check"><input type="checkbox" id="${id}" name="${name}" value="1"${v === 1 || v === '1' || v === true ? ' checked' : ''}> <span>${x.checkLabel || 'Yes'}</span></label>`; break;
    case 'select': input = html`<select id="${id}" name="${name}">${(x.required === false || !x.req) && !x.def ? html`<option value="">—</option>` : ''}${crud.options(x).map(([val, lab]) => html`<option value="${val}"${String(v) === String(val) ? ' selected' : ''}>${lab}</option>`)}</select>`; break;
    case 'rel': input = html`<select id="${id}" name="${name}"><option value="">—</option>${relOptions(x.rel).map(([val, lab]) => html`<option value="${val}"${String(v) === String(val) ? ' selected' : ''}>${lab}</option>`)}</select>`; break;
    case 'image': input = html`<div class="a-img"><div class="a-img__prev">${v ? html`<img src="${v}" alt="" loading="lazy">` : html`<span>${icon('image', 22)}</span>`}</div><div class="a-img__f"><input type="text" id="${id}" name="${name}" value="${v}" maxlength="1500" placeholder="/uploads/… or https://…" data-img-input><div><button type="button" class="a-btn" data-pick="${id}">${icon('image', 16)} Choose / upload</button> <button type="button" class="a-btn a-btn--ghost" data-clear="${id}">Clear</button></div></div></div>`; break;
    case 'number': input = html`<input type="number" step="any" id="${id}" name="${name}" value="${v}"${x.min != null ? html` min="${x.min}"` : ''}${x.max != null ? html` max="${x.max}"` : ''}${x.readonly ? ' readonly' : ''}>`; break;
    case 'date': input = html`<input type="date" id="${id}" name="${name}" value="${v}">`; break;
    case 'datetime': input = html`<input type="datetime-local" id="${id}" name="${name}" value="${v}">`; break;
    case 'color': input = html`<input type="color" id="${id}" name="${name}" value="${v || '#000000'}">`; break;
    case 'slug': input = html`<input type="text" id="${id}" name="${name}" value="${v}" maxlength="80" pattern="[a-z0-9\\-]*" data-slug-from="${x.from || ''}" placeholder="auto-generated from ${x.from || 'title'}">`; break;
    case 'url': input = html`<input type="text" id="${id}" name="${name}" value="${v}" maxlength="1500" inputmode="url" placeholder="/page or https://…">`; break;
    case 'email': input = html`<input type="email" id="${id}" name="${name}" value="${v}" maxlength="200">`; break;
    case 'tags': input = ta && Array.isArray(v) ? html`<input type="text" id="${id}" name="${name}" value="${v.join(', ')}">` : html`<input type="text" id="${id}" name="${name}" value="${v}" placeholder="comma, separated">`; break;
    default: input = html`<input type="text" id="${id}" name="${name}" value="${v}" maxlength="${x.max || 300}"${req ? ' required' : ''}${x.pattern ? html` pattern="${x.pattern}"` : ''}>`;
  }
  const wide = ['html', 'textarea', 'images', 'kv', 'json', 'image'].includes(x.t);
  return html`<div class="a-field${wide ? ' wide' : ''}${err ? ' has-err' : ''}"><label for="${id}">${label}${req ? html` <abbr title="required">*</abbr>` : ''}${ta ? html` <span class="a-lang">தமிழ்</span>` : ''}</label>${input}${ref ? html`<small class="a-ref">English: ${ref}</small>` : ''}${help}${err ? html`<small class="a-err">${err}</small>` : ''}</div>`;
}

function modelForm(key, row, { errors = {}, values = null } = {}) {
  const m = MODELS[key]; const get = (k) => (values && k in values ? values[k] : row ? row[k] : null);
  const hasTa = m.fields.some((x) => x.tr);
  const main = m.fields.filter((x) => !x.group); const seo = m.fields.filter((x) => x.group === 'SEO');
  const i18nRow = row ? row.i18n : {}; const taVal = (k) => (values && ('ta__' + k) in values ? values['ta__' + k] : (i18nRow.ta || {})[k]);
  const taFields = m.fields.filter((x) => x.tr);
  return html`<div class="a-tabs" role="tablist"><button type="button" role="tab" aria-selected="true" data-tab="main">Content</button>${seo.length ? html`<button type="button" role="tab" data-tab="seo">SEO</button>` : ''}${hasTa ? html`<button type="button" role="tab" data-tab="ta">தமிழ் (Tamil)</button>` : ''}<label class="a-check a-active"><input type="checkbox" name="active" value="1"${!row || row.active ? ' checked' : ''}> <span>Visible on website</span></label></div>
  <div class="a-grid" data-panel="main">${main.map((x) => field(x, get(x.k), { errors }))}</div>
  ${seo.length ? html`<div class="a-grid" data-panel="seo" hidden>${seo.map((x) => field(x, get(x.k), { errors }))}</div>` : ''}
  ${hasTa ? html`<div class="a-grid" data-panel="ta" hidden><p class="a-note wide">Optional Tamil translations. Anything left empty falls back to English on the Tamil version of the site.</p>${taFields.map((x) => field(x, taVal(x.k), { errors, name: 'ta__' + x.k, ta: true, ref: ['html', 'textarea'].includes(x.t) ? null : (get(x.k) && String(get(x.k)).slice(0, 90)) }))}</div>` : ''}`;
}

const csrfInput = (req) => html`<input type="hidden" name="_csrf" value="${req.sess.csrf}">`;
const pager = (base, page, total, per) => { const n = Math.ceil(total / per); if (n <= 1) return ''; const sep = base.includes('?') ? '&' : '?'; return html`<nav class="a-pager">${Array.from({ length: Math.min(n, 20) }, (_, i) => i + 1).map((p) => html`<a href="${base}${sep}page=${p}" class="${p === page ? 'on' : ''}">${p}</a>`)}</nav>`; };
const badge = (t, c = '') => html`<span class="a-badge ${c}">${t}</span>`;

module.exports = { layout, field, modelForm, csrfInput, pager, badge, A, ICON_NAMES };
