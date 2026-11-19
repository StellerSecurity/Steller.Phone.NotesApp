const fs = require('node:fs');
const crypto = require('node:crypto');
const policy = require('./build-tool-hardening.json');
const sha256 = source => crypto.createHash('sha256').update(source).digest('hex');

function patchSource(name, source, relative) {
  if (name === 'glob' && relative === 'package.json') {
    if (source.split('index.min.js').length - 1 !== 6) throw new Error('Unexpected glob exports');
    return source.replaceAll('index.min.js', 'index.js');
  }
  const before = name === 'glob'
    ? 'if (this.signal?.aborted)\n            cb();'
    : 'const { optimizationLevel = 1 } = this.options;';
  const after = name === 'glob'
    ? 'if (this.signal?.aborted)\n            return cb();'
    : 'const optimizationLevel = Math.min(1, this.options.optimizationLevel ?? 1);';
  const count = name === 'glob' ? 4 : 2;
  if (source.split(before).length - 1 !== count) throw new Error(`Unexpected ${name} source`);
  return source.split(before).join(after);
}

function prepareBuildHardening(root, lock, checkedFile) {
  const writes = [];
  for (const location of Object.keys(lock.packages)) {
    if (location.endsWith('/@isaacs/nonrecursive-glob-match') || location.endsWith('/@rollup/rollup-android-x64')) throw new Error('Unreviewed build package: ' + location);
  }
  for (const [location, entry] of Object.entries(lock.packages)) {
    const name = location.split('/').pop();
    if (!Object.hasOwn(policy, name)) continue;
    const major = Number(entry.version?.split('.')[0]);
    if ((name === 'glob' && major >= 9 && major < 14 || name === 'minimatch' && major === 10) && entry.version !== policy[name].version) throw new Error('Unreviewed build-tool version: ' + name);
    if (entry.version !== policy[name].version) continue;
    const manifest = JSON.parse(fs.readFileSync(checkedFile(root, `${location}/package.json`), 'utf8'));
    if (manifest.name !== name || manifest.version !== entry.version) throw new Error(`Unreviewed ${name} installation`);
    for (const [relative, hashes] of Object.entries(policy[name].files)) {
      const file = checkedFile(root, `${location}/${relative}`);
      const source = fs.readFileSync(file, 'utf8');
      if (sha256(source) === hashes.patched) continue;
      if (sha256(source) !== hashes.original) throw new Error(`Unexpected ${name} source hash`);
      const patched = patchSource(name, source, relative);
      if (sha256(patched) !== hashes.patched) throw new Error(`Unexpected ${name} patch result`);
      writes.push([file, patched]);
    }
  }
  return writes;
}
module.exports = { prepareBuildHardening, patchSource };
