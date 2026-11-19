const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const assets = ['index.html', 'notes.css', 'notes.js', 'mobile-features.js', 'assets',
  'live/runtime.bundle.js', 'live/api-integration.js', 'live/auth-navigation.js', 'live/device-feedback.js',
  'editor/engine.bundle.js', 'editor/engine.bundle.css', 'editor/mobile-editor.js'];
function stage(source, output) {
  for (const asset of assets) if (!fs.existsSync(path.join(source, asset))) throw Error('Missing built design asset: ' + asset);
  fs.rmSync(output, { recursive: true, force: true });
  fs.mkdirSync(output, { recursive: true });
  for (const asset of assets) {
    fs.mkdirSync(path.dirname(path.join(output, asset)), { recursive: true });
    fs.cpSync(path.join(source, asset), path.join(output, asset), { recursive: true, filter(file) {
      if (fs.lstatSync(file).isSymbolicLink()) throw Error('Design assets must not contain symlinks');
      return true;
    } });
  }
}
if (require.main === module) {
  const root = path.resolve(__dirname, '..'), source = process.env.STELLAR_NOTES_DESIGN_SOURCE;
  if (!source || !path.isAbsolute(source)) throw Error('Set STELLAR_NOTES_DESIGN_SOURCE to the approved Notes design directory.');
  require('./harden-dependencies.cjs').harden(root);
  execFileSync(process.execPath, [path.join(source, 'tools/build-quill-editor.cjs')], { stdio: 'inherit' });
  execFileSync(process.execPath, [path.join(root, 'scripts/build-design-runtime.cjs')], {
    stdio: 'inherit', env: { ...process.env, STELLAR_DESIGN_OUTPUT: path.join(source, 'live/runtime.bundle.js') },
  });
  stage(source, path.join(root, 'www'));
  console.log('Staged the shared-editor Notes design in www for the existing Capacitor app.');
}
module.exports = { stage, assets };
