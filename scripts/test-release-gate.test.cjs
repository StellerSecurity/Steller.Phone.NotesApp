'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const runner = fs.readFileSync(path.join(__dirname, 'test-release.cjs'));
function fixture({ fail = false, report = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-release-gate-'));
  const write = (name, text) => { fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true }); fs.writeFileSync(path.join(root, name), text); };
  write('scripts/test-release.cjs', runner);
  write('scripts/verify-identity-runtime.cjs', ''); write('scripts/harden-dependencies.cjs', '');
  for (const name of ['notes-database-upgrade.test.cjs', 'dependency-hardening.test.cjs', 'test-release-gate.test.cjs']) write('scripts/' + name, "require('node:test')('synthetic gate fixture',()=>{" + (fail && name === 'notes-database-upgrade.test.cjs' ? "throw Error('deliberate failure')" : '') + '});');
  write('tsconfig.sync-spec.json', JSON.stringify({ files: [], include: ['src/synthetic.spec.ts'] }));
  write('node_modules/@angular/cli/bin/ng.js', "const fs=require('node:fs'),p=require('node:path');fs.writeFileSync('integration-started','yes');" + (report ? "fs.writeFileSync(p.join(process.env.STELLAR_TEST_REPORT_DIR,'mobile-integration.json'),JSON.stringify({passed:true,cases:[{name:'synthetic integration',passed:true,skipped:false}]}));" : ''));
  write('test-results/release.json', JSON.stringify({ passed: true, stale: true }));
  return { root, run: () => spawnSync(process.execPath, ['scripts/test-release.cjs', '--mobile-only'], { cwd: root, encoding: 'utf8', env: { ...process.env, STELLAR_TEST_REPORT_DIR: path.join(root, 'test-results') } }), close: () => fs.rmSync(root, { recursive: true, force: true }) };
}
test('a deliberately failing unit test stops the gate and invalidates a previous passing report', () => {
  const f = fixture({ fail: true }); try { const result=f.run(); assert.notEqual(result.status,0); assert.equal(fs.existsSync(path.join(f.root,'integration-started')),false); const report=JSON.parse(fs.readFileSync(path.join(f.root,'test-results/release.json'))); assert.equal(report.passed,false); assert.equal(report.stale,undefined); } finally { f.close(); }
});
test('a zero-exit browser process without a test report still blocks the release', () => {
  const f=fixture({report:false});try{assert.notEqual(f.run().status,0);assert.equal(JSON.parse(fs.readFileSync(path.join(f.root,'test-results/release.json'))).passed,false)}finally{f.close()}
});
test('all required successful suites produce a passing report and zero exit code', () => {
  const f=fixture();try{const result=f.run();assert.equal(result.status,0,result.stdout+result.stderr);const report=JSON.parse(fs.readFileSync(path.join(f.root,'test-results/release.json')));assert.equal(report.passed,true);assert.equal(report.suites.every(suite=>suite.passed),true)}finally{f.close()}
});
test('Android and iOS release builds invoke the gate without an ignore-failure path',()=>{
 const root=path.resolve(__dirname,'..');const gradle=fs.readFileSync(path.join(root,'android/app/release-tests.gradle'),'utf8');assert.match(gradle,/task\.dependsOn\(notesReleaseTests\)/);assert.match(gradle,/ignoreExitValue = false/);
 const ios=fs.readFileSync(path.join(root,'ios/App/App.xcodeproj/project.pbxproj'),'utf8');assert.match(ios,/scripts\/test-release\.cjs --platform ios/);assert.match(ios,/alwaysOutOfDate = 1/);
});
test('changing production source invalidates the runtime fingerprint while test-only changes do not',()=>{
 const {runtimeFingerprint}=require('./release-tests/source-fingerprint.cjs');const root=fs.mkdtempSync(path.join(os.tmpdir(),'notes-runtime-source-'));
 const write=(name,text)=>{fs.mkdirSync(path.dirname(path.join(root,name)),{recursive:true});fs.writeFileSync(path.join(root,name),text)};
 try{for(const file of ['package-lock.json','identity-runtime/package-lock.json','scripts/build-design-runtime.cjs','scripts/release-tests/source-fingerprint.cjs'])write(file,'fixture');write('src/runtime.ts','version one');const initial=runtimeFingerprint(root);write('src/runtime.spec.ts','new test');assert.equal(runtimeFingerprint(root),initial);write('src/runtime.ts','version two');assert.notEqual(runtimeFingerprint(root),initial)}finally{fs.rmSync(root,{recursive:true,force:true})}
});
test('the iOS Release build phase propagates failure while Debug does not run release tests',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../ios/App/App.xcodeproj/project.pbxproj'),'utf8');const block=source.slice(source.indexOf('/* Begin PBXShellScriptBuildPhase section */'));const script=JSON.parse(block.match(/shellScript = ("(?:[^"\\]|\\.)*");/)[1]);const root=fs.mkdtempSync(path.join(os.tmpdir(),'notes-ios-gate-'));
 try{fs.mkdirSync(path.join(root,'scripts'),{recursive:true});fs.mkdirSync(path.join(root,'ios/App'),{recursive:true});fs.writeFileSync(path.join(root,'scripts/test-release.cjs'),'process.exit(23)');const env={...process.env,SRCROOT:path.join(root,'ios/App'),STELLAR_NODE_BINARY:process.execPath,CONFIGURATION:'Release'};assert.equal(spawnSync('/bin/sh',['-c',script],{env}).status,23);assert.equal(spawnSync('/bin/sh',['-c',script],{env:{...env,CONFIGURATION:'Debug'}}).status,0)}finally{fs.rmSync(root,{recursive:true,force:true})}
});
test('invalid local configuration blocks the command and replaces any stale passing report',()=>{
 const f=fixture();try{fs.writeFileSync(path.join(f.root,'release-tests.local.json'),'{');assert.notEqual(f.run().status,0);assert.equal(JSON.parse(fs.readFileSync(path.join(f.root,'test-results/release.json'))).passed,false)}finally{f.close()}
});
