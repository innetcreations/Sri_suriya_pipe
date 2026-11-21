'use strict';
// Bundles the small Three.js scene into public/js/fx/scene3d.bundle.js (committed, so you never need to run this
// unless you edit scene3d.src.js). Usage:  npm run build:3d
const path = require('path');
const fs = require('fs');
const esbuild = require('esbuild');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'public/js/fx/scene3d.bundle.js');
esbuild.build({
  entryPoints: [path.join(root, 'public/js/fx/scene3d.src.js')], bundle: true, format: 'esm', minify: true, target: ['es2020'], outfile: out,
  legalComments: 'none', treeShaking: true, logLevel: 'info',
}).then(() => {
  const size = fs.statSync(out).size;
  console.log(`scene3d.bundle.js ${(size / 1024).toFixed(0)} KB`);
}).catch(() => process.exit(1));
