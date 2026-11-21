'use strict';
// Emergency recovery: sets a NEW random password for an admin and unlocks the account.
//   npm run reset-admin                      → first super admin
//   npm run reset-admin -- you@example.com   → a specific user
//   npm run reset-admin -- you@example.com --no-2fa   → also switch off 2FA (lost phone)
const db = require('../src/db');
const crud = require('../src/crud');
const auth = require('../src/auth');
const { rand } = require('../src/util');

(async () => {
  crud.ensureTables();
  const args = process.argv.slice(2);
  const email = args.find((a) => !a.startsWith('--'));
  const u = email
    ? db.prepare('SELECT * FROM users WHERE email=? COLLATE NOCASE').get(email)
    : db.prepare("SELECT * FROM users WHERE role='superadmin' ORDER BY id LIMIT 1").get();
  if (!u) { console.error('No matching user found. Existing users:', db.prepare('SELECT email, role FROM users').all()); process.exit(1); }
  const pw = rand(12).replace(/[^A-Za-z0-9]/g, 'x') + 'aA1!' + rand(3).replace(/[^A-Za-z0-9]/g, 'z');
  await auth.setPassword(u.id, pw, { mustChange: true });
  db.prepare('UPDATE users SET active=1, failed_logins=0, locked_until=0 WHERE id=?').run(u.id);
  if (args.includes('--no-2fa')) db.prepare('UPDATE users SET totp_enabled=0, totp_secret=NULL WHERE id=?').run(u.id);
  console.log(`\nPassword reset for ${u.email}\nNew temporary password:  ${pw}\n(You must choose a new password at the next sign-in.)\n`);
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
