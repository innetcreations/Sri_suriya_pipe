'use strict';
const { html, raw, esc, icon, brandMark, jsonScript, img } = require('../render');
const C = require('../ctx');
const crud = require('../crud');
const { clientStrings } = require('../i18n');
const { clean } = require('../util');

const trunc = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…'; };
const SOCIALS = [['facebook', 'facebook'], ['instagram', 'instagram'], ['youtube', 'youtube'], ['linkedin', 'linkedin'], ['x_twitter', 'twitter'], ['indiamart', 'link'], ['justdial', 'link']];
const FLAGS = (S) => ({
  scene3d: S.fx_3d === '1', particles: S.fx_particles === '1', sound: S.fx_sound === '1', cursor: S.fx_cursor === '1', transitions: S.fx_transitions === '1', loader: S.fx_loader === '1',
  quality: S.fx_quality || 'auto', soundDefaultOn: S.sound_default_on === '1', soundVolume: parseFloat(S.sound_volume) || 0.45,
  intensity: Math.max(0.3, Math.min(2, parseFloat(S.fx_intensity) || 1)),
});

function localBusinessSchema(ctx) {
  const S = ctx.S;
  const same = [...SOCIALS.map(([k]) => S[k]), S.google_business_url, ...String(S.same_as || '').split(/\r?\n/)].map((u) => String(u || '').trim()).filter((u) => /^https:\/\/[^\s"'<>]+$/.test(u));
  const o = {
    '@context': 'https://schema.org', '@type': ['LocalBusiness', 'Store'], '@id': ctx.abs('/#business'), name: S.site_name, url: ctx.abs('/'), description: S.seo_description,
    image: S.og_image ? ctx.abs(S.og_image) : undefined, logo: S.logo ? ctx.abs(S.logo) : undefined, telephone: S.phone1, email: S.email || undefined,
    foundingDate: S.established || undefined, founder: S.proprietor ? { '@type': 'Person', name: S.proprietor } : undefined,
    address: { '@type': 'PostalAddress', streetAddress: [S.address1, S.address2].filter(Boolean).join(', '), addressLocality: S.city, postalCode: S.pincode, addressRegion: S.state, addressCountry: 'IN' },
    geo: S.lat && S.lng ? { '@type': 'GeoCoordinates', latitude: Number(S.lat), longitude: Number(S.lng) } : undefined, openingHours: S.hours_schema || undefined,
    areaServed: { '@type': 'State', name: S.state }, sameAs: same.length ? same : undefined, hasMap: S.map_link || undefined, paymentAccepted: 'Cash, Cheque, Demand Draft, Bank Transfer', priceRange: '₹₹',
  };
  return JSON.parse(JSON.stringify(o));
}
const websiteSchema = (ctx) => ({ '@context': 'https://schema.org', '@type': 'WebSite', url: ctx.abs('/'), name: ctx.S.site_name, inLanguage: ctx.lang === 'ta' ? 'ta-IN' : 'en-IN', potentialAction: { '@type': 'SearchAction', target: ctx.abs('/search?q={search_term_string}'), 'query-input': 'required name=search_term_string' } });

function head(ctx, page) {
  const S = ctx.S;
  const baseTitle = page.title ? clean(page.title, 110) : S.site_name;
  const title = page.rawTitle ? baseTitle : (page.title ? baseTitle + (S.seo_suffix || '') : `${S.site_name} – ${S.tagline}`);
  const desc = trunc(page.desc || S.seo_description, 170);
  const canonicalPath = page.canonical || ctx.path;
  const canon = ctx.abs(ctx.u(canonicalPath === '/' ? '/' : canonicalPath));
  const okImg = (u) => /^\/(uploads|assets|images)\//.test(u || '') || /^https:\/\/(lh\d\.googleusercontent\.com|drive\.google\.com)\//.test(u || '');
  const pick = okImg(page.image) ? page.image : (okImg(S.og_image) ? S.og_image : '/images/og-default.svg');
  const image = /^https:/.test(pick) ? pick : ctx.abs(pick);
  const noindex = page.noindex || S.noindex_site === '1' || ctx.preview;
  const enHref = ctx.abs(ctx.altPath('en') === '/' ? '/' : ctx.altPath('en').split('?')[0]);
  const taHref = ctx.abs(ctx.altPath('ta').split('?')[0]);
  const fav = S.favicon || '/images/favicon.svg';
  const schemas = [...(page.schema || [])];
  if (page.home) schemas.unshift(localBusinessSchema(ctx), websiteSchema(ctx));
  return html`<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${title}</title><meta name="description" content="${desc}">${S.seo_keywords && page.home ? html`<meta name="keywords" content="${S.seo_keywords}">` : ''}
<meta name="robots" content="${noindex ? 'noindex,nofollow' : 'index,follow,max-image-preview:large,max-snippet:-1'}"><link rel="canonical" href="${canon}">
${ctx.taOn && !page.noAlternates ? html`<link rel="alternate" hreflang="en-IN" href="${enHref}"><link rel="alternate" hreflang="ta-IN" href="${taHref}"><link rel="alternate" hreflang="x-default" href="${enHref}">` : ''}
<meta property="og:type" content="${page.ogType || 'website'}"><meta property="og:site_name" content="${S.site_name}"><meta property="og:title" content="${trunc(title, 95)}"><meta property="og:description" content="${desc}"><meta property="og:url" content="${canon}"><meta property="og:image" content="${image}"><meta property="og:locale" content="${ctx.lang === 'ta' ? 'ta_IN' : 'en_IN'}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${trunc(title, 70)}"><meta name="twitter:description" content="${desc}"><meta name="twitter:image" content="${image}">
${S.google_verification ? html`<meta name="google-site-verification" content="${S.google_verification}">` : ''}${S.bing_verification ? html`<meta name="msvalidate.01" content="${S.bing_verification}">` : ''}
<meta name="theme-color" content="${require('../themes').complete(ctx.theme).primary}"><meta name="color-scheme" content="${ctx.theme.dark ? 'dark light' : 'light dark'}"><link rel="manifest" href="/manifest.webmanifest">
<link rel="icon" href="${fav}"${/\.svg$/.test(fav) ? ' type="image/svg+xml"' : ''}><link rel="apple-touch-icon" href="${S.pwa_icon || S.favicon || '/images/favicon.svg'}">
<link rel="preload" href="/fonts/inter-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin><link rel="preload" href="/fonts/outfit-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/css/fonts.css"><link rel="stylesheet" href="/css/app.css?v=${ctx.v}"><link rel="stylesheet" href="/css/fx.css?v=${ctx.v}"><link rel="stylesheet" href="${C.themeCssUrl(ctx)}">
${schemas.map((s) => html`<script type="application/ld+json">${raw(jsonScript(s))}</script>`)}${page.extraHead || ''}`;
}

function brand(ctx, dark = false) {
  const S = ctx.S; const logo = dark && S.logo_dark ? S.logo_dark : S.logo;
  return html`<a class="brand" href="${ctx.u('/')}" aria-label="${S.site_name} – ${ctx.t('nav_home')}">${logo ? img(logo, S.site_name, { w: 180, h: 46, lazy: false }) : brandMark(40)}<span>${S.brand_short}<small>${S.city}</small></span></a>`;
}

function header(ctx) {
  const S = ctx.S; const themes = C.visitorThemes();
  const items = ctx.nav('header');
  const swatch = (t) => { const v = require('../themes').complete(t); return `--c1:${v.primary};--c2:${v.bg}`; };
  return html`<header class="site-header" id="top"><div class="container">
    ${brand(ctx)}
    <nav class="nav" id="nav" aria-label="Main"><button class="icon-btn nav-close" type="button" data-nav-close aria-label="${ctx.t('close')}">${icon('x', 20)}</button>
      <ul>${items.map((n) => html`<li><a href="${ctx.u(n.url)}"${ctx.isCurrent(ctx.u(n.url).replace(/^\/ta(?=\/|$)/, '') || '/') && (n.url !== '/' || ctx.path === '/') ? ' aria-current="page"' : ''}${n.new_tab ? ' target="_blank" rel="noopener"' : ''}>${ctx.tr(n, 'label')}</a></li>`)}</ul></nav>
    <div class="header-actions">
      <button class="icon-btn" type="button" data-search-open aria-label="${ctx.t('search')}">${icon('search', 18)}</button>
      ${S.allow_visitor_theme === '1' && themes.length ? html`<div class="pop-wrap hide-m"><button class="icon-btn" type="button" aria-haspopup="true" aria-expanded="false" data-pop="theme-pop" aria-label="${ctx.t('theme')}">${icon('palette', 18)}</button>
        <div class="popover" id="theme-pop" hidden><p class="pop-title">${ctx.t('themes_title')}</p><ul class="theme-list">
        <li><button type="button" data-theme="" aria-pressed="${ctx.themeSource !== 'visitor'}"><span class="swatch" style="--c1:var(--primary);--c2:var(--accent)"></span>${ctx.t('theme_auto')}</button></li>
        ${themes.map((t) => html`<li><button type="button" data-theme="${t.slug}" aria-pressed="${ctx.themeSource === 'visitor' && ctx.theme.slug === t.slug}"><span class="swatch" style="${swatch(t)}"></span>${t.name}</button></li>`)}</ul></div></div>` : ''}
      ${ctx.taOn ? html`<a class="icon-btn hide-m" href="${ctx.lang === 'ta' ? ctx.altPath('en') : ctx.altPath('ta')}" hreflang="${ctx.lang === 'ta' ? 'en' : 'ta'}" lang="${ctx.lang === 'ta' ? 'en' : 'ta'}" aria-label="${ctx.t('language')}" style="font:700 .78rem var(--font-heading);text-decoration:none" data-sound="none" data-lang-switch>${ctx.lang === 'ta' ? 'EN' : 'த'}</a>` : ''}
      ${S.fx_sound === '1' ? html`<button class="icon-btn hide-m" id="sound-toggle" type="button" aria-pressed="false" aria-label="${ctx.t('sound')}"><span class="i-off">${icon('mute', 18)}</span><span class="i-on">${icon('volume', 18)}</span></button>` : ''}
      <button class="icon-btn" type="button" data-basket-open aria-label="${ctx.t('basket_title')}">${icon('file', 18)}<span class="count" data-basket-count hidden>0</span></button>
      <a class="btn btn-sm hide-m" href="${ctx.u('/quote')}" data-magnetic>${ctx.t('get_quote')}</a>
      <button class="icon-btn menu-btn" type="button" data-nav-open aria-controls="nav" aria-expanded="false" aria-label="${ctx.t('menu')}">${icon('menu', 20)}</button>
    </div></div></header>`;
}

function footer(ctx) {
  const S = ctx.S; const cats = crud.active('categories', { limit: 8 }); const foot = ctx.nav('footer'); const pages = crud.active('pages', { where: 'in_footer=1' }); const lands = crud.active('seo_pages', { where: 'in_footer=1 AND noindex=0', limit: 8 });
  const socials = SOCIALS.filter(([k]) => /^https?:/.test(S[k] || ''));
  return html`<footer class="site-footer"><div class="container"><div class="footer-grid">
    <div>${brand(ctx, true)}<p>${S.tagline}</p><p class="muted" style="color:rgba(255,255,255,.6)">${ctx.t('established')} ${S.established} · ${S.business_type}</p>
      ${socials.length ? html`<div class="social" aria-label="${ctx.t('follow_us')}">${socials.map(([k, ic]) => html`<a href="${S[k]}" target="_blank" rel="noopener noreferrer" aria-label="${k}">${icon(ic, 18)}</a>`)}</div>` : ''}</div>
    <div><h3>${ctx.t('quick_links')}</h3><ul>${foot.map((n) => html`<li><a href="${ctx.u(n.url)}">${ctx.tr(n, 'label')}</a></li>`)}${pages.map((p) => html`<li><a href="${ctx.u('/' + p.slug)}">${ctx.tr(p, 'title')}</a></li>`)}</ul></div>
    <div><h3>${ctx.t('our_products')}</h3><ul>${cats.map((c) => html`<li><a href="${ctx.u('/products/category/' + c.slug)}">${ctx.tr(c, 'name')}</a></li>`)}</ul></div>
    ${lands.length ? html`<div><h3>${ctx.t('popular_searches')}</h3><ul>${lands.map((l) => html`<li><a href="${ctx.u('/' + l.slug)}">${ctx.tr(l, 'title')}</a></li>`)}</ul></div>` : ''}
    <div><h3>${ctx.t('contact_us')}</h3><ul class="footer-contact">
      <li>${icon('pin', 18)}<span>${ctx.address().join(', ')}</span></li>
      <li>${icon('phone', 18)}<span><a href="${ctx.phoneHref(S.phone1)}">${S.phone1}</a>${S.phone2 ? html`<br><a href="${ctx.phoneHref(S.phone2)}">${S.phone2}</a>` : ''}${S.office_phone ? html`<br><a href="${ctx.phoneHref(S.office_phone)}">${S.office_phone}</a> <small>(Office)</small>` : ''}</span></li>
      ${S.email ? html`<li>${icon('mail', 18)}<a href="mailto:${S.email}">${S.email}</a></li>` : ''}${S.hours ? html`<li>${icon('clock', 18)}<span>${S.hours}</span></li>` : ''}</ul></div>
  </div><div class="footer-bottom"><span>© ${new Date().getFullYear()} ${S.site_name}. ${ctx.t('rights')}</span><span>${S.payment_note}${S.footer_credit ? html` · ${S.footer_credit_url ? html`<a href="${S.footer_credit_url}" target="_blank" rel="noopener">${S.footer_credit}</a>` : S.footer_credit}` : ''}</span></div></div></footer>`;
}

function widgets(ctx) {
  const S = ctx.S; const lang = ctx.lang;
  return html`
  <div class="scrim" data-scrim></div>
  <aside class="drawer" id="basket" aria-label="${ctx.t('basket_title')}" aria-hidden="true"><header><h2>${ctx.t('basket_title')}</h2><button class="icon-btn" type="button" data-basket-close aria-label="${ctx.t('close')}">${icon('x', 18)}</button></header>
    <div class="items" data-basket-items><p class="muted">${ctx.t('basket_empty')}</p></div>
    <footer><button class="btn btn-ghost btn-sm" type="button" data-basket-clear>${ctx.t('basket_clear')}</button><a class="btn" href="${ctx.u('/quote')}" data-basket-send>${ctx.t('basket_send')} ${icon('arrow', 16)}</a></footer></aside>
  <div class="lightbox" id="lightbox" role="dialog" aria-modal="true" aria-label="Image viewer"><button class="icon-btn" type="button" data-lb-close aria-label="${ctx.t('close')}">${icon('x', 20)}</button><img alt=""><p></p></div>
  ${S.whatsapp ? html`<a class="wa-fab" href="${ctx.waLink('Hello, I would like to enquire about PVC pipes.')}" target="_blank" rel="noopener noreferrer" aria-label="${ctx.t('whatsapp_us')}">${icon('whatsapp', 28)}</a>` : ''}
  ${S.chat_enabled === '1' ? html`<button class="chat-fab" type="button" data-chat-open aria-label="${ctx.t('chat_open')}" aria-expanded="false">${icon('chat', 26)}</button>
  <section class="chat" id="chat" role="dialog" aria-label="${S.chat_name}"><header><span>${S.chat_name}</span><button type="button" data-chat-close aria-label="${ctx.t('close')}">${icon('x', 18)}</button></header>
    <div class="log" data-chat-log aria-live="polite"><div class="msg bot">${S.chat_greeting}</div></div><div class="sugg" data-chat-sugg></div>
    <form data-chat-form autocomplete="off"><input type="text" name="q" maxlength="200" placeholder="${ctx.t('chat_ph')}" aria-label="${ctx.t('chat_ph')}" required><button class="btn btn-sm" type="submit">${ctx.t('chat_send')}</button></form></section>` : ''}
  <button class="icon-btn to-top" type="button" data-to-top aria-label="Back to top">${icon('up', 18)}</button>
  <div class="toast" id="toast" role="status" aria-live="polite"></div>
  ${S.cookie_banner === '1' ? html`<div class="cookie" id="cookie-banner" role="dialog" aria-live="polite" aria-label="${ctx.t('cookie_title')}" hidden><p>${S.cookie_text} <a href="${ctx.u(S.cookie_policy_url || '/privacy-policy')}">${ctx.t('cookie_more')}</a></p><div class="cookie__btns"><button type="button" class="btn btn-ghost btn-sm" data-cookie="essential">${ctx.t('cookie_essential')}</button><button type="button" class="btn btn-sm" data-cookie="all">${ctx.t('cookie_accept')}</button></div></div>` : ''}
  <div class="lightbox" id="search-box" role="dialog" aria-modal="true" aria-label="${ctx.t('search')}" style="align-content:start;padding-top:12vh"><button class="icon-btn" type="button" data-search-close aria-label="${ctx.t('close')}">${icon('x', 20)}</button>
    <form action="${ctx.u('/search')}" method="get" role="search" style="width:min(640px,100%)"><input type="search" name="q" placeholder="${ctx.t('search_ph')}" aria-label="${ctx.t('search')}" maxlength="80" style="min-height:58px;font-size:1.1rem" autocomplete="off"></form></div>`;
}

function render(ctx, page) {
  const S = ctx.S; const fx = FLAGS(S); const lang = ctx.lang;
  const ann = C.announcements(ctx);
  const config = {
    lang, prefix: ctx.prefix, fx, theme: C.clientTheme(ctx), sounds: {}, strings: clientStrings(lang),
    contact: { phone: S.phone1, whatsapp: S.whatsapp }, ga4: /^G-[A-Z0-9]+$/i.test(S.ga4_id || '') ? S.ga4_id : '', gtm: /^GTM-[A-Z0-9]+$/i.test(S.gtm_id || '') ? S.gtm_id : '',
    clarity: /^[a-z0-9]{6,20}$/i.test(S.clarity_id || '') ? S.clarity_id : '', consent: S.cookie_banner === '1', turnstile: S.turnstile_site || '', chat: S.chat_enabled === '1', chatName: S.chat_name, v: ctx.v, page: page.page || '', calc: { len: parseFloat(S.pipe_length_m) || 6, waste: parseFloat(S.wastage_pct) || 5 },
  };
  const eventGreeting = ctx.event ? (ctx.tr(ctx.event, 'greeting') || '') : '';
  const body = html`<!doctype html><html lang="${lang === 'ta' ? 'ta' : 'en'}" class="no-js" data-fx-loader="${fx.loader ? 1 : 0}" data-dark="${ctx.theme.dark ? 1 : 0}"><head>${head(ctx, page)}<script src="/js/boot.js"></script></head>
<body class="fx-on" data-page="${page.page || ''}">
<a class="skip" href="#main">${ctx.t('skip')}</a>
${fx.loader ? html`<div id="fx-loader" class="fx-loader" aria-hidden="true"><div class="fx-loader__pipe"><i></i></div><p class="fx-loader__name">${S.brand_short}</p></div>` : ''}
${fx.particles ? html`<canvas id="fx-particles" aria-hidden="true"></canvas>` : ''}
${ctx.preview ? html`<div class="event-banner">Preview mode – theme “${ctx.theme.name}”. Visitors do not see this. <a href="${ctx.path}" style="color:inherit;text-decoration:underline">Exit preview</a></div>` : ''}
${eventGreeting ? html`<div class="event-banner" role="status">${eventGreeting}</div>` : ''}
${ann.length ? html`<div class="announce" data-announce="${ann[0].id}"><div class="container"><span>${ctx.tr(ann[0], 'text')}</span>${ann[0].link ? html`<a href="${ctx.u(ann[0].link)}">${ctx.tr(ann[0], 'link_label') || ctx.t('read_more')} →</a>` : ''}</div>${ann[0].dismissible ? html`<button type="button" data-announce-close aria-label="${ctx.t('close')}">${icon('x', 16)}</button>` : ''}</div>` : ''}
<div class="topbar"><div class="container"><div class="row"><a href="${ctx.phoneHref(S.phone1)}">${icon('phone', 14)}${S.phone1}</a>${S.email ? html`<a href="mailto:${S.email}" class="hide-m">${icon('mail', 14)}${S.email}</a>` : ''}</div><div class="row hide-m"><span>${icon('pin', 14)}${S.city}, ${S.state}</span>${S.hours ? html`<span>${icon('clock', 14)}${S.hours}</span>` : ''}</div></div></div>
${header(ctx)}
<main id="main" tabindex="-1">${page.body}</main>
${footer(ctx)}${widgets(ctx)}
<script type="application/json" id="app-config">${raw(jsonScript(config))}</script>
${ctx.loggedAdmin ? html`<script src="/js/seo-inspector.js?v=${ctx.v}" data-admin="${require('../config').ADMIN_PATH}" defer></script>` : ''}<script src="/js/app.js?v=${ctx.v}" defer></script><script type="module" src="/js/fx/index.js?v=${ctx.v}"></script>
</body></html>`;
  return body.toString();
}
module.exports = { render, trunc, FLAGS, localBusinessSchema };
