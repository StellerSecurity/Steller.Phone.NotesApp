'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { harden, patchSharpSource } = require('./harden-dependencies.cjs');
const policy = require('./dependency-hardening.json');
const telemetry = require('./capacitor-telemetry-disabled.cjs');

test('telemetry replacement loads without imports, network or subprocess access', () => {
  const context = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'capacitor-telemetry-disabled.cjs'), 'utf8'), context);
  assert.equal(typeof context.exports.sendMetric, 'function');
});

test('actions preserve arguments, receiver, result and errors without inspecting secrets', async () => {
  const sensitive = new Proxy({}, { get() { throw new Error('must not inspect arguments'); } });
  const receiver = {};
  const action = function (value) { assert.equal(this, receiver); return value; };
  assert.equal(telemetry.telemetryAction(sensitive, action).call(receiver, sensitive), sensitive);
  const failure = new Error('synthetic failure');
  assert.throws(() => telemetry.telemetryAction(null, () => { throw failure; })(), e => e === failure);
  await assert.rejects(telemetry.telemetryAction(null, async () => { throw failure; })(), e => e === failure);
  await telemetry.sendMetric(sensitive, sensitive, sensitive);
});

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stellar-hardening-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const packages = {};
  for (const [location, version] of Object.entries(policy.capacitor)) {
    fs.mkdirSync(path.join(root, location, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(root, location, 'package.json'), JSON.stringify({ name: '@capacitor/cli', version }));
    // Inert text only; the original dependency is never executed by this test.
    fs.writeFileSync(path.join(root, location, 'dist/telemetry.js'), 'unpatched fixture');
    packages[location] = { version };
  }
  fs.writeFileSync(path.join(root, 'package-lock.json'), JSON.stringify({ packages }));
  return root;
}

test('unreviewed installed versions stop before changes', t => {
  const root = fixture(t);
  const location = Object.keys(policy.capacitor)[1];
  fs.writeFileSync(path.join(root, location, 'package.json'), JSON.stringify({ name: '@capacitor/cli', version: '99.0.0' }));
  assert.throws(() => harden(root), /Unreviewed Capacitor/);
  for (const p of Object.keys(policy.capacitor)) {
    assert.equal(fs.readFileSync(path.join(root, p, 'dist/telemetry.js'), 'utf8'), 'unpatched fixture');
  }
});

test('new nested CLI copies require review', t => {
  const root = fixture(t);
  const lockPath = path.join(root, 'package-lock.json');
  const lock = JSON.parse(fs.readFileSync(lockPath));
  lock.packages['node_modules/extra/node_modules/@capacitor/cli'] = { version: '7.4.3' };
  fs.writeFileSync(lockPath, JSON.stringify(lock));
  assert.throws(() => harden(root), /layout changed/);
});

test('dependency symlinks cannot write outside the project', t => {
  const root = fixture(t);
  const external = fs.mkdtempSync(path.join(os.tmpdir(), 'stellar-external-test-'));
  t.after(() => fs.rmSync(external, { recursive: true, force: true }));
  const target = path.join(external, 'telemetry.js');
  fs.writeFileSync(target, 'leave unchanged');
  const internal = path.join(root, Object.keys(policy.capacitor)[0], 'dist/telemetry.js');
  fs.unlinkSync(internal);
  fs.symlinkSync(target, internal);
  assert.throws(() => harden(root), /outside this project/);
  assert.equal(fs.readFileSync(target, 'utf8'), 'leave unchanged');
});

if (!policy.sharp) {
  test('every installed CLI copy is patched and repeat runs are safe', t => {
    const root = fixture(t);
    harden(root);
    harden(root);
    for (const location of Object.keys(policy.capacitor)) {
      assert.equal(fs.readFileSync(path.join(root, location, 'dist/telemetry.js'), 'utf8'), fs.readFileSync(path.join(__dirname, 'capacitor-telemetry-disabled.cjs'), 'utf8'));
    }
  });
} else {
  const { verifyBuffer, readVerifiedArchive } = require('./libvips-integrity.cjs');

  test('valid bytes pass and a changed byte fails SHA-512 verification', () => {
    const bytes = Buffer.from('synthetic archive fixture');
    const integrity = 'sha512-' + crypto.createHash('sha512').update(bytes).digest('base64');
    assert.equal(verifyBuffer(bytes, integrity), bytes);
    const changed = Buffer.from(bytes);
    changed[0] ^= 1;
    assert.throws(() => verifyBuffer(changed, integrity), /checksum mismatch/);
    assert.throws(() => verifyBuffer(bytes, ''), /Missing or invalid/);
  });

  test('unknown platforms and versions fail before reading any file', () => {
    assert.throws(() => readVerifiedArchive('must-not-read', '8.11.3', 'unreviewed'), /No approved/);
    assert.throws(() => readVerifiedArchive('must-not-read', '99.0.0', 'linux-x64'), /No approved/);
  });

  test('corrupt cached or downloaded archives are rejected without modifying them', t => {
    const root = fixture(t);
    for (const filename of ['cached.tar.br', 'downloaded.tar.br']) {
      const archive = path.join(root, filename);
      fs.writeFileSync(archive, 'untrusted bytes');
      assert.throws(() => readVerifiedArchive(archive, '8.11.3', 'linux-x64'), /checksum mismatch/);
      assert.equal(fs.readFileSync(archive, 'utf8'), 'untrusted bytes');
    }
    const empty = path.join(root, 'empty.tar.br');
    fs.writeFileSync(empty, '');
    assert.throws(() => readVerifiedArchive(empty, '8.11.3', 'linux-x64'), /Invalid libvips/);
  });

  test('all eleven pinned platform checksums are well formed', () => {
    const hashes = require('./libvips-8.11.3-integrity.json');
    assert.equal(Object.keys(hashes).length, 11);
    for (const value of Object.values(hashes)) {
      assert.match(value, /^sha512-[A-Za-z0-9+/]{86}==$/);
      assert.equal(Buffer.from(value.slice(7), 'base64').length, 64);
    }
  });

  test('an unexpected sharp installer is refused, never executed', () => {
    assert.throws(() => patchSharpSource('unreviewed installer'), /Unrecognized sharp/);
  });
}
