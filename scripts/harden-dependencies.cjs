'use strict';

// First-party code only: read dependencies as data, never require their modules.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const policy = require('./dependency-hardening.json');
const ROOT = path.resolve(__dirname, '..');
const SHARP_ORIGINAL_SHA256 = '59af411965115e01a236cc5cf08bcf213f7450d1550509a0c80ee587dafad9a9';

function checkedFile(root, relative) {
  const filename = path.join(root, relative);
  const real = fs.realpathSync(filename);
  if (!real.startsWith(fs.realpathSync(root) + path.sep) || !fs.statSync(real).isFile()) {
    throw new Error(`Refusing dependency file outside this project: ${relative}`);
  }
  return filename;
}

function patchSharpSource(source) {
  const hash = crypto.createHash('sha256').update(source).digest('hex');
  if (hash !== SHARP_ORIGINAL_SHA256) {
    throw new Error('Unrecognized sharp installer; review it before applying this patch');
  }
  return source.replace(
    'const extractTarball = function (tarPath, platformAndArch) {',
    'const extractTarball = function (tarPath, platformAndArch) {\n' +
    "  const verifiedArchive = require('./stellar-libvips-integrity.cjs').readVerifiedArchive(tarPath, minimumLibvipsVersion, platformAndArch);"
  ).replace('fs.createReadStream(tarPath),', 'stream.Readable.from([verifiedArchive]),');
}

function harden(root = ROOT) {
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  const lockedClis = Object.keys(lock.packages || {}).filter(p => p.endsWith('/@capacitor/cli')).sort();
  if (JSON.stringify(lockedClis) !== JSON.stringify(Object.keys(policy.capacitor).sort())) {
    throw new Error('Capacitor dependency layout changed; update the reviewed hardening policy');
  }
  const writes = [];
  for (const [location, version] of Object.entries(policy.capacitor)) {
    const installed = JSON.parse(fs.readFileSync(checkedFile(root, `${location}/package.json`), 'utf8'));
    if (lock.packages[location].version !== version || installed.version !== version || installed.name !== '@capacitor/cli') {
      throw new Error(`Unreviewed Capacitor CLI at ${location}`);
    }
    const destination = checkedFile(root, `${location}/dist/telemetry.js`);
    writes.push([destination, fs.readFileSync(path.join(__dirname, 'capacitor-telemetry-disabled.cjs'), 'utf8')]);
  }

  if (policy.sharp) {
    const location = policy.sharp.path;
    const installed = JSON.parse(fs.readFileSync(checkedFile(root, `${location}/package.json`), 'utf8'));
    if (lock.packages[location]?.version !== '0.29.3' || installed.name !== 'sharp' || installed.version !== '0.29.3' || installed.config?.libvips !== '8.11.3') {
      throw new Error('Unreviewed sharp/libvips version');
    }
    const installer = checkedFile(root, `${location}/install/libvips.js`);
    const source = fs.readFileSync(installer, 'utf8');
    const hash = crypto.createHash('sha256').update(source).digest('hex');
    if (hash !== policy.sharp.patchedSha256) {
      const patched = patchSharpSource(source);
      if (crypto.createHash('sha256').update(patched).digest('hex') !== policy.sharp.patchedSha256) {
        throw new Error('Unexpected sharp patch result');
      }
      if (fs.existsSync(path.join(root, location, 'vendor'))) {
        throw new Error('Existing sharp native files were not verified. Start with a clean dependency installation using npm run deps:install.');
      }
      writes.push([installer, patched]);
    }
    // The parent directory was checked above; reject existing symlink targets too.
    for (const [src, dest] of [
      ['libvips-integrity.cjs', 'stellar-libvips-integrity.cjs'],
      ['libvips-8.11.3-integrity.json', 'libvips-8.11.3-integrity.json']
    ]) {
      const target = path.join(path.dirname(installer), dest);
      let exists = false;
      try { fs.lstatSync(target); exists = true; } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      if (exists) checkedFile(root, `${location}/install/${dest}`);
      writes.unshift([target, fs.readFileSync(path.join(__dirname, src), 'utf8')]);
    }
  }

  // Validate all versions before changing anything. Any failure stops the caller.
  for (const [filename, content] of writes) {
    if (!fs.existsSync(filename) || fs.readFileSync(filename, 'utf8') !== content) {
      fs.writeFileSync(filename, content);
    }
  }
  return writes.length;
}

if (require.main === module) {
  try {
    harden();
    console.log('Dependency fixes applied: Capacitor telemetry disabled' + (policy.sharp ? ', libvips checksum required.' : '.'));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { harden, patchSharpSource };
