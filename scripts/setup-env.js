'use strict';
// First-time setup helper (used by suriya.bat, or run:  npm run setup).
// Creates .env from .env.example if it does not exist and fills in a random APP_SECRET. Safe to run again - it never overwrites your values.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const root = path.join(__dirname, '..');
const envFile = path.join(root, '.env');
const example = path.join(root, '.env.example');

if (!fs.existsSync(envFile)) {
  fs.copyFileSync(example, envFile);
  console.log('  Created .env from .env.example');
} else console.log('  .env already exists - keeping your values');

let text = fs.readFileSync(envFile, 'utf8');
const m = text.match(/^APP_SECRET=(.*)$/m);
if (!m) {
  text += `\nAPP_SECRET=${crypto.randomBytes(48).toString('hex')}\n`;
  fs.writeFileSync(envFile, text); console.log('  Added a random APP_SECRET');
} else if (!m[1].trim()) {
  text = text.replace(/^APP_SECRET=.*$/m, `APP_SECRET=${crypto.randomBytes(48).toString('hex')}`);
  fs.writeFileSync(envFile, text); console.log('  Generated a random APP_SECRET');
} else console.log('  APP_SECRET is already set');
for (const d of ['data', path.join('public', 'assets', 'uploads')]) fs.mkdirSync(path.join(root, d), { recursive: true });
console.log('  Folders ready.');
