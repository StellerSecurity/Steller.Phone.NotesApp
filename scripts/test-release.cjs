'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const localConfigFile = path.join(root, 'release-tests.local.json');
let localConfig = {};
const reports = path.resolve(process.env.STELLAR_TEST_REPORT_DIR || path.join(root, 'test-results'));
const mobileOnly = process.argv.includes('--mobile-only');
const platformIndex = process.argv.indexOf('--platform');
const platform = platformIndex < 0 ? null : process.argv[platformIndex + 1];
const summary = { started: new Date().toISOString(), passed: false, suites: [], artifacts: {} };
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function run(name, script, args = [], env = {}) {
  console.log('\n=== ' + name + ' ===');
  const childEnv = { ...process.env, STELLAR_TEST_REPORT_DIR: reports, ...env };
  delete childEnv.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, [...(script ? [script] : []), ...args], { cwd: root, stdio: 'inherit', env: childEnv });
  const passed = !result.error && result.status === 0;
  summary.suites.push({ name, passed, exitCode: result.status, error: result.error?.message });
  if (!passed) throw Error(name + ' failed. Release blocked; see ' + reports);
}
fs.mkdirSync(reports, { recursive: true });
for (const file of ['release.json', 'mobile-integration.json']) fs.rmSync(path.join(reports, file), { force: true });
try {
  localConfig = fs.existsSync(localConfigFile) ? JSON.parse(fs.readFileSync(localConfigFile, 'utf8')) : {};
  if (!process.env.CHROME_BIN && localConfig.chromeBinary) process.env.CHROME_BIN = localConfig.chromeBinary;
  if (!fs.existsSync(path.join(root, 'node_modules/@angular/cli/bin/ng.js'))) throw Error('Reviewed dependencies are missing. No installation is performed by this command.');
  run('Dependency integrity', path.join(root, 'scripts/verify-identity-runtime.cjs'));
  run('Dependency hardening', path.join(root, 'scripts/harden-dependencies.cjs'));
  run('Storage upgrade and dependency unit tests', null, ['--test', '--test-reporter=spec', '--test-reporter=junit', '--test-reporter-destination=stdout', '--test-reporter-destination=' + path.join(reports, 'mobile-unit.xml'), 'scripts/notes-database-upgrade.test.cjs', 'scripts/dependency-hardening.test.cjs', 'scripts/test-release-gate.test.cjs', 'scripts/recovery-export.test.cjs', 'scripts/local-export.test.cjs']);
  if (!mobileOnly) {
    const design = process.env.STELLAR_NOTES_DESIGN_SOURCE || localConfig.designSource;
    if (!design || !path.isAbsolute(design)) throw Error('Set STELLAR_NOTES_DESIGN_SOURCE to the reviewed Notes design checkout.');
    run('Notes UI unit regressions', path.join(design, 'tools/test-notes.cjs'), ['--report-dir', reports]);
    const assets = ['index.html', 'notes.js', 'notes.css', 'mobile-features.js', 'live/api-integration.js', 'live/auth-navigation.js', 'live/device-feedback.js', 'editor/mobile-editor.js', 'editor/engine.bundle.js', 'editor/engine.bundle.css', 'live/runtime.bundle.js', 'live/backup.worker.js', 'live/runtime.sources.json'];
    if (platformIndex >= 0 && !['android', 'ios'].includes(platform)) throw Error('Unknown release platform: ' + platform);
    for (const asset of assets) {
      const built = fs.readFileSync(path.join(root, 'www', asset));
      if (!built.equals(fs.readFileSync(path.join(design, asset)))) throw Error('Stale shipping asset: ' + asset + '. Run build:design-app and Capacitor sync.');
      if (platform) {
        const native = platform === 'android' ? 'android/app/src/main/assets/public' : 'ios/App/App/public';
        if (!built.equals(fs.readFileSync(path.join(root, native, asset)))) throw Error('Native assets do not match tested UI: ' + asset + '. Run Capacitor sync.');
      }
      summary.artifacts[asset] = sha256(built);
    }
    const provenance = JSON.parse(fs.readFileSync(path.join(root, 'www/live/runtime.sources.json'), 'utf8'));
    if (provenance.version !== 1 || provenance.sourceSha256 !== require('./release-tests/source-fingerprint.cjs').runtimeFingerprint(root) || provenance.bundleSha256 !== summary.artifacts['live/runtime.bundle.js']) throw Error('The runtime bundle does not match this mobile source. Rebuild the design app before releasing.');
    const fixture = path.join(root, 'local/release-ui');
    fs.mkdirSync(fixture, { recursive: true });
    require('esbuild').buildSync({ absWorkingDir: root, entryPoints: ['src/release/ui-bootstrap.ts'], bundle: true, platform: 'browser', format: 'iife', target: 'es2022', outfile: path.join(fixture, 'bootstrap.js') });
    const html = fs.readFileSync(path.join(root, 'www/index.html'), 'utf8').replace('<head>', '<head><base href="/base/www/">').replace(/(<script src="live\/runtime\.bundle\.js[^"]*"><\/script>)/, '$1<script src="/base/local/release-ui/bootstrap.js"></script>');
    if (!html.includes('/base/local/release-ui/bootstrap.js')) throw Error('Shipping runtime script not found; UI tests cannot be prepared.');
    fs.writeFileSync(path.join(fixture, 'index.html'), html);
  }
  const config = JSON.parse(fs.readFileSync(path.join(root, mobileOnly ? 'tsconfig.sync-spec.json' : 'tsconfig.release-spec.json'), 'utf8'));
  const specs = [...config.files, ...config.include].filter(file => file.endsWith('.spec.ts'));
  run('Mobile integration' + (mobileOnly ? '' : ' and actual shipping UI'), path.join(root, 'node_modules/@angular/cli/bin/ng.js'), ['test', '--watch=false', '--browsers=ChromeHeadless', '--progress=false', '--karma-config=karma.release.conf.cjs', '--ts-config=' + (mobileOnly ? 'tsconfig.sync-spec.json' : 'tsconfig.release-spec.json'), ...specs.map(file => '--include=' + file)], { STELLAR_RELEASE_UI: mobileOnly ? '0' : '1' });
  const integration = JSON.parse(fs.readFileSync(path.join(reports, 'mobile-integration.json'), 'utf8'));
  if (!integration.passed || !integration.cases?.some(test => test.passed && !test.skipped) || integration.cases.some(test => !test.passed && !test.skipped)) throw Error('Integration test report is missing, empty or failed.');
  if (!mobileOnly && integration.cases.filter(test => test.name.startsWith('Shipping Notes UI with the actual runtime and Quill > ') && test.passed && !test.skipped).length < 7) throw Error('Required shipping UI scenarios did not all execute.');
  summary.passed = true;
} catch (error) {
  summary.error = error.message; console.error('RELEASE BLOCKED: ' + error.message); process.exitCode = 1;
} finally {
  summary.finished = new Date().toISOString();
  fs.writeFileSync(path.join(reports, 'release.json'), JSON.stringify(summary, null, 2) + '\n');
  console.log('Test reports: ' + reports);
}
