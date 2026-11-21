'use strict';
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cfg = require('./config');
const settings = require('./settings');
const cache = require('./cache');
const { rand, hmac, safeEq } = require('./util');

// ───────────────────────── response headers
const baseHeaders = helmet({
  contentSecurityPolicy: false, // built per-request below (depends on analytics/captcha settings)
  hsts: cfg.HTTPS ? { maxAge: 31536000, includeSubDomains: true, preload: false } : false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  crossOriginResourcePolicy: { policy: 'same-site' },
  crossOriginEmbedderPolicy: false,
  xFrameOptions: { action: 'deny' },
});
const PERMISSIONS = 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), magnetometer=(), gyroscope=(), accelerometer=()';

function buildCsp() {
  const S = settings.all();
  const ga = /^G-[A-Z0-9]+$/i.test(S.ga4_id || ''); const gtm = /^GTM-[A-Z0-9]+$/i.test(S.gtm_id || '');
  const ts = !!S.turnstile_site;
  const script = ["'self'"]; const connect = ["'self'"]; const frame = ['https://www.google.com/maps/', 'https://www.youtube-nocookie.com/', 'https://drive.google.com/'];
  if (ga || gtm) { script.push('https://www.googletagmanager.com'); connect.push('https://www.google-analytics.com', 'https://*.google-analytics.com', 'https://www.googletagmanager.com'); }
  if (/^[a-z0-9]{6,20}$/i.test(S.clarity_id || '')) { script.push('https://www.clarity.ms', 'https://scripts.clarity.ms'); connect.push('https://*.clarity.ms', 'https://c.bing.com'); }
  if (ts) { script.push('https://challenges.cloudflare.com'); frame.push('https://challenges.cloudflare.com'); }
  const d = [
    "default-src 'self'", "base-uri 'self'", "object-src 'none'", "frame-ancestors 'none'", "form-action 'self'",
    `script-src ${script.join(' ')}`, "style-src 'self'", "style-src-attr 'unsafe-inline'", "img-src 'self' data: blob: https:", "font-src 'self'",
    "media-src 'self' blob: https:", `connect-src ${connect.join(' ')}`, `frame-src ${frame.join(' ')}`, "worker-src 'self'", "manifest-src 'self'",
  ];
  if (cfg.HTTPS) d.push('upgrade-insecure-requests');
  return d.join('; ');
}
function securityHeaders(req, res, next) {
  baseHeaders(req, res, (err) => {
    if (err) return next(err);
    res.setHeader('Content-Security-Policy', cache.memo('csp', 300000, buildCsp));
    res.setHeader('Permissions-Policy', PERMISSIONS);
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    next();
  });
}

// Reject requests whose Host header is not one of ALLOWED_HOSTS (prevents host-header poisoning of canonical URLs/emails).
function hostCheck(req, res, next) {
  if (!cfg.ALLOWED_HOSTS.length) return next();
  const h = String(req.hostname || '').toLowerCase();
  if (cfg.ALLOWED_HOSTS.includes(h)) return next();
  return res.status(421).type('text').send('Misdirected request');
}

// Cross-site request protection for every state-changing request (in addition to CSRF tokens / form tokens).
function originCheck(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const host = req.get('host');
  const origin = req.get('origin');
  const fetchSite = req.get('sec-fetch-site');
  let ok;
  if (origin) { try { ok = new URL(origin).host === host; } catch { ok = false; } }
  else if (fetchSite) ok = fetchSite === 'same-origin' || fetchSite === 'none';
  else {
    const ref = req.get('referer');
    if (ref) { try { ok = new URL(ref).host === host; } catch { ok = false; } } else ok = true; // non-browser client: protected by tokens/session
  }
  if (!ok) return res.status(403).json({ error: 'Cross-site request blocked.' });
  next();
}
// API endpoints only accept JSON (a simple <form> from another site can never send application/json)
function requireJson(req, res, next) {
  if (!req.is('application/json')) return res.status(415).json({ error: 'Content-Type must be application/json' });
  next();
}

// ───────────────────────── rate limiting
const wantsJson = (req) => (req.originalUrl || '').startsWith('/api/') || /json/.test(req.get('accept') || '');
const handler = (msg) => (req, res) => {
  res.setHeader('Retry-After', '60');
  if (wantsJson(req)) return res.status(429).json({ error: msg });
  return res.status(429).type('html').send(`<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width"><title>Too many requests</title><body style="font-family:system-ui;padding:3rem;max-width:40rem;margin:auto"><h1>Slow down a little</h1><p>${msg}</p>`);
};
const mk = (windowMs, limit, msg = 'Too many requests. Please wait a moment and try again.', extra = {}) =>
  rateLimit({ windowMs, limit: Math.round(limit * cfg.RATE_LIMIT_MULTIPLIER), standardHeaders: 'draft-7', legacyHeaders: false, handler: handler(msg), validate: { xForwardedForHeader: false, trustProxy: false }, ...extra });
const limiters = {
  global: mk(60 * 1000, 400),
  api: mk(60 * 1000, 90),
  enquiry: mk(10 * 60 * 1000, 8, 'Too many enquiries from your network. Please call us directly.'),
  chat: mk(60 * 1000, 25),
  formToken: mk(60 * 1000, 40),
  beacon: mk(60 * 1000, 120),
  login: mk(15 * 60 * 1000, 12, 'Too many sign-in attempts. Try again in a few minutes.'),
  admin: mk(60 * 1000, 600),
  upload: mk(10 * 60 * 1000, 60, 'Too many uploads. Please wait.'),
  search: mk(60 * 1000, 40),
};

// ───────────────────────── scanner / probe blocker
const PROBES = /(\.(php\d?|asp|aspx|jsp|cgi|env|git|svn|bak|sql|ini|yml|yaml|log)(\/|$|\?))|(^|\/)\.(env|git|svn|htaccess|htpasswd|aws|ssh|DS_Store)|wp-(admin|login|content|includes|json)|phpmyadmin|xmlrpc|cgi-bin|vendor\/phpunit|actuator|etc\/passwd|\/\.\.|%2e%2e|%00|boaform|HNAP1|owa\/auth/i;
const strikes = new Map(); const banned = new Map();
function probeGuard(req, res, next) {
  const ip = req.ip; const now = Date.now();
  const until = banned.get(ip);
  if (until && until > now) return res.status(403).end();
  if (until) banned.delete(ip);
  if (PROBES.test(req.originalUrl)) {
    const s = (strikes.get(ip) || []).filter((t) => now - t < 600000); s.push(now); strikes.set(ip, s);
    if (s.length >= 6) { banned.set(ip, now + 1800000); console.warn(`[security] temporarily blocked ${ip} for scanning`); }
    return res.status(404).type('text').send('Not found');
  }
  next();
}
setInterval(() => { const now = Date.now(); for (const [k, v] of banned) if (v < now) banned.delete(k); for (const [k, v] of strikes) if (!v.some((t) => now - t < 600000)) strikes.delete(k); if (strikes.size > 5000) strikes.clear(); }, 300000).unref();

// ───────────────────────── anti-spam form token (works with cached HTML: fetched by JS right before submit)
function issueFormToken() { const ts = Date.now().toString(36); const r = rand(8); return `${ts}.${r}.${hmac(`form:${ts}.${r}`)}`; }
function checkFormToken(tok, { minAgeMs = 2500, maxAgeMs = 3 * 3600e3 } = {}) {
  const [ts, r, sig] = String(tok || '').split('.');
  if (!ts || !r || !sig || !safeEq(hmac(`form:${ts}.${r}`), sig)) return false;
  const age = Date.now() - parseInt(ts, 36);
  return age >= minAgeMs && age <= maxAgeMs;
}
// Cloudflare Turnstile (optional)
async function verifyTurnstile(token, ip) {
  const secret = settings.get('turnstile_secret');
  if (!secret || !settings.get('turnstile_site')) return true;
  if (!token) return false;
  try {
    const body = new URLSearchParams({ secret, response: String(token).slice(0, 2048), remoteip: ip || '' });
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body, signal: AbortSignal.timeout(5000) });
    const j = await r.json(); return !!j.success;
  } catch (e) { console.warn('[turnstile]', e.message); return true; /* fail open so a captcha outage never blocks real customers */ }
}

module.exports = { securityHeaders, hostCheck, originCheck, requireJson, limiters, probeGuard, issueFormToken, checkFormToken, verifyTurnstile, buildCsp };
