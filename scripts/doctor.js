'use strict';
// "Is everything OK?" - a plain-language health check you can run any time:  npm run doctor  (or option in suriya.bat).
const fs = require('fs');
const path = require('path');
const net = require('net');
const root = path.join(__dirname, '..');
let bad = 0;
const row = (ok, label, hint) => { if (!ok) bad++; console.log(`  [${ok ? ' OK ' : 'FAIL'}] ${label}${!ok && hint ? `\n         -> ${hint}` : ''}`); };
const warn = (label, hint) => console.log(`  [warn] ${label}\n         -> ${hint}`);

(async () => {
  console.log('\n  Sri Suriya - health check\n');
  const major = Number(process.versions.node.split('.')[0]);
  row(major >= 22, `Node.js ${process.versions.node} (needs 22 or newer)`, 'Install the LTS version from https://nodejs.org');
  row(fs.existsSync(path.join(root, 'node_modules', 'express')), 'Libraries installed (node_modules)', 'Run option 1 (First-time setup) or: npm install');
  const envFile = path.join(root, '.env'); const hasEnv = fs.existsSync(envFile);
  row(hasEnv, '.env settings file exists', 'Run option 1 (First-time setup)');
  const env = {}; if (hasEnv) for (const l of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim(); }
  row(!!env.APP_SECRET || !hasEnv, 'APP_SECRET is set', 'Run option 1 (First-time setup) - it creates one for you');
  for (const f of ['server.js', 'src/schema.js', 'src/routes/admin.js', 'public/css/app.css', 'public/js/app.js']) row(fs.existsSync(path.join(root, f)), `File ${f} present`, 'A file is missing - re-apply the last update');
  const dataDir = path.resolve(root, env.DATA_DIR || 'data');
  try { fs.mkdirSync(dataDir, { recursive: true }); fs.accessSync(dataDir, fs.constants.W_OK); row(true, `Data folder writable (${path.relative(root, dataDir) || '.'})`); } catch { row(false, 'Data folder is writable', `Check permissions of ${dataDir}`); }
  const up = path.resolve(root, env.UPLOAD_DIR || path.join('public', 'assets', 'uploads'));
  try { fs.mkdirSync(up, { recursive: true }); fs.accessSync(up, fs.constants.W_OK); row(true, `Upload folder writable (${path.relative(root, up)})`); } catch { row(false, 'Upload folder is writable', `Check permissions of ${up}`); }
  const port = Number(env.PORT || 3000);
  const free = await new Promise((res) => { const s = net.createServer(); s.once('error', () => res(false)); s.once('listening', () => s.close(() => res(true))); s.listen(port, '127.0.0.1'); });
  if (free) row(true, `Port ${port} is free`); else warn(`Port ${port} is already in use`, 'The site may already be running in another window, or change PORT in .env');
  if (/^https:/.test(env.SITE_URL || '') === false && env.NODE_ENV === 'production') warn('SITE_URL is not https://', 'Set SITE_URL=https://your-domain before going live');
  if (env.SUPABASE_URL || env.SUPABASE_SERVICE_KEY) {
    row(/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(env.SUPABASE_URL || ''), 'SUPABASE_URL looks right (https://xxxx.supabase.co, no trailing slash or path)', 'Supabase -> Project Settings -> API -> Project URL');
    row(!!env.SUPABASE_SERVICE_KEY, 'SUPABASE_SERVICE_KEY is filled', 'Supabase -> Project Settings -> API Keys -> secret key');
    row(!/^sb_publishable_/.test(env.SUPABASE_SERVICE_KEY || ''), 'The Supabase key is the SECRET key, not the publishable one', 'The publishable / anon key cannot save data. Use the secret (service_role) key.');
  } else console.log('  [info] Supabase is not connected (optional). Steps: docs/INTEGRATIONS.md');
  if (!env.ADMIN_PASSWORD) console.log('  [info] ADMIN_PASSWORD is empty: on the first start a random password is printed once in the console.');
  console.log(bad ? `\n  ${bad} problem(s) found - fix the lines marked FAIL.\n` : '\n  Everything looks good.\n');
  process.exit(bad ? 1 : 0);
})();
