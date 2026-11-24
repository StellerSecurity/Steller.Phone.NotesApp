'use strict';
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
function validate(permissions,badging,xml){
  if(permissions.includes("name='android.permission.INTERNET'")) throw Error('Recovery must not have network permission');
  if(!badging.includes("package: name='steller.phone.notesapp'")||!badging.includes("versionName='2.92-recovery'")) throw Error('Wrong recovery package/version');
  if(!badging.includes("launchable-activity: name='Steller.Phone.NotesApp.RecoveryActivity'")) throw Error('Recovery must be the launcher');
  if(/\n\s*E: (provider|service|receiver|activity-alias)\b/.test(xml)) throw Error('Recovery must not have automatic startup/background components');
  const main=xml.split(/\n\s*E: activity \(/).find(s=>s.includes('"Steller.Phone.NotesApp.MainActivity"'));
  if(!main||!/android:enabled[^\n]*\(type 0x12\)0x0\b/.test(main)) throw Error('Normal WebView activity must be disabled');
}
if(require.main===module){
  try{
    const [aapt,dir]=process.argv.slice(2);
    const metadata=JSON.parse(fs.readFileSync(path.join(dir,'output-metadata.json')));
    if(metadata.elements.length!==1) throw Error('Expected one universal recovery APK');
    const name=metadata.elements[0].outputFile;
    if(name!==path.basename(name)||!name.endsWith('.apk'))throw Error('Unsafe APK path');
    const apk=path.join(dir,name),run=(...args)=>execFileSync(aapt,args,{encoding:'utf8',maxBuffer:4*1024*1024});
    validate(run('dump','permissions',apk),run('dump','badging',apk),run('dump','xmltree',apk,'AndroidManifest.xml'));
    console.log('Compiled recovery APK verified: native launcher, normal activity disabled, no networking or background components.');
  }catch(e){console.error(e.message);process.exitCode=1;}
}
module.exports={validate};
