const fs = require('node:fs');
const path = require('node:path');
require('./verify-identity-runtime.cjs')();
const root = path.resolve(__dirname, '..');
require('./harden-dependencies.cjs').harden(root);
const { build } = require('esbuild');
const output = process.env.STELLAR_DESIGN_OUTPUT;
if (!output || !path.isAbsolute(output)) throw new Error('Set STELLAR_DESIGN_OUTPUT to an absolute output path.');
(async () => {
  await build({ absWorkingDir: root, entryPoints: ['src/runtime/notes-design-runtime.ts'], bundle: true,
    platform: 'browser', format: 'iife', globalName: 'StellarNotesRuntime', target: 'es2022',
    tsconfig: 'tsconfig.json', alias: { src: path.join(root, 'src') }, outfile: output,
    metafile: true, minify: false, logLevel: 'warning',
    plugins: [{ name: 'production-endpoints', setup(builder) {
      builder.onLoad({ filter: /[\\/]environments[\\/]environment\.ts$/ }, args => {
        if (args.path !== path.join(root, 'src/environments/environment.ts')) return;
        return { contents: fs.readFileSync(path.join(root, 'src/environments/environment.prod.ts'), 'utf8'), loader: 'ts' };
      });
    } }] });
  await build({ absWorkingDir: root, entryPoints: ['src/runtime/backup/backup.worker.ts'], bundle: true, platform: 'browser', format: 'iife', target: 'es2022', outfile: path.join(path.dirname(output), 'backup.worker.js'), logLevel: 'warning' });
  const manifest = { version: 1, sourceSha256: require('./release-tests/source-fingerprint.cjs').runtimeFingerprint(root), bundleSha256: require('node:crypto').createHash('sha256').update(fs.readFileSync(output)).digest('hex') };
  fs.writeFileSync(path.join(path.dirname(output), 'runtime.sources.json'), JSON.stringify(manifest, null, 2) + '\n');
  const rootIndex = path.resolve(path.dirname(output), '../index.html');
  for (const index of [rootIndex, path.join(path.dirname(rootIndex), 'tests/auth-flow.html')]) {
  if (fs.existsSync(index) && path.basename(output) === 'runtime.bundle.js') {
    const crypto = require('node:crypto');
    let html = fs.readFileSync(index, 'utf8');
    for (const asset of ['notes.css', 'live/runtime.bundle.js', 'live/api-integration.js', 'live/auth-navigation.js', 'live/device-feedback.js', 'notes.js', 'mobile-features.js', 'editor/engine.bundle.js', 'editor/engine.bundle.css', 'editor/mobile-editor.js']) {
      const file = path.resolve(path.dirname(rootIndex), asset);
      if (!fs.existsSync(file)) continue;
      const hash = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 12);
      const attribute = asset.endsWith('.css') ? 'href' : 'src';
      const expression = new RegExp(attribute + '="' + asset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:\\?v=[a-f0-9]+)?"', 'g');
      html = html.replace(expression, attribute + '="' + asset + '?v=' + hash + '"');
    }
    fs.writeFileSync(index, html);
  }
  }
  console.log('Built the existing Notes services for the original design:', output);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
