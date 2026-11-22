'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const path=require('node:path');

test('encrypted recovery export interoperates with support reader and preserves source data',()=>{
  const result=spawnSync(process.platform==='win32'?'python':'python3',
    ['-B',path.join(__dirname,'recovery/test-recovery.py')],
    {encoding:'utf8',timeout:120000,env:{...process.env,STELLAR_RECOVERY_TEST_NODE:process.execPath}});
  assert.equal(result.error,undefined,'Existing Python and JDK are required; no tools are downloaded.');
  assert.equal(result.status,0,result.stdout+'\n'+result.stderr);
});

test('compiled recovery safety check rejects network, background and normal-startup regressions',()=>{
  const {validate}=require('./recovery/verify-recovery-apk.cjs');
  const badging="package: name='steller.phone.notesapp' versionName='2.92-recovery'\nlaunchable-activity: name='Steller.Phone.NotesApp.RecoveryActivity'";
  const xml='\n E: activity (line=1)\n A: android:name="Steller.Phone.NotesApp.MainActivity"\n A: android:enabled=(type 0x12)0x0';
  assert.doesNotThrow(()=>validate('',badging,xml));
  assert.throws(()=>validate("uses-permission: name='android.permission.INTERNET'",badging,xml));
  assert.throws(()=>validate('',badging,xml+'\n E: service (line=2)'));
  assert.throws(()=>validate('',badging,xml.replace('0x0','0xffffffff')));
  assert.throws(()=>validate('',badging.replace('RecoveryActivity','MainActivity'),xml));
});
