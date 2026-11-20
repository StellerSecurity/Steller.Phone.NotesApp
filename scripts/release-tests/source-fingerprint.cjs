'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
function runtimeFingerprint(root) {
  const files = ['package-lock.json', 'identity-runtime/package-lock.json', 'scripts/build-design-runtime.cjs', 'scripts/release-tests/source-fingerprint.cjs'];
  function walk(relative) {
    for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
      const name = path.posix.join(relative, entry.name);
      if (entry.isSymbolicLink()) throw Error('Unexpected release source symlink: ' + name);
      if (name.startsWith('src/release/')) continue;
      if (entry.isDirectory()) walk(name);
      else if (/\.(ts|html|scss|json)$/.test(name) && !name.endsWith('.spec.ts')) files.push(name);
    }
  }
  walk('src');
  const hash = crypto.createHash('sha256');
  for (const file of files.sort()) { hash.update(file + '\0'); hash.update(fs.readFileSync(path.join(root, file))); hash.update('\0'); }
  return hash.digest('hex');
}
module.exports = { runtimeFingerprint };
