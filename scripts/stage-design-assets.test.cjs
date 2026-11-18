const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { stage, assets } = require('./stage-design-assets.cjs');
test('native staging includes the editor/runtime and excludes development fixtures', () => {
 const root = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-design-stage-'));
 try {
  const source = path.join(root, 'source'), output = path.join(root, 'www');
  for (const name of assets) {
   const file = path.join(source, name === 'assets' ? 'assets/icon.svg' : name);
   fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, name);
  }
  fs.mkdirSync(path.join(source, 'tests')); fs.writeFileSync(path.join(source, 'tests/fixture.html'), 'development only');
  stage(source, output);
  assert.equal(fs.readFileSync(path.join(output, 'editor/mobile-editor.js'), 'utf8'), 'editor/mobile-editor.js');
  assert.ok(fs.existsSync(path.join(output, 'live/runtime.bundle.js')));
  assert.ok(!fs.existsSync(path.join(output, 'tests')));
 } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
test('a missing build asset fails before replacing the generated output', () => {
 const root = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-design-stage-'));
 try {
  const source = path.join(root, 'source'), output = path.join(root, 'www');
  fs.mkdirSync(source); fs.mkdirSync(output); fs.writeFileSync(path.join(output, 'existing.txt'), 'keep');
  assert.throws(() => stage(source, output), /Missing built design asset/);
  assert.equal(fs.readFileSync(path.join(output, 'existing.txt'), 'utf8'), 'keep');
 } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
