const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const { prepareBuildHardening, patchSource } = require('./build-tool-hardening.cjs');

test('unreviewed source and package introductions stop before writes', () => {
  assert.throws(() => patchSource('glob', 'changed source'), /Unexpected glob source/);
  assert.throws(() => patchSource('minimatch', 'changed source'), /Unexpected minimatch source/);
  assert.throws(() => prepareBuildHardening('.', { packages: {'node_modules/@isaacs/nonrecursive-glob-match': {version:'1.1.0'}} }, () => { throw Error('must not read'); }), /Unreviewed build package/);
  assert.throws(() => prepareBuildHardening('.', { packages: {'node_modules/glob': {version:'13.0.7'}} }, () => { throw Error('must not read'); }), /Unreviewed build-tool version/);
});

if (process.env.STELLAR_REVIEWED_BUILD_TOOLS === '1') {
  const root = path.resolve(__dirname, '..');
  const lock = require('../package-lock.json');
  const locate = (name, version) => path.join(root, Object.keys(lock.packages).find(p => p.endsWith('/' + name) && lock.packages[p].version === version));
  const globPath = locate('glob', '13.0.6');
  const matcherPath = locate('minimatch', '10.2.6');
  test('changed dependency bytes fail closed and an already patched install is idempotent', t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'glob-integrity-'));
    t.after(() => fs.rmSync(dir, {recursive:true, force:true}));
    const location = 'node_modules/glob';
    const rules = require('./build-tool-hardening.json').glob;
    for (const file of Object.keys(rules.files)) {
      const dest = path.join(dir, location, file);
      fs.mkdirSync(path.dirname(dest), {recursive:true});
      fs.copyFileSync(path.join(globPath, file), dest);
    }
    const fixture = {packages:{[location]:{version:rules.version}}};
    const checked = (base, file) => path.join(base, file);
    assert.equal(prepareBuildHardening(dir, fixture, checked).length, 0);
    fs.appendFileSync(path.join(dir, location, 'dist/esm/walker.js'), '\n// changed fixture bytes\n');
    assert.throws(() => prepareBuildHardening(dir, fixture, checked), /source hash/);
  });
  for (const mode of ['commonjs', 'esm']) {
    test(`${mode}: actual patched glob stops traversal after cancellation`, async t => {
      const pkg = mode === 'commonjs' ? require(globPath) : await import(pathToFileURL(path.join(globPath, 'dist/esm/index.js')).href);
      if (mode === 'commonjs') assert.ok(require.resolve(globPath).endsWith('/index.js'));
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'glob-abort-'));
      t.after(() => fs.rmSync(dir, {recursive:true, force:true}));
      for (let a=0;a<4;a++) for(let b=0;b<4;b++) fs.mkdirSync(path.join(dir, String(a), String(b)), {recursive:true});
      const controller = new AbortController();
      const reason = new Error('synthetic abort');
      let reads = 0;
      const wrappedFs = {...fs, readdir(...args) {
        reads++;
        const callback = args.pop();
        fs.readdir(...args, (error, entries) => { controller.abort(reason); callback(error, entries); });
      }};
      await assert.rejects(new pkg.Glob('**/*', {cwd:dir, signal:controller.signal, fs:wrappedFs}).walk(), error => error === reason);
      const atReject = reads;
      await new Promise(resolve => setTimeout(resolve, 60));
      assert.equal(reads, atReject);
      assert.equal(reads, 1);
    });
    test(`${mode}: aggressive patterns remain bounded while matching semantics are retained`, async () => {
      const pkg = mode === 'commonjs' ? require(matcherPath) : await import(pathToFileURL(path.join(matcherPath, 'dist/esm/index.js')).href);
      const pattern = '**/../'.repeat(6) + 'target';
      const matcher = new pkg.Minimatch(pattern, {optimizationLevel:2});
      assert.ok(matcher.globParts.length <= 1);
      for (const [file, pattern] of [['src/a.ts','src/**/*.ts'],['.hidden/file','**/*'],['a/b/c','a/**'],['image.png','*.{png,jpg}']]) {
        assert.equal(pkg.minimatch(file, pattern, {optimizationLevel:2}), pkg.minimatch(file, pattern, {optimizationLevel:1}));
      }
    });
  }
}
