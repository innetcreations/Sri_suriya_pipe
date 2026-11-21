'use strict';
const db = require('./db');
const cache = require('./cache');
const settings = require('./settings');
const crud = require('./crud');
const { parseJSON, nowISO, slugify, clean } = require('./util');

// ───────────────────────── colour helpers
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
function rgb(hex) {
  let h = String(hex || '#000').replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const toHex = (c) => '#' + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => { const x = rgb(a); const y = rgb(b); return toHex(x.map((v, i) => v + (y[i] - v) * t)); };
const lum = (hex) => { const [r, g, b] = rgb(hex).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
// Pick whichever of white / near-black text has the higher WCAG contrast ratio against the colour.
const contrastOn = (hex) => {
  const L = lum(hex);
  const white = 1.05 / (L + 0.05);
  const dark = (L + 0.05) / (lum('#0b1220') + 0.05);
  return white >= dark ? '#ffffff' : '#0b1220';
};

const ratio = (a, b) => { const x = lum(a); const y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
// Soft grey helper text that is still easy to read: moves the colour toward the main text colour until it reaches WCAG AA (4.5:1) on every background.
function readableMuted(text, bgs, dark) {
  let t = dark ? 0.35 : 0.42; let c = mix(text, bgs[0], t);
  while (t > 0 && bgs.some((b) => ratio(c, b) < 4.6)) { t = Math.max(0, t - 0.03); c = mix(text, bgs[0], t); }
  return c;
}

const FONTS = {
  outfit: '"Outfit","Noto Sans Tamil",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif',
  inter: '"Inter","Noto Sans Tamil",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif',
  playfair: '"Playfair Display","Noto Sans Tamil",Georgia,"Times New Roman",serif',
  serif: 'Georgia,"Noto Sans Tamil","Times New Roman",serif',
  system: 'system-ui,-apple-system,"Segoe UI","Noto Sans Tamil",Roboto,sans-serif',
  mono: 'ui-monospace,SFMono-Regular,Menlo,Consolas,"Noto Sans Tamil",monospace',
};
const SHADOWS = {
  soft: '0 1px 2px rgba(var(--text-rgb),.06), 0 10px 30px -12px rgba(var(--text-rgb),.18)',
  crisp: '0 2px 0 rgba(var(--text-rgb),.10), 0 8px 18px -10px rgba(var(--text-rgb),.28)',
  none: 'none',
  glow: '0 0 0 1px rgba(var(--primary-rgb),.25), 0 10px 40px -10px rgba(var(--primary-rgb),.45)',
};
const PARTICLES = ['none', 'bubbles', 'rain', 'snow', 'confetti', 'sparks', 'fireworks', 'leaves', 'petals', 'hearts', 'bats', 'stars', 'diyas', 'tricolor'];
const SOUND_PACKS = ['water', 'soft', 'classic', 'neon', 'festive', 'spooky', 'fireworks', 'patriotic'];
const COLOR_KEYS = ['bg', 'bg-alt', 'surface', 'surface-2', 'text', 'text-muted', 'primary', 'primary-contrast', 'secondary', 'accent', 'border', 'success', 'warning', 'danger', 'hero-from', 'hero-to'];

// Fill any missing variables with sensible derived values so a theme only needs a handful of colours.
function complete(theme) {
  const v = { ...(theme.vars || {}) };
  const dark = !!theme.dark;
  v.bg = v.bg || (dark ? '#0f1419' : '#ffffff');
  v.text = v.text || (dark ? '#e8ecf2' : '#0f1d33');
  v.surface = v.surface || (dark ? mix(v.bg, '#ffffff', 0.05) : '#ffffff');
  v['bg-alt'] = v['bg-alt'] || (dark ? mix(v.bg, '#ffffff', 0.03) : mix(v.bg, v.text, 0.04));
  v['surface-2'] = v['surface-2'] || v['bg-alt'];
  v.primary = v.primary || '#0b5ed7';
  v.secondary = v.secondary || (dark ? mix(v.bg, '#000000', 0.4) : '#0a2540');
  v.accent = v.accent || '#00a896';
  v['primary-contrast'] = v['primary-contrast'] || contrastOn(v.primary);
  v['text-muted'] = v['text-muted'] || readableMuted(v.text, [v.bg, v['bg-alt'], v.surface, v['surface-2']], dark);
  v.border = v.border || mix(v.bg, v.text, dark ? 0.16 : 0.12);
  v.success = v.success || (dark ? '#34d399' : '#16a34a');
  v.warning = v.warning || (dark ? '#fbbf24' : '#d97706');
  v.danger = v.danger || (dark ? '#f87171' : '#dc2626');
  v['hero-from'] = v['hero-from'] || (dark ? mix(v.bg, v.primary, 0.14) : mix(v.bg, v.primary, 0.07));
  v['hero-to'] = v['hero-to'] || (dark ? v.bg : mix(v.bg, v.accent, 0.1));
  v.radius = Number.isFinite(+v.radius) ? Math.max(0, Math.min(32, +v.radius)) : 14;
  v.shadow = SHADOWS[v.shadow] ? v.shadow : 'soft';
  v['font-heading'] = FONTS[v['font-heading']] ? v['font-heading'] : 'outfit';
  v['font-body'] = FONTS[v['font-body']] ? v['font-body'] : 'inter';
  v.anim = Math.max(0.4, Math.min(2.5, Number.isFinite(+v.anim) ? +v.anim : 1));
  return v;
}

function cssFor(theme) {
  const v = complete(theme);
  const lines = [];
  for (const k of COLOR_KEYS) lines.push(`--${k}:${v[k]}`);
  for (const k of ['primary', 'surface', 'bg', 'text', 'secondary', 'accent']) lines.push(`--${k}-rgb:${rgb(v[k]).join(',')}`);
  lines.push(`--radius:${v.radius}px`, `--radius-sm:${Math.max(2, Math.round(v.radius * 0.6))}px`, `--radius-lg:${Math.round(v.radius * 1.6)}px`);
  lines.push(`--shadow:${SHADOWS[v.shadow]}`, `--font-heading:${FONTS[v['font-heading']]}`, `--font-body:${FONTS[v['font-body']]}`, `--anim:${v.anim}`);
  lines.push(`--glass:rgba(${rgb(v.surface).join(',')},${theme.dark ? 0.6 : 0.72})`, `--glass-border:rgba(${rgb(v.text).join(',')},${theme.dark ? 0.14 : 0.08})`);
  const custom = String(theme.custom_css || '').replace(/</g, '').replace(/@import[^;]*;?/gi, '').replace(/javascript:/gi, '').slice(0, 20000);
  return `:root{color-scheme:${theme.dark ? 'dark' : 'light'};${lines.join(';')}}\n${custom}\n`;
}

// ───────────────────────── built-in themes
const D = { vars: {}, particles: { preset: 'none', density: 1 }, sound: 'water', pipes: ['#1e88e5', '#ffffff', '#9e9e9e', '#f5f0e1'] };
const T = (slug, name, kind, dark, vars, preset, density, sound, extra = {}) => ({ slug, name, kind, dark: dark ? 1 : 0, vars, particles: { preset, density }, sound_pack: sound, pipes: extra.pipes || D.pipes, visitor: kind === 'event' ? 0 : 1 });
const BUILTIN = [
  T('professional', 'Professional (default)', 'builtin', 0, { bg: '#ffffff', 'bg-alt': '#f3f6fb', surface: '#ffffff', text: '#0f1d33', primary: '#0b5ed7', secondary: '#0a2540', accent: '#00a896', radius: 14, shadow: 'soft', 'font-heading': 'outfit', 'font-body': 'inter' }, 'bubbles', 0.5, 'soft'),
  T('classic', 'Classic', 'builtin', 0, { bg: '#fbf7ee', 'bg-alt': '#f3ebd7', surface: '#fffdf7', text: '#2b2118', primary: '#8a1c2b', secondary: '#3b2a1a', accent: '#b8892b', radius: 6, shadow: 'crisp', 'font-heading': 'playfair', 'font-body': 'inter' }, 'none', 1, 'classic', { pipes: ['#8a1c2b', '#f5f0e1', '#b8892b', '#3b2a1a'] }),
  T('aqua-flow', 'Aqua Flow', 'builtin', 0, { bg: '#f2fbff', 'bg-alt': '#e3f5fc', surface: '#ffffff', text: '#0b2a3a', primary: '#0891b2', secondary: '#0c4a6e', accent: '#22d3ee', radius: 20, shadow: 'glow', 'font-heading': 'outfit' }, 'bubbles', 1, 'water', { pipes: ['#0891b2', '#ffffff', '#22d3ee', '#cfeefa'] }),
  T('dark-industrial', 'Dark Industrial', 'builtin', 1, { bg: '#12151a', 'bg-alt': '#181c23', surface: '#1e232c', text: '#e8ecf2', primary: '#ff7a1a', secondary: '#0b0d11', accent: '#ffd166', radius: 6, shadow: 'crisp', 'font-heading': 'outfit' }, 'sparks', 0.7, 'neon', { pipes: ['#ff7a1a', '#cfd6e0', '#5b6472', '#ffd166'] }),
  T('midnight-neon', 'Midnight Neon', 'builtin', 1, { bg: '#0b1020', 'bg-alt': '#10172b', surface: '#151d36', text: '#e6ebff', primary: '#7c5cff', secondary: '#070a16', accent: '#00e5ff', radius: 18, shadow: 'glow', 'font-heading': 'outfit' }, 'stars', 1, 'neon', { pipes: ['#7c5cff', '#00e5ff', '#e6ebff', '#3b2fb5'] }),
  T('forest-agri', 'Forest & Agriculture', 'builtin', 0, { bg: '#f6faf4', 'bg-alt': '#e8f3e4', surface: '#ffffff', text: '#10281a', primary: '#2e7d32', secondary: '#1b4332', accent: '#f9a825', radius: 16, shadow: 'soft', 'font-heading': 'outfit' }, 'leaves', 0.8, 'soft', { pipes: ['#2e7d32', '#ffffff', '#8bc34a', '#f5f0e1'] }),
  T('sunrise', 'Sunrise', 'builtin', 0, { bg: '#fffaf3', 'bg-alt': '#fff0dd', surface: '#ffffff', text: '#3a1d0b', primary: '#f97316', secondary: '#7c2d12', accent: '#facc15', radius: 18, shadow: 'soft', 'font-heading': 'outfit' }, 'bubbles', 0.5, 'soft', { pipes: ['#f97316', '#ffffff', '#facc15', '#7c2d12'] }),
  T('royal', 'Royal', 'builtin', 0, { bg: '#faf8ff', 'bg-alt': '#efeaff', surface: '#ffffff', text: '#1d1033', primary: '#5b21b6', secondary: '#2e1065', accent: '#d4a017', radius: 12, shadow: 'soft', 'font-heading': 'playfair' }, 'stars', 0.4, 'classic', { pipes: ['#5b21b6', '#ffffff', '#d4a017', '#2e1065'] }),
  T('minimal-mono', 'Minimal Mono', 'builtin', 0, { bg: '#ffffff', 'bg-alt': '#f5f5f5', surface: '#ffffff', text: '#111111', primary: '#111111', secondary: '#1f1f1f', accent: '#e11d48', radius: 4, shadow: 'none', 'font-heading': 'inter' }, 'none', 1, 'soft', { pipes: ['#111111', '#ffffff', '#9e9e9e', '#e11d48'] }),
  T('ocean-deep', 'Ocean Deep', 'builtin', 1, { bg: '#06182b', 'bg-alt': '#0a2238', surface: '#0d2b46', text: '#e5f3ff', primary: '#38bdf8', secondary: '#031321', accent: '#2dd4bf', radius: 18, shadow: 'glow', 'font-heading': 'outfit' }, 'bubbles', 1, 'water', { pipes: ['#38bdf8', '#e5f3ff', '#2dd4bf', '#0d2b46'] }),
  T('earth-terra', 'Earth & Terracotta', 'builtin', 0, { bg: '#faf6f1', 'bg-alt': '#f1e8dc', surface: '#ffffff', text: '#2d1c12', primary: '#a0522d', secondary: '#4a2c1a', accent: '#6b8e23', radius: 10, shadow: 'soft', 'font-heading': 'playfair' }, 'leaves', 0.5, 'classic', { pipes: ['#a0522d', '#f5f0e1', '#6b8e23', '#4a2c1a'] }),
  T('slate-steel', 'Slate & Steel', 'builtin', 0, { bg: '#f1f3f6', 'bg-alt': '#e5e9ef', surface: '#ffffff', text: '#102a43', primary: '#334e68', secondary: '#102a43', accent: '#ef8e00', radius: 8, shadow: 'crisp', 'font-heading': 'outfit' }, 'none', 1, 'soft', { pipes: ['#334e68', '#ffffff', '#9fb3c8', '#ef8e00'] }),
  T('high-contrast', 'High Contrast (accessible)', 'builtin', 1, { bg: '#000000', 'bg-alt': '#0a0a0a', surface: '#111111', text: '#ffffff', 'text-muted': '#d0d0d0', border: '#ffffff', primary: '#ffd400', secondary: '#000000', accent: '#00e5ff', radius: 4, shadow: 'none', anim: 0.6, 'font-heading': 'inter' }, 'none', 1, 'soft', { pipes: ['#ffd400', '#ffffff', '#00e5ff', '#888888'] }),
  T('crimson-business', 'Crimson Business', 'builtin', 0, { bg: '#ffffff', 'bg-alt': '#fbf2f3', surface: '#ffffff', text: '#1d0f12', primary: '#c1121f', secondary: '#3a0b10', accent: '#f59e0b', radius: 10, shadow: 'soft', 'font-heading': 'outfit' }, 'none', 1, 'soft', { pipes: ['#c1121f', '#ffffff', '#f59e0b', '#3a0b10'] }),
  // ── festival / event themes (selected automatically by Admin → Events)
  T('new-year', 'New Year', 'event', 1, { bg: '#0a0a14', 'bg-alt': '#12121f', surface: '#181828', text: '#f8f3e2', primary: '#f5c542', secondary: '#05050c', accent: '#ff4d8d', radius: 16, shadow: 'glow', 'font-heading': 'outfit' }, 'fireworks', 1, 'fireworks', { pipes: ['#f5c542', '#f8f3e2', '#ff4d8d', '#4cc9f0'] }),
  T('christmas', 'Christmas', 'event', 0, { bg: '#fffafa', 'bg-alt': '#fdecec', surface: '#ffffff', text: '#1b2a22', primary: '#c62828', secondary: '#14532d', accent: '#f9a825', radius: 16, shadow: 'soft', 'font-heading': 'outfit' }, 'snow', 1.2, 'festive', { pipes: ['#c62828', '#ffffff', '#14532d', '#f9a825'] }),
  T('halloween', 'Halloween', 'event', 1, { bg: '#14091f', 'bg-alt': '#1c0e2c', surface: '#241338', text: '#f3e9ff', primary: '#ff7a00', secondary: '#0d0518', accent: '#8b5cf6', radius: 14, shadow: 'glow', 'font-heading': 'outfit' }, 'bats', 1, 'spooky', { pipes: ['#ff7a00', '#f3e9ff', '#8b5cf6', '#241338'] }),
  T('diwali', 'Diwali / Deepavali', 'event', 0, { bg: '#fff8ec', 'bg-alt': '#ffedc8', surface: '#fffdf7', text: '#3b1306', primary: '#d9480f', secondary: '#7a1f0b', accent: '#f5b301', radius: 16, shadow: 'soft', 'font-heading': 'outfit' }, 'diyas', 1, 'festive', { pipes: ['#d9480f', '#fff8ec', '#f5b301', '#7a1f0b'] }),
  T('pongal', 'Pongal', 'event', 0, { bg: '#fffbea', 'bg-alt': '#fff3c4', surface: '#ffffff', text: '#2d3a12', primary: '#e08a00', secondary: '#2f6b1f', accent: '#2f9e44', radius: 16, shadow: 'soft', 'font-heading': 'outfit' }, 'petals', 1, 'festive', { pipes: ['#e08a00', '#ffffff', '#2f9e44', '#f2c200'] }),
  T('puthandu', 'Tamil New Year (Puthandu)', 'event', 0, { bg: '#fffdf0', 'bg-alt': '#fff5cf', surface: '#ffffff', text: '#243a12', primary: '#3f8f2a', secondary: '#6b4400', accent: '#f4b400', radius: 16, shadow: 'soft', 'font-heading': 'outfit' }, 'petals', 0.8, 'festive', { pipes: ['#3f8f2a', '#ffffff', '#f4b400', '#6b4400'] }),
  T('tricolor', 'Republic / Independence Day', 'event', 0, { bg: '#ffffff', 'bg-alt': '#f4f8f1', surface: '#ffffff', text: '#10263f', primary: '#ff9933', 'primary-contrast': '#10263f', secondary: '#0b3d91', accent: '#138808', radius: 14, shadow: 'soft', 'font-heading': 'outfit' }, 'tricolor', 1, 'patriotic', { pipes: ['#ff9933', '#ffffff', '#138808', '#0b3d91'] }),
  T('valentines', "Valentine's Day", 'event', 0, { bg: '#fff5f7', 'bg-alt': '#ffe3ea', surface: '#ffffff', text: '#3b0d1a', primary: '#e11d48', secondary: '#881337', accent: '#f472b6', radius: 20, shadow: 'soft', 'font-heading': 'outfit' }, 'hearts', 1, 'soft', { pipes: ['#e11d48', '#ffffff', '#f472b6', '#881337'] }),
  T('holi', 'Holi', 'event', 0, { bg: '#ffffff', 'bg-alt': '#fdf2ff', surface: '#ffffff', text: '#2a1033', primary: '#d946ef', secondary: '#4c1d95', accent: '#f59e0b', radius: 18, shadow: 'soft', 'font-heading': 'outfit' }, 'confetti', 1.2, 'festive', { pipes: ['#d946ef', '#22c55e', '#f59e0b', '#38bdf8'] }),
];

// Seed festival calendar. Fixed-date festivals repeat yearly (MM-DD). Movable festivals have explicit dates:
// ALWAYS verify them in Admin → Events each year.
const EVENTS = [
  ['New Year', 'new-year', '12-28', '01-02', 5, 'Happy New Year from Sri Suriya Polymers!', 'புத்தாண்டு நல்வாழ்த்துக்கள் - ஸ்ரீ சூர்யா பாலிமர்ஸ்!'],
  ['Pongal', 'pongal', '01-12', '01-17', 6, 'Happy Pongal! Pongalo Pongal!', 'இனிய பொங்கல் நல்வாழ்த்துக்கள்!'],
  ['Republic Day', 'tricolor', '01-24', '01-26', 5, 'Happy Republic Day!', 'இனிய குடியரசு தின நல்வாழ்த்துக்கள்!'],
  ['Tamil New Year', 'puthandu', '04-13', '04-15', 6, 'Happy Tamil New Year!', 'இனிய தமிழ் புத்தாண்டு நல்வாழ்த்துக்கள்!'],
  ['Independence Day', 'tricolor', '08-13', '08-15', 5, 'Happy Independence Day!', 'இனிய சுதந்திர தின நல்வாழ்த்துக்கள்!'],
  ['Halloween', 'halloween', '10-28', '10-31', 4, 'Happy Halloween!', ''],
  ['Diwali 2027 (verify date)', 'diwali', '2027-10-26', '2027-10-30', 8, 'Wishing you a bright and prosperous Deepavali!', 'இனிய தீபாவளி நல்வாழ்த்துக்கள்!'],
  ['Christmas', 'christmas', '12-20', '12-27', 4, 'Merry Christmas!', 'கிறிஸ்துமஸ் நல்வாழ்த்துக்கள்!'],
];

function seedThemes() {
  const ins = db.prepare('INSERT OR IGNORE INTO themes(slug,name,kind,dark,vars,particles,sound_pack,pipes,custom_css,visitor,sort,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)');
  db.transaction(() => BUILTIN.forEach((t, i) => ins.run(t.slug, t.name, t.kind, t.dark, JSON.stringify(t.vars), JSON.stringify(t.particles), t.sound_pack, JSON.stringify(t.pipes), '', t.visitor, i, nowISO())))();
  if (db.prepare('SELECT COUNT(*) n FROM events').get().n === 0) {
    const ev = db.prepare('INSERT INTO events(sort,active,i18n,created_at,updated_at,name,theme_slug,start_date,end_date,priority,greeting) VALUES(?,?,?,?,?,?,?,?,?,?,?)');
    db.transaction(() => EVENTS.forEach((e, i) => ev.run(i + 1, 1, JSON.stringify(e[6] ? { ta: { greeting: e[6] } } : {}), nowISO(), nowISO(), e[0], e[1], e[2], e[3], e[4], e[5])))();
  }
  cache.bump();
}

// ───────────────────────── lookups
const rowToTheme = (r) => r && ({ ...r, vars: parseJSON(r.vars, {}), particles: parseJSON(r.particles, {}), pipes: parseJSON(r.pipes, []) });
const all = () => cache.memo('themes:all', 120000, () => db.prepare('SELECT * FROM themes ORDER BY sort, name').all().map(rowToTheme));
const bySlug = (slug) => all().find((t) => t.slug === slug) || null;

// Date check supporting MM-DD (yearly, may wrap over new year) and YYYY-MM-DD (one-off).
function inRange(today, start, end) {
  const yearly = start.length === 5;
  if (!yearly) return today >= start && today <= end;
  const md = today.slice(5);
  return start <= end ? md >= start && md <= end : md >= start || md <= end;
}
const TZ = process.env.SITE_TZ || 'Asia/Kolkata';
const todayLocal = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ });
function activeEvent(day = todayLocal()) {
  const list = crud.active('events').filter((e) => e.start_date && e.end_date && inRange(day, e.start_date, e.end_date) && bySlug(e.theme_slug));
  list.sort((a, b) => (b.priority || 0) - (a.priority || 0) || a.id - b.id);
  return list[0] || null;
}

// Decide which theme to render for this request. Returns { theme, event, source }.
function resolve(req, { previewTheme, previewEvent } = {}) {
  const S = settings.all();
  if (previewTheme && bySlug(previewTheme)) return { theme: bySlug(previewTheme), event: null, source: 'preview' };
  if (previewEvent) { const ev = crud.active('events').find((e) => String(e.id) === String(previewEvent) || e.theme_slug === previewEvent); if (ev && bySlug(ev.theme_slug)) return { theme: bySlug(ev.theme_slug), event: ev, source: 'preview' }; }
  const ev = S.theme_mode === 'events' ? activeEvent() : null;
  if (S.allow_visitor_theme === '1' && req && req.cookies && req.cookies.ssp_theme) {
    const t = bySlug(String(req.cookies.ssp_theme).slice(0, 60));
    if (t && t.visitor && t.kind !== 'event') return { theme: t, event: ev, source: 'visitor' };
  }
  if (ev) return { theme: bySlug(ev.theme_slug), event: ev, source: 'event' };
  return { theme: bySlug(S.active_theme) || bySlug('professional') || all()[0], event: null, source: 'default' };
}

// ───────────────────────── editor save (Admin → Themes)
function sanitizeVars(input) {
  const v = {};
  for (const k of COLOR_KEYS) { const x = String(input[`v_${k}`] || '').trim(); if (HEX.test(x)) v[k] = x; }
  v.radius = Math.max(0, Math.min(32, parseInt(input.v_radius, 10) || 14));
  v.shadow = SHADOWS[input.v_shadow] ? input.v_shadow : 'soft';
  v['font-heading'] = FONTS[input['v_font-heading']] ? input['v_font-heading'] : 'outfit';
  v['font-body'] = FONTS[input['v_font-body']] ? input['v_font-body'] : 'inter';
  v.anim = Math.max(0.4, Math.min(2.5, parseFloat(input.v_anim) || 1));
  return v;
}
function save(input, existing) {
  const name = clean(input.name, 60);
  if (!name) return { error: 'Name is required' };
  const vars = sanitizeVars(input);
  const preset = PARTICLES.includes(input.p_preset) ? input.p_preset : 'none';
  const density = Math.max(0, Math.min(3, parseFloat(input.p_density) || 1));
  const pipes = [1, 2, 3, 4].map((i) => String(input[`pipe_${i}`] || '').trim()).filter((c) => HEX.test(c));
  const row = {
    name, dark: input.dark === '1' || input.dark === 'on' ? 1 : 0, vars: JSON.stringify(vars), particles: JSON.stringify({ preset, density }),
    sound_pack: SOUND_PACKS.includes(input.sound_pack) ? input.sound_pack : 'water', pipes: JSON.stringify(pipes.length ? pipes : D.pipes),
    custom_css: String(input.custom_css || '').replace(/</g, '').replace(/@import[^;]*;?/gi, '').replace(/javascript:/gi, '').slice(0, 20000),
    visitor: input.visitor === '1' || input.visitor === 'on' ? 1 : 0,
  };
  if (existing) {
    db.prepare('UPDATE themes SET name=?,dark=?,vars=?,particles=?,sound_pack=?,pipes=?,custom_css=?,visitor=?,updated_at=? WHERE id=?')
      .run(row.name, row.dark, row.vars, row.particles, row.sound_pack, row.pipes, row.custom_css, existing.kind === 'event' ? 0 : row.visitor, nowISO(), existing.id);
    cache.bump(); return { slug: existing.slug };
  }
  let slug = slugify(input.slug || name) || 'theme'; let n = 2; const base = slug;
  while (db.prepare('SELECT 1 FROM themes WHERE slug=?').get(slug)) slug = `${base}-${n++}`;
  db.prepare('INSERT INTO themes(slug,name,kind,dark,vars,particles,sound_pack,pipes,custom_css,visitor,sort,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(slug, row.name, 'custom', row.dark, row.vars, row.particles, row.sound_pack, row.pipes, row.custom_css, row.visitor, 100, nowISO());
  cache.bump(); return { slug };
}
function duplicate(slug) {
  const t = bySlug(slug); if (!t) return null;
  let s = `${slug}-copy`; let n = 2; while (db.prepare('SELECT 1 FROM themes WHERE slug=?').get(s)) s = `${slug}-copy-${n++}`;
  db.prepare('INSERT INTO themes(slug,name,kind,dark,vars,particles,sound_pack,pipes,custom_css,visitor,sort,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(s, `${t.name} (copy)`, 'custom', t.dark, JSON.stringify(t.vars), JSON.stringify(t.particles), t.sound_pack, JSON.stringify(t.pipes), t.custom_css, 1, 100, nowISO());
  cache.bump(); return s;
}
function remove(slug) {
  const t = bySlug(slug); if (!t || t.kind !== 'custom') return false;
  db.prepare('DELETE FROM themes WHERE slug=?').run(slug);
  if (settings.get('active_theme') === slug) settings.setOne('active_theme', 'professional');
  cache.bump(); return true;
}
// Reset a built-in theme back to factory values.
function reset(slug) {
  const t = BUILTIN.find((b) => b.slug === slug); if (!t) return false;
  db.prepare('UPDATE themes SET name=?,dark=?,vars=?,particles=?,sound_pack=?,pipes=?,custom_css=?,updated_at=? WHERE slug=?')
    .run(t.name, t.dark, JSON.stringify(t.vars), JSON.stringify(t.particles), t.sound_pack, JSON.stringify(t.pipes), '', nowISO(), slug);
  cache.bump(); return true;
}

// Import a custom theme object from a backup file (re-validated, never trusted).
function importCustom(o) {
  if (!o || typeof o !== 'object') return null;
  const input = { name: o.name, dark: o.dark ? '1' : '', sound_pack: o.sound_pack, p_preset: (o.particles || {}).preset, p_density: (o.particles || {}).density, custom_css: o.custom_css, visitor: o.visitor ? '1' : '' };
  for (const [k, v] of Object.entries(o.vars || {})) input[`v_${k}`] = v;
  (Array.isArray(o.pipes) ? o.pipes : []).slice(0, 4).forEach((c, i) => { input[`pipe_${i + 1}`] = c; });
  const r = save(input, null); return r.slug || null;
}

module.exports = { importCustom, all, bySlug, resolve, activeEvent, cssFor, complete, save, duplicate, remove, reset, seedThemes, FONTS, SHADOWS, PARTICLES, SOUND_PACKS, COLOR_KEYS, BUILTIN, inRange, todayLocal, HEX };
