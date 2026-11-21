'use strict';
// Vercel serverless entry point. vercel.json sends every request here; real files in /public are served by Vercel's CDN first.
// The same Express app runs locally (npm start) and on Vercel - nothing here changes how the site behaves.

let app = null;
let booting = null;
let bootError = null;

function boot() {
  if (bootError) throw bootError;
  if (!booting) {
    booting = (async () => {
      const server = require('../server');
      await server.init();
      app = server.buildApp();
    })().catch((e) => {
      bootError = e;
      booting = null;
      throw e;
    });
  }
  return booting;
}

module.exports = async (req, res) => {
  try {
    if (req.url === '/debug-req' || req.url === '/api/debug-req' || req.headers['x-forwarded-uri'] === '/debug-req') {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({
        url: req.url,
        method: req.method,
        headers: req.headers
      }, null, 2));
    }

    if (!app) await boot();

    // Vercel rewrites all routes to /api; restore original route so Express matches correctly
    if (req.url === '/api' || req.url === '/api/' || req.url === '/api/index') {
      const orig = req.headers['x-forwarded-uri'] || req.headers['x-matched-path'] || '';
      if (!orig || orig === '' || orig === '/api' || orig === '/api/') {
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
    const msg = (e && (e.stack || e.message)) || String(e);
    res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Starting website...</title><meta http-equiv="refresh" content="5"></head><body style="font-family:system-ui,sans-serif;padding:2rem;max-width:800px;margin:auto;"><h1 style="color:#d32f2f;">The website is starting up</h1><p>Please wait a few seconds while services initialize. The page will refresh automatically.</p><details style="margin-top:2rem;border:1px solid #ccc;border-radius:6px;padding:1rem;"><summary style="cursor:pointer;font-weight:bold;">Diagnostics & Logs</summary><pre style="white-space:pre-wrap;background:#f8f9fa;padding:1rem;border-radius:4px;overflow:auto;margin-top:0.5rem;font-size:13px;">${msg}</pre></details></body></html>`);
  }
};
