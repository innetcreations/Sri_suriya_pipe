'use strict';
// Vercel serverless entry point. vercel.json sends every request here; real files in /public are served by Vercel's CDN first.
// The same Express app runs locally (npm start) and on Vercel - nothing here changes how the site behaves.

let app = null;
let booting = null;
let bootError = null;
let bootErrorAt = 0;

function boot() {
  if (bootError) {
    // Forget boot error after 10 seconds so transient network issues can recover automatically
    if (Date.now() - bootErrorAt > 10000) {
      bootError = null;
    } else {
      throw bootError;
    }
  }
  if (!booting) {
    booting = (async () => {
      const server = require('../server');
      await server.init();
      app = server.buildApp();
    })().catch((e) => {
      bootError = e;
      bootErrorAt = Date.now();
      booting = null;
      throw e;
    });
  }
  return booting;
}

module.exports = async (req, res) => {
  try {
    if (!app) await boot();

    // Vercel rewrites: if req.url matches internal handler path, restore original URL for Express routing
    const cleanPath = req.url.split('?')[0].replace(/\/+$/, '');
    if (cleanPath === '/api' || cleanPath === '/api/index' || cleanPath === '/api/index.js') {
      const orig = req.headers['x-forwarded-uri'] || req.headers['x-matched-path'] || '/';
      const cleanOrig = orig.split('?')[0].replace(/\/+$/, '');
      if (!cleanOrig || cleanOrig === '/api' || cleanOrig === '/api/index' || cleanOrig === '/api/index.js') {
        req.url = '/';
      } else {
        req.url = orig;
      }
    }

    return new Promise((resolve, reject) => {
      res.on('finish', resolve);
      res.on('close', resolve);
      res.on('error', reject);
      app(req, res);
    });
  } catch (e) {
    console.error('[vercel] start-up failed:', e && e.stack ? e.stack : e);
    res.statusCode = 503;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Retry-After', '5');
    res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Starting website...</title><meta http-equiv="refresh" content="5"><style>body{font-family:system-ui,-apple-system,sans-serif;padding:3rem 1.5rem;max-width:600px;margin:auto;color:#1e293b;line-height:1.5;text-align:center}.box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:2.5rem 2rem;box-shadow:0 4px 6px -1px rgba(0,0,0,0.05)}h1{color:#0b5ed7;font-size:1.5rem;margin-top:0}p{color:#64748b;margin:1rem 0 1.5rem}.spin{display:inline-block;width:32px;height:32px;border:3px solid #e2e8f0;border-top-color:#0b5ed7;border-radius:50%;animation:sp 1s linear infinite}@keyframes sp{to{transform:rotate(360deg)}}</style></head><body><div class="box"><div class="spin"></div><h1>Sri Suriya Polymers</h1><p>The website is connecting to its database and starting up.<br>This page will reload automatically in a few seconds.</p></div></body></html>`);
  }
};
