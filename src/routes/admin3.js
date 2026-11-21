'use strict';
// Admin part 3: Visitors (live + history), Login & devices, SEO Centre.
const db = require('../db');
const cfg = require('../config');
const auth = require('../auth');
const audit = require('../audit');
const settings = require('../settings');
const analytics = require('../analytics');
const { MODELS } = require('../schema');
const { parseUA, countryName } = require('../ua');
const { html, raw, icon, esc } = require('../render');
const V = require('../views/admin');

const ist = (ts) => { try { return new Date(ts).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true }); } catch { return String(ts || ''); } };
const istLong = (ts) => { try { return new Date(ts).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }); } catch { return String(ts || ''); } };
const ago = (ms) => { const m = Math.round((Date.now() - ms) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
const words = (s) => String(s || '').replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
const DEV_ICON = { mobile: 'phone', tablet: 'layout', desktop: 'building' };

module.exports = function mount(router, { A, page, wrap, needs, intId, FLASH }) {
  const csrf = V.csrfInput;
  Object.assign(FLASH, { revoked: ['ok', 'That session was signed out.'], revoked_all: ['ok', 'All other sessions were signed out.'], cleared: ['ok', 'Old statistics were cleared.'] });

  // ───────── small SVG charts (numbers only, so they are safe to print raw)
  const bars = (vals, labels, { h = 150, color = 'var(--a-primary)', title = '' } = {}) => {
    const w = 720; const pad = 26; const max = Math.max(3, ...vals); const bw = (w - pad * 2) / vals.length;
    const rects = vals.map((v, i) => { const bh = Math.round((v / max) * (h - pad * 2)); return `<rect x="${(pad + i * bw + 1).toFixed(1)}" y="${h - pad - bh}" width="${Math.max(1, bw - 2).toFixed(1)}" height="${bh}" rx="2" fill="${color}"><title>${esc(labels[i])}: ${v}</title></rect>`; }).join('');
    const step = Math.ceil(vals.length / 8);
    const ticks = labels.map((l, i) => (i % step === 0 ? `<text x="${(pad + i * bw + bw / 2).toFixed(1)}" y="${h - 8}" font-size="10" text-anchor="middle" fill="currentColor" opacity=".6">${esc(l)}</text>` : '')).join('');
    return raw(`<svg viewBox="0 0 ${w} ${h}" class="a-chart" role="img" aria-label="${esc(title)}"><text x="${pad}" y="12" font-size="10" fill="currentColor" opacity=".6">max ${max}</text>${rects}${ticks}</svg>`);
  };
  const share = (rows, total, label = (r) => r.val) => rows.length
    ? html`<ol class="a-list">${rows.map((r) => html`<li><span>${label(r)}</span><b>${r.n.toLocaleString('en-IN')} <small class="a-muted">${total ? Math.round((r.n / total) * 100) : 0}%</small></b></li>`)}</ol>`
    : html`<p class="a-muted">No data yet.</p>`;

  // ═════════════════════════════════════════ Visitors
  router.get('/visitors', needs('editor'), wrap((req, res) => {
    const days = [7, 30, 90].includes(parseInt(req.query.days, 10)) ? parseInt(req.query.days, 10) : 30;
    const an = analytics.summary(days); const S = settings.all();
    const from = new Date(Date.now() - (days - 1) * 864e5).toISOString().slice(0, 10);
    const times = Object.fromEntries(db.prepare('SELECT path, SUM(secs) s, SUM(n) n FROM analytics_time WHERE day>=? GROUP BY path').all(from).map((r) => [r.path, r.n ? Math.round(r.s / r.n) : 0]));
    const recent = analytics.recent(40);
    const ret = an.vtype.find((r) => r.val === 'returning'); const nw = an.vtype.find((r) => r.val === 'new');
    const vt = (ret ? ret.n : 0) + (nw ? nw.n : 0);
    const card = (label, val, sub, ic) => html`<div class="a-kpi"><span class="a-kpi__i">${icon(ic, 22)}</span><div><b>${val}</b><span>${label}</span>${sub ? html`<small>${sub}</small>` : ''}</div></div>`;
    const fmtSecs = (n) => (n >= 60 ? `${Math.floor(n / 60)}m ${n % 60}s` : `${n}s`);
    const tabs = [7, 30, 90].map((d) => html`<a class="a-btn a-btn--sm ${d === days ? '' : 'a-btn--ghost'}" href="${A}/visitors?days=${d}">${d} days</a>`);
    page(req, res, { title: 'Visitors', wide: true,
      actions: html`<a class="a-btn a-btn--ghost" href="${A}/visitors.csv?days=${days}">${icon('download', 16)} Download CSV</a>`,
      body: html`
      ${S.analytics_on === '1' ? '' : html`<div class="a-alert err" role="alert">Visitor counting is switched OFF. Turn it on in Settings → Privacy &amp; Cookies.</div>`}
      <div class="a-kpis">${card('Online now', analytics.live(5), `${analytics.live(30)} in the last 30 min`, 'eye')}${card('Today', an.today.views.toLocaleString('en-IN'), `${an.today.visitors} visitors`, 'chart')}${card(`Page views (${days} d)`, an.totalViews.toLocaleString('en-IN'), `${an.totalVisitors.toLocaleString('en-IN')} visitors`, 'globe')}${card('Avg. time on page', an.avgSeconds ? fmtSecs(an.avgSeconds) : '–', 'Only while the tab is open', 'clock')}${card('Returning visitors', vt ? `${Math.round(((ret ? ret.n : 0) / vt) * 100)}%` : '–', 'Counted only for visitors who accepted cookies', 'users')}</div>
      <p class="a-tabs-row">${tabs}</p>
      <section class="a-card"><h2>Page views per day</h2>${bars(an.series.map((x) => x.views), an.series.map((x) => x.day.slice(5)), { title: 'Page views per day' })}</section>
      <div class="a-cols"><section class="a-card"><h2>Busiest hours (India time)</h2>${bars(an.hours, an.hours.map((_, h) => String(h).padStart(2, '0')), { h: 130, color: 'var(--a-accent)', title: 'Views by hour' })}</section>
      <section class="a-card"><h2>Top pages</h2><div class="a-scroll"><table class="a-table"><thead><tr><th>Page</th><th class="r">Views</th><th class="r">Avg. time</th></tr></thead><tbody>${an.top.map((t) => html`<tr><td><code>${t.path}</code></td><td class="r">${t.views}</td><td class="r">${times[t.path] ? fmtSecs(times[t.path]) : '–'}</td></tr>`)}${an.top.length ? '' : html`<tr><td colspan="3" class="a-empty">No visits recorded yet.</td></tr>`}</tbody></table></div></section></div>
      <div class="a-cols three"><section class="a-card"><h2>Devices</h2>${share(an.devs.map((d) => ({ val: d.kind, n: d.n })), an.totalViews, (r) => r.val)}<h2 style="margin-top:1rem">Operating systems</h2>${share(an.os, an.totalViews)}</section>
      <section class="a-card"><h2>Browsers</h2>${share(an.browsers, an.totalViews)}<h2 style="margin-top:1rem">Languages</h2>${share(an.langs, an.totalViews)}</section>
      <section class="a-card"><h2>Where from</h2>${share(an.countries, an.totalViews, (r) => r.name)}<h2 style="margin-top:1rem">Referrers</h2>${share(an.refs, an.totalViews)}</section></div>
      <section class="a-card flush"><div class="a-card__h"><h2>Latest visits</h2><small class="a-muted">India time · the last ${recent.length} visits · no IP address or raw browser text is stored</small></div><div class="a-scroll"><table class="a-table"><thead><tr><th>Time</th><th>Page</th><th>Device</th><th>OS / browser</th><th>Place</th><th>Came from</th><th>Lang</th><th>Visitor</th></tr></thead><tbody>
      ${recent.map((r) => html`<tr><td><small>${ist(r.ts)}</small></td><td><code>${r.path}</code></td><td>${icon(DEV_ICON[r.dev] || 'building', 16)} ${r.dev}</td><td><small>${r.os} · ${r.browser}</small></td><td><small>${[r.city, r.country ? countryName(r.country) : ''].filter(Boolean).join(', ') || '–'}</small></td><td><small>${r.ref}</small></td><td><small>${r.lang}</small></td><td>${r.ret ? V.badge('returning', 'ok') : V.badge('new')}</td></tr>`)}
      ${recent.length ? '' : html`<tr><td colspan="8" class="a-empty">Nothing yet – open your public website in another browser tab and refresh this page.</td></tr>`}</tbody></table></div></section>
      <section class="a-card"><h2>About these numbers</h2><ul class="a-ul"><li>Your own visits while signed in to the admin are never counted. Search-engine bots and monitoring tools are filtered out.</li><li><b>Country and city</b> appear when your host sends them (Vercel and Cloudflare do). On a plain server they show as “–”.</li><li>If the cookie notice is on, “new vs returning” only counts people who pressed <i>Accept all</i>. Everything else is counted anonymously.</li><li>Want heat-maps and session recordings too? Add a free Microsoft Clarity ID in Settings → SEO &amp; Analytics (it only loads after the visitor accepts cookies).</li></ul>
      ${auth.can(req.user, 'superadmin') ? html`<form method="post" action="${A}/visitors/clear" class="inl-form" data-confirm="Delete ALL visitor statistics? This cannot be undone.">${csrf(req)}<button class="a-btn a-btn--sm a-btn--danger">Clear all statistics</button></form>` : ''}</section>` });
  }));

  router.get('/visitors.csv', needs('editor'), wrap((req, res) => {
    const days = Math.max(1, Math.min(365, parseInt(req.query.days, 10) || 30));
    const an = analytics.summary(days);
    const lines = ['date,page_views,visitors', ...an.series.map((s) => `${s.day},${s.views},${s.visitors}`)];
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="visitors-${days}d.csv"`, 'Cache-Control': 'no-store' }).send(lines.join('\n') + '\n');
  }));

  router.post('/visitors/clear', needs('superadmin'), wrap((req, res) => {
    for (const t of ['analytics_daily', 'analytics_uniques', 'analytics_dim', 'analytics_time', 'analytics_visits']) db.prepare(`DELETE FROM ${t}`).run();
    audit.log(req, 'clear', 'analytics', '', 'all statistics'); res.redirect(`${A}/visitors?m=cleared`);
  }));

  // ═════════════════════════════════════════ Login & devices
  router.get('/devices', needs('admin'), wrap((req, res) => {
    const all = auth.can(req.user, 'superadmin');
    const sess = db.prepare(`SELECT s.id, s.user_id, s.created_at, s.last_seen, s.expires_at, s.ip, s.ua, u.email, u.name FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.stage='ok' AND s.expires_at>? ${all ? '' : 'AND s.user_id=?'} ORDER BY s.last_seen DESC LIMIT 100`).all(...(all ? [Date.now()] : [Date.now(), req.user.id]));
    const hist = db.prepare(`SELECT * FROM login_events ${all ? '' : 'WHERE user_id=?'} ORDER BY id DESC LIMIT 100`).all(...(all ? [] : [req.user.id]));
    const since = new Date(Date.now() - 864e5).toISOString();
    const failed = db.prepare(`SELECT COUNT(*) n FROM login_events WHERE ok=0 AND ts>=?`).get(since).n;
    const okCount = db.prepare(`SELECT COUNT(*) n FROM login_events WHERE ok=1 AND ts>=?`).get(since).n;
    const mine = req.sess.id;
    const card = (label, val, sub, ic) => html`<div class="a-kpi"><span class="a-kpi__i">${icon(ic, 22)}</span><div><b>${val}</b><span>${label}</span>${sub ? html`<small>${sub}</small>` : ''}</div></div>`;
    page(req, res, { title: 'Login & devices', wide: true, body: html`
      <div class="a-kpis">${card('Signed-in sessions', sess.length, all ? 'all users' : 'your account', 'key')}${card('Sign-ins (24 h)', okCount, '', 'users')}${card('Failed attempts (24 h)', failed, failed > 5 ? 'Check the list below' : 'Looks normal', 'shield')}${card('Session length', `${settings.num('session_hours', 12)} h`, `idle logout ${settings.num('session_idle_min', 120)} min`, 'clock')}</div>
      <section class="a-card flush"><div class="a-card__h"><h2>Devices signed in right now</h2><form method="post" action="${A}/devices/revoke-others" class="inl-form" data-confirm="Sign out every other device of your own account?">${csrf(req)}<button class="a-btn a-btn--sm a-btn--ghost">Sign out my other devices</button></form></div><div class="a-scroll"><table class="a-table"><thead><tr><th>User</th><th>Device</th><th>OS / browser</th><th>IP</th><th>Signed in</th><th>Last active</th><th class="r"></th></tr></thead><tbody>
      ${sess.map((s) => { const d = parseUA(s.ua); return html`<tr><td><b>${s.name || s.email}</b><br><small>${s.email}</small></td><td>${icon(DEV_ICON[d.device] || 'building', 16)} ${d.device}</td><td><small>${d.os} · ${d.browser}</small></td><td><small>${s.ip || '–'}</small></td><td><small>${istLong(s.created_at)}</small></td><td><small>${ago(s.last_seen)}</small></td><td class="r">${s.id === mine ? V.badge('this device', 'ok') : html`<form method="post" action="${A}/devices/revoke" class="inl" data-confirm="Sign this device out?">${csrf(req)}<input type="hidden" name="sid" value="${s.id}"><button class="a-btn a-btn--sm a-btn--danger">Sign out</button></form>`}</td></tr>`; })}</tbody></table></div></section>
      <section class="a-card flush"><div class="a-card__h"><h2>Sign-in history</h2><small class="a-muted">India time · last ${hist.length} events${all ? '' : ' of your account'} · kept for 180 days</small></div><div class="a-scroll"><table class="a-table"><thead><tr><th>When</th><th>Account</th><th>Result</th><th>Device</th><th>OS / browser</th><th>IP</th><th>Country</th></tr></thead><tbody>
      ${hist.map((h) => html`<tr class="${h.ok ? '' : 'off'}"><td><small>${istLong(h.ts)}</small></td><td><small>${h.email || '–'}</small></td><td>${h.ok ? V.badge('signed in', 'ok') : V.badge('failed', 'warn')} <small>${h.note || ''}</small></td><td>${icon(DEV_ICON[h.device] || 'building', 16)} ${h.device || ''}</td><td><small>${h.os || ''} · ${h.browser || ''}</small></td><td><small>${h.ip || '–'}</small></td><td><small>${h.country ? countryName(h.country) : '–'}</small></td></tr>`)}
      ${hist.length ? '' : html`<tr><td colspan="7" class="a-empty">No sign-ins recorded yet.</td></tr>`}</tbody></table></div></section>
      <section class="a-card"><h2>Keeping the admin safe</h2><ul class="a-ul"><li>Turn on two-factor login under <a href="${A}/account">My account</a>.</li><li>See a device you do not know? Press <b>Sign out</b>, then change the password.</li><li>Ten wrong passwords lock an account for an hour. Everything is also in the <a href="${A}/audit">Activity log</a>.</li></ul></section>` });
  }));

  router.post('/devices/revoke', needs('admin'), wrap((req, res) => {
    const sid = String(req.body.sid || '').slice(0, 80); const s = db.prepare('SELECT * FROM sessions WHERE id=?').get(sid);
    if (!s || sid === req.sess.id) return res.redirect(`${A}/devices?m=bad`);
    if (s.user_id !== req.user.id && !auth.can(req.user, 'superadmin')) return res.redirect(`${A}/devices?m=bad`);
    db.prepare('DELETE FROM sessions WHERE id=?').run(sid); audit.log(req, 'revoke_session', 'session', s.user_id); res.redirect(`${A}/devices?m=revoked`);
  }));
  router.post('/devices/revoke-others', needs('admin'), wrap((req, res) => {
    db.prepare('DELETE FROM sessions WHERE user_id=? AND id<>?').run(req.user.id, req.sess.id); audit.log(req, 'revoke_sessions', 'user', req.user.id); res.redirect(`${A}/devices?m=revoked_all`);
  }));

  // ═════════════════════════════════════════ Integrations (what is connected, what is still to do)
  Object.assign(FLASH, { sb_ok: ['ok', 'Supabase: done.'], sb_off: ['err', 'Supabase is not configured on this server (set SUPABASE_URL and SUPABASE_SERVICE_KEY, then restart).'], sb_bad: ['err', 'Supabase did not accept that. See the message in the Supabase box.'], sb_confirm: ['err', 'Tick the box to confirm first - this action overwrites data.'] });
  let sbNote = null;   // last test / push / pull result, shown once
  router.get('/integrations', needs('admin'), wrap(async (req, res) => {
    const S = settings.all(); const drive = require('../drive'); const sb = require('../supabase'); const st = sb.status(); const mailer = require('../mailer');
    const rows = [];
    const add = (state, label, detail, href, hrefLabel) => rows.push({ state, label, detail, href, hrefLabel });
    const dbMode = require('../db').isReplica ? 'Turso cloud database (durable on Vercel)' : sb.enabled ? 'Local SQLite + Supabase copy' : 'Local SQLite file' + (cfg.IS_VERCEL ? ' (temporary on Vercel!)' : '');
    add(cfg.IS_VERCEL && !require('../db').isReplica && !sb.enabled ? 'fail' : 'ok', 'Where your text data lives', dbMode + (cfg.IS_VERCEL && !require('../db').isReplica && !sb.enabled ? ' - on Vercel every change is lost on restart. Connect Supabase or Turso.' : ''));
    add(sb.enabled ? (st.lastError && Date.now() - st.lastErrorAt < 600000 ? 'warn' : 'ok') : 'todo', 'Supabase database copy', sb.enabled ? `Connected to ${st.host}. Version ${st.version}${st.dirty ? ' - unsaved changes waiting' : ''}.${st.lastError ? ' Last problem: ' + st.lastError : ''}` : 'Not connected yet. Add SUPABASE_URL and SUPABASE_SERVICE_KEY (see docs/INTEGRATIONS.md, step 2).');
    add(mailer.emailjsConfigured(S) ? 'ok' : 'todo', 'E-mail for enquiries (EmailJS)', mailer.emailjsConfigured(S) ? `New enquiries are e-mailed to ${S.notify_email}. Press “Send test e-mail” to check.` : 'Fill in the destination e-mail and the three EmailJS IDs.', `${A}/settings/forms`, 'Open settings');
    add(drive.enabled() ? 'ok' : 'todo', 'Google Drive uploads', drive.enabled() ? 'Uploads can go straight to your Drive folder.' : 'Optional. Without it you can still paste public Drive links in the Media library.', `${A}/settings/media`, 'Open settings');
    add(S.drive_folder_url ? 'ok' : 'todo', 'Google Drive media folder link', S.drive_folder_url ? 'Saved.' : 'Paste the folder link (shared as “Anyone with the link: Viewer”).', `${A}/settings/media`, 'Open settings');
    add(cfg.UPLOADS_WRITABLE ? 'ok' : 'warn', 'Saving files on this website', cfg.UPLOADS_WRITABLE ? 'This host can store uploaded files in the assets folder.' : 'This host cannot store files (Vercel). New uploads go to Google Drive; pictures committed to GitHub in public/assets still work.');
    add(S.hero_video || S.hero_poster ? 'ok' : 'todo', 'Home page background video / picture', S.hero_video || S.hero_poster ? 'Set.' : 'The home page shows text only until you add a video or picture.', `${A}/settings/content`, 'Open settings');
    add(S.google_verification ? 'ok' : 'todo', 'Google Search Console', S.google_verification ? 'Verification code saved - now submit /sitemap.xml in Search Console.' : 'Add the verification code, then submit the sitemap.', `${A}/settings/seo`, 'Open settings');
    add(S.google_business_url ? 'ok' : 'todo', 'Google Business Profile', S.google_business_url ? 'Linked.' : 'Create your free profile and paste its link - the biggest factor for “Madurai” searches.', `${A}/settings/seo`, 'Open settings');
    add(S.ga4_id || S.gtm_id || S.clarity_id ? 'ok' : 'todo', 'Extra analytics (GA4 / Tag Manager / Clarity)', S.ga4_id || S.gtm_id || S.clarity_id ? 'Connected - they only load after the visitor accepts cookies.' : 'Optional. The built-in statistics already work.', `${A}/settings/seo`, 'Open settings');
    add(cfg.HTTPS ? 'ok' : 'warn', 'Real website address (domain + https)', cfg.HTTPS ? cfg.SITE_URL : `SITE_URL is ${cfg.SITE_URL}. Set the real https address before going live.`);
    const flash = sbNote; sbNote = null;
    const dot = { ok: '✓', warn: '!', fail: '✕', todo: '○' }; const cls = { ok: 'ok', warn: 'warn', fail: 'fail', todo: 'warn' };
    page(req, res, { title: 'Integrations', wide: true,
      body: html`<p class="a-note">Everything the website can connect to. <b>○ = still to do</b>, ✓ = connected. The full step-by-step guide is in <code>docs/INTEGRATIONS.md</code> (GitHub → Vercel → Supabase).</p>
      <ul class="seo-list">${rows.map((r) => html`<li class="seo-chk seo-${cls[r.state]}"><span class="seo-dot">${dot[r.state]}</span><div><b>${r.label}</b>${r.detail ? html`<small>${r.detail}</small>` : ''}</div>${r.href ? html`<a class="a-btn a-btn--sm" href="${r.href}">${r.hrefLabel || 'Open'}</a>` : ''}</li>`)}</ul>
      ${sb.enabled ? html`<section class="a-card"><h2>Supabase copy</h2>
        ${flash ? html`<div class="a-alert ${flash.ok ? 'ok' : 'err'}" role="status">${flash.msg}</div>` : ''}
        <p class="a-muted">Saved ${st.pushes} time(s) and loaded ${st.pulls} time(s) since this server started. Visitor statistics are not copied (see docs/INTEGRATIONS.md).</p>
        <div class="a-row-actions">
          <form method="post" action="${A}/integrations/supabase/test" class="inl">${csrf(req)}<button class="a-btn" type="submit">Test connection</button></form>
          <form method="post" action="${A}/integrations/supabase/push" class="inl">${csrf(req)}<label class="a-check"><input type="checkbox" name="confirm" value="yes" required> I understand this overwrites the copy in Supabase</label> <button class="a-btn" type="submit">Save this site to Supabase now</button></form>
          <form method="post" action="${A}/integrations/supabase/pull" class="inl">${csrf(req)}<label class="a-check"><input type="checkbox" name="confirm" value="yes" required> I understand this replaces this site’s data (you may be signed out)</label> <button class="a-btn a-btn--danger" type="submit">Load Supabase copy into this site</button></form>
        </div></section>` : ''}` });
  }));
  const sbAction = (fn) => wrap(async (req, res) => {
    const sb = require('../supabase');
    if (!sb.enabled) return res.redirect(`${A}/integrations?m=sb_off`);
    if (fn !== 'test' && req.body.confirm !== 'yes') return res.redirect(`${A}/integrations?m=sb_confirm`);
    try {
      if (fn === 'test') { const r = await sb.check(); sbNote = r.ok ? { ok: true, msg: `Connected. Supabase version: ${r.remote ? r.remote.version : 'empty (nothing saved yet)'} · this server: ${r.local}.` } : { ok: false, msg: r.error }; }
      else if (fn === 'push') { const r = await sb.forcePush(); sbNote = { ok: true, msg: r.skipped ? 'Already up to date.' : `Saved to Supabase (${Math.round((r.bytes || 0) / 1024)} KB).` }; audit.log(req, 'supabase-push', 'integrations'); }
      else { const v = await sb.forcePull(); sbNote = { ok: true, msg: `Loaded the Supabase copy (version ${v}).` }; audit.log(req, 'supabase-pull', 'integrations'); }
    } catch (e) { sbNote = { ok: false, msg: e.message }; }
    res.redirect(`${A}/integrations`);
  });
  router.post('/integrations/supabase/test', needs('admin'), sbAction('test'));
  router.post('/integrations/supabase/push', needs('superadmin'), sbAction('push'));
  router.post('/integrations/supabase/pull', needs('superadmin'), sbAction('pull'));

  // ═════════════════════════════════════════ SEO Centre
  const checkRow = (st, label, detail, href) => html`<li class="seo-chk seo-${st}"><span class="seo-dot">${st === 'ok' ? '✓' : st === 'warn' ? '!' : '✕'}</span><div><b>${label}</b>${detail ? html`<br><small class="a-muted">${detail}</small>` : ''}</div>${href ? html`<a class="a-btn a-btn--sm a-btn--ghost" href="${href}">Fix</a>` : ''}</li>`;

  function siteChecks() {
    const S = settings.all(); const out = []; const add = (st, label, detail, href) => out.push({ st, label, detail, href });
    add(cfg.HTTPS ? 'ok' : 'fail', 'Website address uses https://', cfg.HTTPS ? cfg.SITE_URL : `SITE_URL is ${cfg.SITE_URL}. Set SITE_URL=https://your-domain in the environment variables when you go live.`, null);
    add(S.noindex_site === '1' ? 'fail' : 'ok', 'Search engines may index the site', S.noindex_site === '1' ? '“Hide whole site” is ON – Google will not list you. Turn it off before launch.' : 'robots.txt and sitemap.xml are generated automatically.', S.noindex_site === '1' ? `${A}/settings/seo` : null);
    add(S.google_verification ? 'ok' : 'warn', 'Google Search Console connected', S.google_verification ? 'Verification code saved.' : 'Add the verification code, then submit /sitemap.xml in Search Console.', `${A}/settings/seo`);
    add(S.google_business_url ? 'ok' : 'warn', 'Google Business Profile linked', S.google_business_url ? '' : 'The single biggest factor for “Madurai” searches. Claim your free profile at business.google.com, then paste its link here.', `${A}/settings/seo`);
    const same = String(S.same_as || '').split(/\r?\n/).filter((l) => /^https?:\/\//i.test(l.trim())).length;
    add(same >= 2 ? 'ok' : 'warn', 'Other official profiles listed', `${same} found. Add IndiaMART, Justdial, LinkedIn, Facebook, YouTube – these help Google trust that the business is real.`, `${A}/settings/seo`);
    const dl = String(S.seo_description || '').length;
    add(dl >= 110 && dl <= 165 ? 'ok' : 'warn', 'Home page description length', `${dl} characters (aim for 110–160).`, `${A}/settings/seo`);
    add(S.logo ? 'ok' : 'warn', 'Logo uploaded', S.logo ? '' : 'Upload it in Settings → Business & Branding (it is also used in Google’s knowledge panel).', `${A}/settings/general`);
    add(S.og_image ? 'ok' : 'warn', 'Default share image (WhatsApp / Facebook previews)', S.og_image ? '' : 'Upload a 1200×630 picture.', `${A}/settings/general`);
    add(S.favicon ? 'ok' : 'warn', 'Favicon uploaded', '', `${A}/settings/general`);
    add(S.phone1 && S.address1 && S.city ? 'ok' : 'fail', 'Phone and address filled in (used for local-business markup)', '', `${A}/settings/contact`);
    add(S.enable_ta === '1' ? 'ok' : 'warn', 'Tamil version switched on (hreflang is added automatically)', 'Many local buyers search in Tamil.', `${A}/settings/lang`);
    add(S.analytics_on === '1' ? 'ok' : 'warn', 'Visitor statistics on', '', `${A}/settings/privacy`);
    return out;
  }

  const DEFAULT_PHRASES = 'best pvc pipe manufacturer\ntamil nadu best pvc pipe company\nmadurai best company\nbest manufacturing company\nmadurai pvc pipes\nbest quality pvc products\npvc pipe manufacturer in india';
  function phraseChecks() {
    const phrases = String(settings.get('seo_target_keywords') || DEFAULT_PHRASES).split(/\r?\n/).map((x) => x.trim().toLowerCase()).filter(Boolean).slice(0, 30);
    const rows = db.prepare('SELECT * FROM seo_pages').all();
    return phrases.map((p) => {
      const pw = p.split(/\s+/);
      const m = rows.find((r) => String(r.keyword || '').trim().toLowerCase() === p) || rows.find((r) => { const t = `${r.keyword} ${r.title}`.toLowerCase(); return pw.every((w) => t.includes(w)); });
      if (!m) return { phrase: p, page: null };
      const text = `${m.title || ''} ${m.seo_title || ''}`.toLowerCase(); let faq = []; try { faq = JSON.parse(m.faq || '[]'); } catch { /* none */ }
      return { phrase: p, page: m, live: !!m.active && !m.noindex, wc: words(m.intro) + words(m.body) + words(m.faq), faq: faq.length, titleOk: pw.every((w) => text.includes(w)), descOk: String(m.seo_desc || '').length >= 70 };
    });
  }

  function contentAudit() {
    const keys = ['products', 'categories', 'seo_pages', 'pages', 'areas', 'posts'].filter((k) => MODELS[k]);
    const issues = []; const titles = new Map(); const rowsByKey = {};
    for (const k of keys) {
      const m = MODELS[k]; const has = (f) => m.fields.some((x) => x.k === f);
      const rows = db.prepare(`SELECT * FROM "${k}" WHERE active=1 ${k === 'posts' ? "AND status='published'" : ''} LIMIT 500`).all(); rowsByKey[k] = rows;
      for (const r of rows) { const t = `${k}|${String(r.seo_title || r[m.title] || '').trim().toLowerCase()}`; titles.set(t, (titles.get(t) || 0) + 1); }
      for (const r of rows) {
        const name = r[m.title]; const p = []; const t = String(r.seo_title || r[m.title] || '');
        if (r.noindex) continue;
        if (has('seo_desc')) { const own = String(r.seo_desc || ''); const fb = own || String(r.summary || r.excerpt || ''); const dl = fb.length; if (!dl && k !== 'areas' && k !== 'pages') p.push('No meta description'); else if (dl && (dl < 70 || dl > 165)) p.push(own ? `Description is ${dl} characters (aim for 70–160)` : `Description is taken from the summary (${dl} characters) – write a custom one (70–160)`); }
        if (t.length > 62) p.push(`Title is ${t.length} characters – Google may cut it`);
        if (titles.get(`${k}|${t.trim().toLowerCase()}`) > 1) p.push('Same title as another page');
        const img = has('image') ? r.image : has('cover') ? r.cover : 'n/a'; if (!img) p.push('No image');
        if (k === 'seo_pages' && words(r.intro) + words(r.body) + words(r.faq) < 200) p.push('Thin content (under 200 words) – add real details, photos, examples');
        if (k === 'seo_pages' && !r.keyword) p.push('No target phrase set');
        if (p.length) issues.push({ key: k, id: r.id, name, label: m.singular, problems: p });
      }
    }
    return { issues, counts: Object.fromEntries(keys.map((k) => [k, rowsByKey[k].length])) };
  }

  router.get('/seo', needs('editor'), wrap((req, res) => {
    const site = siteChecks(); const phr = phraseChecks(); const aud = contentAudit();
    const phrScore = phr.reduce((a, p) => a + (p.page ? 1 + (p.live ? 1 : 0) + (p.wc >= 200 ? 1 : 0) + (p.faq >= 3 ? 1 : 0) + (p.titleOk ? 1 : 0) : 0), 0);
    const max = site.length + phr.length * 5; const got = site.filter((c) => c.st === 'ok').length + phrScore;
    const score = max ? Math.round((got / max) * 100) : 0; const url = (p) => `https://www.google.com/search?q=${encodeURIComponent(p)}&gl=in&hl=en`;
    const tool = (href, label, hint) => html`<a class="a-tool" href="${href}" target="_blank" rel="noopener noreferrer"><b>${label}</b><small>${hint}</small>${icon('external', 14)}</a>`;
    const site_ = cfg.SITE_URL;
    page(req, res, { title: 'SEO Centre', wide: true,
      actions: html`<a class="a-btn" href="${A}/c/seo_pages/new">${icon('sparkle', 16)} New landing page</a>`,
      body: html`
      <div class="a-kpis"><div class="a-kpi"><span class="a-kpi__i">${icon('search', 22)}</span><div><b>${score}%</b><span>SEO health</span><small>${got} of ${max} checks passed</small></div></div>
        <div class="a-kpi"><span class="a-kpi__i">${icon('file', 22)}</span><div><b>${aud.counts.seo_pages || 0}</b><span>Landing pages</span><small>one for each search phrase</small></div></div>
        <div class="a-kpi"><span class="a-kpi__i">${icon('alert', 22)}</span><div><b>${aud.issues.length}</b><span>Pages to improve</span><small>see the list below</small></div></div>
        <div class="a-kpi"><span class="a-kpi__i">${icon('globe', 22)}</span><div><b>${(aud.counts.products || 0) + (aud.counts.categories || 0) + (aud.counts.seo_pages || 0) + (aud.counts.pages || 0) + (aud.counts.areas || 0) + (aud.counts.posts || 0)}</b><span>Pages in sitemap</span><small><a href="/sitemap.xml" target="_blank" rel="noopener">open sitemap.xml</a></small></div></div></div>
      <div class="a-alert info"><b>An honest note.</b> Nobody – no plugin, no agency – can promise the #1 place on Google. What this panel does is make sure every phrase you care about has its own helpful page, that the technical basics are right, and that Google can find, read and trust the site. Real rankings then depend on content quality, your Google Business Profile, reviews, links from other websites and time (usually 2–6 months for a new site).</div>
      <section class="a-card flush"><div class="a-card__h"><h2>Target search phrases</h2><small class="a-muted">Edit the list in <a href="${A}/settings/seo">Settings → SEO &amp; Analytics</a></small></div><div class="a-scroll"><table class="a-table"><thead><tr><th>Phrase</th><th>Landing page</th><th>Live</th><th class="r">Words</th><th class="r">FAQs</th><th>Title match</th><th class="r"></th></tr></thead><tbody>
      ${phr.map((p) => html`<tr><td><b>${p.phrase}</b></td>${p.page ? html`<td><a href="${A}/c/seo_pages/${p.page.id}">${p.page.title}</a><br><small class="a-muted">/${p.page.slug}</small></td><td>${p.live ? V.badge('yes', 'ok') : V.badge('hidden', 'warn')}</td><td class="r">${p.wc}${p.wc < 200 ? html` ${V.badge('thin', 'warn')}` : ''}</td><td class="r">${p.faq}</td><td>${p.titleOk ? V.badge('ok', 'ok') : V.badge('check', 'warn')}</td>` : html`<td colspan="5"><span class="a-muted">No page yet</span> <a class="a-btn a-btn--sm" href="${A}/c/seo_pages/new">Create</a></td>`}<td class="r"><a class="a-btn a-btn--sm a-btn--ghost" href="${url(p.phrase)}" target="_blank" rel="noopener noreferrer">Search on Google</a></td></tr>`)}
      ${phr.length ? '' : html`<tr><td colspan="7" class="a-empty">Add phrases in Settings → SEO &amp; Analytics.</td></tr>`}</tbody></table></div></section>
      <div class="a-cols"><section class="a-card"><h2>Technical &amp; business checks</h2><ul class="seo-list">${site.map((c) => checkRow(c.st, c.label, c.detail, c.href))}</ul></section>
      <section class="a-card"><h2>Free tools (open in a new tab)</h2><div class="a-tools">
        ${tool('https://search.google.com/search-console', 'Google Search Console', 'Submit the sitemap, see real search phrases')}${tool('https://business.google.com', 'Google Business Profile', 'Free listing for Maps and “near me”')}
        ${tool(`https://pagespeed.web.dev/analysis?url=${encodeURIComponent(site_)}`, 'PageSpeed Insights', 'Speed score for phone and desktop')}${tool(`https://search.google.com/test/rich-results?url=${encodeURIComponent(site_)}`, 'Rich Results Test', 'Checks FAQ / business markup')}
        ${tool('https://www.bing.com/webmasters', 'Bing Webmaster Tools', 'Also feeds Yahoo and DuckDuckGo')}${tool(`https://validator.schema.org/#url=${encodeURIComponent(site_)}`, 'Schema validator', 'Structured-data check')}</div>
      <h2 style="margin-top:1.2rem">Check any page while you browse</h2><p>While you are signed in, open any public page – a small <b>SEO</b> button appears in the corner. It shows that page’s title, description, headings, images without alt text, links, structured data and a score, and links straight to the editor. Visitors never see it.</p>
      <p>You can also use browser add-ins such as <i>Detailed SEO Extension</i>, <i>SEOquake</i> or Lighthouse (built into Chrome) on the public site – the pages are plain, standards-based HTML, so they work with all of them. WordPress-style SEO plugins are not needed: titles, descriptions, share images, canonical links, hreflang, sitemap, robots.txt and structured data are built in.</p></section></div>
      <section class="a-card flush"><div class="a-card__h"><h2>Pages that can be improved</h2><small class="a-muted">${aud.issues.length} found</small></div><div class="a-scroll"><table class="a-table"><thead><tr><th>Type</th><th>Page</th><th>What to fix</th><th class="r"></th></tr></thead><tbody>
      ${aud.issues.slice(0, 80).map((i) => html`<tr><td><small>${i.label}</small></td><td><b>${i.name}</b></td><td><ul class="a-ul tight">${i.problems.map((p) => html`<li>${p}</li>`)}</ul></td><td class="r"><a class="a-btn a-btn--sm" href="${A}/c/${i.key}/${i.id}">Edit</a></td></tr>`)}
      ${aud.issues.length ? '' : html`<tr><td colspan="4" class="a-empty">Nothing to fix – nice work.</td></tr>`}</tbody></table></div></section>` });
  }));
};
