'use strict';
// Runs several copies of the server so every CPU core is used (set WORKERS in .env; default = CPU count, max 4).
// SQLite in WAL mode lets all workers share one database safely; caches are invalidated across workers via the DB.
const cluster = require('cluster');
const os = require('os');
const cfg = require('./src/config');

if (cluster.isPrimary) {
  const n = Math.max(1, Math.min(8, cfg.WORKERS || Math.min(4, os.cpus().length)));
  console.log(`[cluster] starting ${n} worker(s)`);
  // Initialise the database + first admin once, before workers start (so credentials are printed once).
  require('./server').init().then(() => {
    require('./src/db').close();
    for (let i = 0; i < n; i++) cluster.fork();
    let stopping = false; let restarts = []; // restart crashed workers, but stop if they crash-loop
    cluster.on('exit', (w, code, sig) => {
      if (stopping) return;
      const now = Date.now(); restarts = restarts.filter((t) => now - t < 60000);
      if (restarts.length >= 10) { console.error('[cluster] workers are crashing repeatedly – exiting'); process.exit(1); }
      restarts.push(now); console.error(`[cluster] worker ${w.id} exited (${sig || code}) – restarting`); setTimeout(() => cluster.fork(), 500);
    });
    const stop = () => { stopping = true; for (const id in cluster.workers) cluster.workers[id].process.kill('SIGTERM'); setTimeout(() => process.exit(0), 12000).unref(); };
    process.on('SIGTERM', stop); process.on('SIGINT', stop);
  }).catch((e) => { console.error('[cluster] init failed', e); process.exit(1); });
} else {
  require('./server').main();
}
