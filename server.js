'use strict';
/**
 * Sri Suriya Polymers – web application entry point.
 *   npm start            → one process
 *   npm run start:cluster → several worker processes (set WORKERS in .env)
 */
const path = require('path');
const cluster = require('cluster');
const express = require('express');
const compression = require('compression');
const cookieParser = require('cookie-parser');

const cfg = require('./src/config');
const db = require('./src/db');
const crud = require('./src/crud');
const seed = require('./src/seed');
const auth = require('./src/auth');
const sec = require('./src/security');
const analytics = require('./src/analytics');
const audit = require('./src/audit');
const C = require('./src/ctx');
const settings = require('./src/settings');
const supabase = require('./src/supabase');

// ───────────────────────── static file caching rules
const YEAR = 31536000;
function staticHeaders(res, file) {
  const q = (res.req && res.req.query) || {};
  if (/[\\/]fonts[\\/]/.test(file)) res.setHeader('Cache-Control', `public, max-age=${YEAR}, immutable`);
  else if (/[\\/](uploads|assets)[\\/]/.test(file)) res.setHeader('Cache-Control', 'public, max-age=2592000');
  else if (/sw\.js$|offline\.html$|manifest/.test(file)) res.setHeader('Cache-Control', 'no-cache');
  else if (q.v && /\.(css|js)$/.test(file)) res.setHeader('Cache-Control', `public, max-age=${YEAR}, immutable`);
  else if (/\.(css|js)$/.test(file)) res.setHeader('Cache-Control', 'no-cache');
  else res.setHeader('Cache-Control', 'public, max-age=86400');
  if (/sw\.js$/.test(file)) res.setHeader('Service-Worker-Allowed', '/');
}
const staticOpts = { index: false, dotfiles: 'ignore', etag: true, lastModified: true, fallthrough: true, setHeaders: staticHeaders };

function buildApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', cfg.TRUST_PROXY);
  app.set('query parser', 'simple'); // ?a[b]=c style nested objects are never needed → no prototype-pollution surface

  app.use(compression({ threshold: 1024 }));
  app.use(sec.securityHeaders);
  app.use(sec.hostCheck);
  app.use(sec.probeGuard);

  // Static files first: cheap, cacheable, and they should not use up a visitor's request quota.
  app.use('/uploads', express.static(cfg.UPLOAD_DIR, { ...staticOpts, setHeaders: (res) => { res.setHeader('Cache-Control', 'public, max-age=2592000'); res.setHeader('X-Content-Type-Options', 'nosniff'); } }));
  app.use(express.static(cfg.PUBLIC_DIR, staticOpts));

  // cloud-database mode: make sure this instance's local copy is fresh before any page or API work
  app.use((req, res, next) => { db.syncIfStale(); next(); });
  app.use(supabase.middleware);   // Supabase mirror (does nothing unless SUPABASE_URL + SUPABASE_SERVICE_KEY are set)
  app.use(cookieParser());
  app.use((req, res, next) => { // repeated ?q=a&q=b → last value, so handlers can always expect strings
    for (const k of Object.keys(req.query)) if (Array.isArray(req.query[k])) req.query[k] = req.query[k][req.query[k].length - 1];
    next();
  });
  app.use(sec.limiters.global);
  app.use(sec.originCheck);
  app.use(C.langMiddleware);

  app.use('/api', sec.limiters.api, require('./src/routes/api'));
  app.use(cfg.ADMIN_PATH, require('./src/routes/admin'));

  app.use(auth.loadSession);
  app.use(analytics.middleware);
  app.use(require('./src/routes/public'));

  // Last-resort error handler: never leak stack traces or internals.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status || err.statusCode || (err instanceof URIError ? 400 : 500);
    if (status >= 500) console.error(`[error] ${req.method} ${req.originalUrl.slice(0, 200)}`, err && err.stack ? err.stack : err);
    if (res.headersSent) return res.end();
    if (/^\/api\//.test(req.path) || /json/.test(req.get('accept') || '')) return res.status(status).json({ error: status >= 500 ? 'Server error' : 'Bad request' });
    res.status(status >= 400 && status < 600 ? status : 500).type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${status >= 500 ? 'Something went wrong' : 'Request problem'}</title><link rel="stylesheet" href="/css/offline.css"></head><body class="offline"><main><h1>${status >= 500 ? 'Something went wrong' : 'We could not process that request'}</h1><p>${status >= 500 ? 'Please try again in a moment.' : 'Please go back and try again.'}</p><p><a href="/">Back to home page</a></p></main></body></html>`);
  });
  return app;
}

// ───────────────────────── start-up
async function init() {
  crud.ensureTables();
  await supabase.start();   // restore the saved copy BEFORE default content is created (fresh Vercel / web-host start)
  seed.seed();
  const created = await auth.ensureAdmin();
  if (created) {
    const line = '─'.repeat(64);
    if (created.note) console.warn(`[setup] ${created.note}`);
    console.log(`\n${line}\n  FIRST RUN – admin account created\n  Sign in at:  ${cfg.SITE_URL}${cfg.ADMIN_PATH}\n  Email:       ${created.email}\n  ${created.password ? `Password:    ${created.password}\n  (shown only once – you must change it at first sign-in)` : 'Password:    (the ADMIN_PASSWORD from your .env)'}\n${line}\n`);
  }
  await supabase.finish();   // first connection (empty Supabase) or content created by seeding is saved to Supabase
}

function maintenance() {
  try {
    auth.pruneSessions();
    audit.prune(180);
    analytics.prune(400);
    db.prepare('DELETE FROM chat_log WHERE ts < ?').run(new Date(Date.now() - 90 * 864e5).toISOString());
    db.pragma('wal_checkpoint(PASSIVE)');
  } catch (e) { console.error('[maintenance]', e.message); }
}

async function main() {
  await init();
  const app = buildApp();
  const server = app.listen(cfg.PORT, cfg.HOST, () => {
    const w = cluster.worker ? ` (worker ${cluster.worker.id})` : '';
    console.log(`[server] Sri Suriya Polymers listening on http://${cfg.HOST === '0.0.0.0' ? 'localhost' : cfg.HOST}:${cfg.PORT}${w} · ${cfg.isProd ? 'production' : 'development'} · admin: ${cfg.ADMIN_PATH}`);
    if (!cfg.isProd) console.log('[server] Development mode – set NODE_ENV=production and SITE_URL=https://your-domain in .env when you go live.');
  });
  server.keepAliveTimeout = 65000; server.headersTimeout = 66000; server.requestTimeout = 30000;

  // maintenance only in one worker
  if (!cluster.worker || cluster.worker.id === 1) { setTimeout(maintenance, 20000).unref(); setInterval(maintenance, 6 * 3600 * 1000).unref(); }

  let closing = false;
  const shutdown = (sig) => {
    if (closing) return; closing = true;
    console.log(`[server] ${sig} received – shutting down…`);
    const force = setTimeout(() => process.exit(0), 10000); force.unref();
    server.close(() => { try { analytics.flush(); db.pragma('wal_checkpoint(TRUNCATE)'); db.close(); } catch { /* ignore */ } process.exit(0); });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e));
process.on('uncaughtException', (e) => { console.error('[uncaughtException]', e); setTimeout(() => process.exit(1), 100); });

if (require.main === module) main().catch((e) => { console.error('[fatal]', e); process.exit(1); });
module.exports = { buildApp, init, main, settings };
