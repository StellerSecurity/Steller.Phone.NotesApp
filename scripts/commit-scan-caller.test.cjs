const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const root = path.join(__dirname, '../.github/workflows');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const workerHash = '484b99b4b9bc4b08180690b0469c8f0d2e2af05b2e1a4ea3d7029698ccc8b27c';
const sourceHash = '9c3cffad2daf0313baf993e9028fa277a5a775921270201f52da92a411503e42';
const packedHash = 'cdf7fe5ab551740318c48076b4d47645dc2be788ec1d0dd4af308543dafd0248';

test('the worker uses the published shared scanner with the existing restricted permissions', () => {
  const worker = fs.readFileSync(path.join(root, 'stellar-commit-guard.yml'));
  assert.equal(hash(worker), workerHash);
  const text = worker.toString();
  assert.ok(text.includes('uses: StellerSecurity/stellar-security-scanner/.github/workflows/commit-check.yml@main'));
  assert.ok(text.includes('  contents: read\n  checks: write\n'));
  assert.ok(!text.includes('contents: write'));
  assert.ok(!text.includes('secrets: inherit'));
});

test('all collector copies retain exact compressed and readable source integrity checks', () => {
  const workflow = fs.readFileSync(path.join(root, 'stellar-commit-trigger.yml'), 'utf8');
  const chunks = [...workflow.matchAll(/chunk = base64\.b64decode\('([A-Za-z0-9+/=]+)', validate=True\)/g)].map(match => Buffer.from(match[1], 'base64'));
  assert.equal(chunks.length, 15);
  for (let index = 0; index < 3; index++) {
    const packed = Buffer.concat(chunks.slice(index * 5, (index + 1) * 5));
    assert.equal(packed.length, 65145);
    assert.equal(hash(packed), packedHash);
    const raw = zlib.inflateSync(packed, { maxOutputLength: 133838 });
    assert.equal(raw.length, 133837);
    assert.equal(hash(raw), sourceHash);
    const source = raw.toString();
    assert.ok(source.includes("WORKER_SHA256 = '" + workerHash + "'"));
    assert.ok(source.includes('Trusted default-branch workflows differ from reviewed bytes'));
    assert.ok(source.includes("self.file(TRIGGER, head) != expected_trigger"));
    assert.ok(source.includes("sha256(self.file(WORKER, head)) != WORKER_SHA256"));
  }
  assert.equal(workflow.split('Reviewed collector compressed hash differs').length - 1, 3);
  assert.equal(workflow.split('Reviewed collector hash differs').length - 1, 3);
  assert.ok(workflow.includes("- cron: '23 */6 * * *'"));
});
