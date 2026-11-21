'use strict';
// "Am I ready for Vercel?" - run from suriya.bat (option 14) or:  node scripts/vercel-check.js
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const has = (f) => fs.existsSync(path.join(root, f));
const env = {};
if (has('.env')) for (const l of fs.readFileSync(path.join(root, '.env'), 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim(); }
let bad = 0;
const ok = (c, label, hint) => { if (!c) bad++; console.log(`  [${c ? ' OK ' : 'TODO'}] ${label}${!c && hint ? `\n         -> ${hint}` : ''}`); };

console.log('\n  Vercel readiness check\n');
ok(has('vercel.json') && has('api/index.js'), 'vercel.json and api/index.js are present', 'Re-apply the latest update ZIP.');
ok(has('.gitignore'), '.gitignore keeps .env and data out of GitHub');
ok(!!env.APP_SECRET, 'APP_SECRET exists in your .env (you must copy the SAME value to Vercel)', 'Run option 1 (First-time setup).');
const hasSb = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(env.SUPABASE_URL || '') && !!env.SUPABASE_SERVICE_KEY;
ok(hasSb || /^libsql:\/\/|^https:\/\//.test(env.TURSO_DATABASE_URL || ''), 'A cloud database is connected: Supabase (SUPABASE_URL + SUPABASE_SERVICE_KEY) or Turso', 'Vercel has no permanent disk, so without a cloud database every admin change is lost. Connect Supabase (docs/INTEGRATIONS.md, step 2) or create a free Turso database.');
ok(hasSb || !!env.TURSO_AUTH_TOKEN, 'The cloud database key is filled (SUPABASE_SERVICE_KEY or TURSO_AUTH_TOKEN)', 'Supabase -> Project Settings -> API Keys -> secret key.');
ok(!/^sb_publishable_/.test(env.SUPABASE_SERVICE_KEY || ''), 'The Supabase key is the SECRET key (not the publishable one)');
const up = path.join(root, 'public', 'assets', 'uploads');
let n = 0; try { n = fs.readdirSync(up).filter((f) => !f.startsWith('.')).length; } catch { /* none */ }
console.log(`  [info] ${n} file(s) in public/assets/uploads - these are uploaded to Vercel together with the code (commit them to GitHub).`);
console.log(`
  WHAT TO DO ON VERCEL
  1. Put this folder on GitHub (the .gitignore already keeps secrets out).
  2. vercel.com -> Add New -> Project -> import the repository. Framework preset: Other. No build command.
  3. Settings -> Environment Variables. Add these for Production:
       APP_SECRET            copy the value from your .env file
       SUPABASE_URL          from Supabase (Project Settings -> API)      } text data copy (steps: docs/INTEGRATIONS.md)
       SUPABASE_SERVICE_KEY  the SECRET key from Supabase                 }
       (or, instead of Supabase: TURSO_DATABASE_URL + TURSO_AUTH_TOKEN from Turso)
       ADMIN_EMAIL           the e-mail you will sign in with (first start only)
       ADMIN_PASSWORD        at least 12 characters (first start only; change it after signing in)
       SITE_URL              https://your-domain.com   (after you add your domain)
       ALLOWED_HOSTS         your-domain.com,www.your-domain.com
  4. Deploy. Open /admin and sign in. Then Admin -> SEO Centre.
  5. Pictures: upload to Google Drive (or any host) and paste the public link in Admin -> Media,
     OR copy files into public/assets/images and commit them to GitHub.

  Full guide: docs/INTEGRATIONS.md  (GitHub -> Vercel -> Supabase, in order).
`);
if (bad) console.log(`  ${bad} item(s) marked TODO above.\n`);
process.exit(0);
