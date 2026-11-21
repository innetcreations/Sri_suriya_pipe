'use strict';
// Per-request rendering context for the public site: language, settings, theme, navigation, URL helpers.
const cfg = require('./config');
const settings = require('./settings');
const themes = require('./themes');
const crud = require('./crud');
const cache = require('./cache');
const auth = require('./auth');
const { translate } = require('./i18n');
const { slugify } = require('./util');

const LOCALIZE_SKIP = /^\/(uploads|placeholder|images|css|js|fonts|api|admin|sitemap|robots|manifest|sw\.js|favicon|icons|theme)/;

// Strip a leading /ta from the URL so every route is written once; remember the language.
function langMiddleware(req, res, next) {
  const m = req.url.match(/^\/ta(\/|\?|$)/);
  req.lang = 'en';
  if (m && settings.bool('enable_ta')) {
    req.lang = 'ta';
    req.url = req.url.replace(/^\/ta/, '') || '/';
    if (req.url[0] === '?') req.url = '/' + req.url;
  }
  next();
}

function build(req, res) {
  if (req._ctx) return req._ctx;
  const lang = req.lang || 'en';
  const S = settings.all();
  const previewOk = !!req.user;
  const { theme, event, source } = themes.resolve(req, previewOk ? { previewTheme: req.query.preview_theme, previewEvent: req.query.preview_event } : {});
  const v = cache.version();
  const prefix = lang === 'ta' ? '/ta' : '';
  const u = (p) => {
    if (!p || /^(https?:|mailto:|tel:|#|\/\/)/i.test(p) || LOCALIZE_SKIP.test(p)) return p;
    if (p[0] !== '/') return p;
    return p === '/' ? (prefix || '/') : prefix + p;
  };
  const urlPath = (req.path || '/').replace(/\/+$/, '') || '/';
  const ctx = {
    req, res, lang, prefix, S, theme, event, themeSource: source, v, u, t: (k) => translate(k, lang),
    tr: (row, f) => crud.tr(row, f, lang), path: urlPath, preview: previewOk && (req.query.preview_theme || req.query.preview_event),
    siteUrl: cfg.SITE_URL, abs: (p) => cfg.SITE_URL + (p || ''), taOn: S.enable_ta === '1',
    isCurrent: (url) => { const p = String(url || '').split('?')[0].replace(/\/+$/, '') || '/'; return p === urlPath || (p !== '/' && urlPath.startsWith(p + '/')); },
    phoneHref: (p) => 'tel:+' + String(p || '').replace(/[^\d]/g, '').replace(/^0+(?=\d{10})/, '91'),
    waLink: (text) => `https://wa.me/${String(S.whatsapp || '').replace(/\D/g, '')}${text ? '?text=' + encodeURIComponent(text) : ''}`,
    address: () => [S.address1, S.address2, S.city + (S.pincode ? ' - ' + S.pincode : ''), S.state].filter(Boolean),
    altPath: (to) => {
      const base = (req.originalUrl || '/').replace(/^\/ta(?=\/|\?|$)/, '') || '/';
      const p = to === 'ta' ? '/ta' + (base === '/' ? '' : base) : base;
      return p || '/';
    },
    loggedAdmin: !!req.user,
  };
  ctx.nav = (loc) => crud.active('nav_items').filter((n) => n.location === loc || n.location === 'both');
  req._ctx = ctx;
  return ctx;
}

// Dismissible announcement(s) currently inside their date window.
function announcements(ctx) {
  const now = new Date().toISOString().slice(0, 16);
  return crud.active('announcements').filter((a) => (!a.start_at || a.start_at <= now) && (!a.end_at || a.end_at >= now));
}

const themeCssUrl = (ctx) => `/theme/${encodeURIComponent(ctx.theme.slug)}.css?v=${ctx.v}`;
const visitorThemes = () => themes.all().filter((t) => t.visitor && t.kind !== 'event');
const clientTheme = (ctx) => {
  const vars = themes.complete(ctx.theme);
  return {
    slug: ctx.theme.slug, name: ctx.theme.name, dark: !!ctx.theme.dark, soundPack: ctx.theme.sound_pack,
    colors: { primary: vars.primary, secondary: vars.secondary, accent: vars.accent, bg: vars.bg, pipes: ctx.theme.pipes },
    particles: ctx.theme.particles || {}, event: ctx.event ? slugify(ctx.event.name) : null,
  };
};
module.exports = { langMiddleware, build, announcements, themeCssUrl, visitorThemes, clientTheme, auth };
