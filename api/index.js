'use strict';
// Vercel serverless entry point. vercel.json sends every request here; real files in /public are served by Vercel's CDN first.
// The same Express app runs locally (npm start) and on Vercel - nothing here changes how the site behaves.
const server = require('../server');

let app = null;
let booting = null;

function boot() {
  if (!booting) {
    booting = server.init().then(() => { app = server.buildApp(); }).catch((e) => { booting = null; throw e; });
  }
  return booting;
}

module.exports = async (req, res) => {
  try {
    if (!app) await boot();
  } catch (e) {
    console.error('[vercel] start-up failed:', e && e.stack ? e.stack : e);
    res.statusCode = 503;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Retry-After', '5');
    res.end('The website is starting. Please refresh in a few seconds. (Owner: open the Vercel function log for the reason.)');
    return;
  }
  return app(req, res);
};
