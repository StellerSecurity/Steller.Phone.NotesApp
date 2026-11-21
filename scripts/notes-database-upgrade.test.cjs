'use strict';
const { test }=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const file=path.resolve(__dirname,'../src/runtime/notes-database.ts'),mod=new Module(file,module);mod.filename=file;mod.paths=module.paths;
const original=mod.require.bind(mod);mod.require=name=>name==='@ionic/storage'?{Drivers:{IndexedDB:'asyncStorage',LocalStorage:'localStorageWrapper'}}:original(name);
mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,file);
const {openNotesDatabase}=mod.exports;
const clone=value=>value==null?value:structuredClone(value);
class DB{constructor(values={}){this.data=new Map(Object.entries(values));this.writes=[];this.failAfter=Infinity}async create(){}async keys(){return [...this.data.keys()]}async get(k){return clone(this.data.get(k)??null)}async set(k,v){if(this.writes.length===this.failAfter){this.failAfter=Infinity;throw Error('disk full')}this.writes.push(k);this.data.set(k,clone(v))}}
function fixture(old={},preview={},raw={}){const a=new DB(old),b=new DB(preview),factory=name=>name==='__stellar_notes'?a:b,legacy={getItem:k=>raw[k]??null};return {a,b,open:()=>openNotesDatabase(factory,legacy)}}
const payload={notes:'[{"id":"offline-1","title":"Only on phone","text":"å æ ø ✓","deleted":false}]',folders:'[{"id":"folder-1","name":"Offline folder"}]','notes.sync.outbox.v1':[{opId:'pending-1',payload:{notes:[{id:'offline-1',text:'ciphertext'}]},attempt:3,nextAt:9999999999999}],app_password_challenge:'protected-challenge',failedAttemptsApp:'2',clipboard_auto_clear_seconds:'30'};
test('published database is reused byte-for-byte, including locked offline content and outbox',async()=>{const f=fixture(payload);const before=await Promise.all((await f.a.keys()).map(async k=>[k,await f.a.get(k)]));assert.equal(await f.open(),f.a);assert.deepEqual(await Promise.all((await f.a.keys()).map(async k=>[k,await f.a.get(k)])),before);assert.equal(f.a.writes.length,0)});
test('preview import copies every key, verifies writes, and leaves the source intact',async()=>{const f=fixture({},payload);await f.open();for(const [k,v]of Object.entries(payload)){assert.deepEqual(await f.a.get(k),v);assert.deepEqual(await f.b.get(k),v)}assert.equal((await f.a.get('notes.design.database-import.v1')).state,'complete');const count=f.a.writes.length;await f.open();assert.equal(f.a.writes.length,count)});
test('interrupted import resumes without deleting either copy',async()=>{const f=fixture({},payload);f.a.failAfter=3;await assert.rejects(()=>f.open(),/disk full/);for(const [k,v]of Object.entries(payload))assert.deepEqual(await f.b.get(k),v);await f.open();for(const [k,v]of Object.entries(payload))assert.deepEqual(await f.a.get(k),v)});
test('distinct populated databases fail closed instead of overwriting offline notes',async()=>{const f=fixture({notes:'[{"id":"old"}]'},payload);await assert.rejects(()=>f.open(),/ImportConflict/);assert.equal(f.a.writes.length,0);assert.equal(await f.a.get('notes'),'[{"id":"old"}]')});
test('raw localStorage notes are not hidden by preview import',async()=>{const f=fixture({},payload,{notes:'[{"id":"raw"}]'});await assert.rejects(()=>f.open(),/ImportConflict/);assert.equal(f.a.writes.length,0)});
test('source changes during an interrupted import are detected',async()=>{const f=fixture({},payload);f.a.failAfter=2;await assert.rejects(()=>f.open());await f.b.set('notes','[{"id":"changed"}]');await assert.rejects(()=>f.open(),/ImportConflict/);assert.equal((await f.a.get('notes.design.database-import.v1')).state,'copying')});
const vm=require('node:vm');
function preferenceFixture(){
 const source=fs.readFileSync(path.resolve(__dirname,'../src/runtime/notes-design-runtime.ts'),'utf8'),start=source.indexOf('    async preferences(value?: any) {'),end=source.indexOf('    dispose()',start);
 const compiled=ts.transpileModule('exports.preferences = {\n'+source.slice(start,end)+'\n}.preferences;',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const values={autoLock:5,wipe:7,privacy:true,clipboard:0};
 const state={getAppLockTimeoutMinutes:()=>values.autoLock,getAppWipeAfterDays:()=>values.wipe,isPrivacyModeEnabled:()=>values.privacy,getClipboardAutoClearSeconds:()=>values.clipboard,appHasPasswordChallenge:()=>true,setAppLockTimeoutMinutes:v=>values.autoLock=v,setAppWipeAfterDays:v=>values.wipe=v,setPrivacyModeEnabled:v=>values.privacy=v,setClipboardAutoClearSeconds:v=>values.clipboard=v,flushPersistence:async()=>{}};
 const disk=new DB({'ssAppearanceMode':'dark','notes.design.preferences.v1':{autoLock:60,wipe:0,privacy:false,clipboard:30,appearance:'light'}}),context={exports:{},state,disk,initialPreferences:Promise.all([disk.get('notes.design.preferences.v1'),disk.get('ssAppearanceMode')]),biometric:{available:false,enabled:false,status:-1},capabilities:{},biometricStatus:async()=>({available:false,enabled:false,status:-1})};vm.runInNewContext(compiled,context);return {preferences:context.exports.preferences,values};
}
test('published security and appearance preferences override stale preview defaults',async()=>{const f=preferenceFixture(),p=await f.preferences();assert.equal(p.autoLock,5);assert.equal(p.wipe,7);assert.equal(p.privacy,true);assert.equal(p.clipboard,0);assert.equal(p.appearance,'dark')});
test('updating appearance alone does not reset old retention, privacy or lock settings',async()=>{const f=preferenceFixture();await f.preferences({appearance:'light'});assert.deepEqual(f.values,{autoLock:5,wipe:7,privacy:true,clipboard:0});assert.equal((await f.preferences()).appearance,'light')});

test('preview database imports when legacy localStorage is its identical safety mirror',async()=>{const f=fixture({},payload,{notes:payload.notes,folders:payload.folders});await f.open();for(const [key,value]of Object.entries(payload)){assert.deepEqual(await f.a.get(key),value);assert.deepEqual(await f.b.get(key),value)}assert.equal((await f.a.get('notes.design.database-import.v1')).state,'complete')});
test('matching notes do not hide a conflicting legacy folder or lock entry',async()=>{for(const raw of [{notes:payload.notes,folders:'[{"id":"different-folder"}]'},{notes:payload.notes,app_password_challenge:'different-lock'}]){const f=fixture({},payload,raw);await assert.rejects(()=>f.open(),/ImportConflict/);assert.equal(f.a.writes.length,0)}});

function localStorageFixture(canonical={}, raw={}) {
 const file=path.resolve(__dirname,'../src/app/services/notes-storage.service.ts'),serviceModule=new Module(file,module);
 serviceModule.filename=file;serviceModule.paths=module.paths;
 serviceModule.require=name=>name==='@angular/core'?{Injectable:()=>type=>type}:name==='rxjs'?{BehaviorSubject:class{constructor(value){this.value=value}next(value){this.value=value}}}:name==='@ionic/storage-angular'?{}:require(name);
 serviceModule._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,experimentalDecorators:true}}).outputText,file);
 const db=new DB(canonical),source={...raw};
 const context={getItem:key=>source[key]??null,setItem:(key,value)=>source[key]=value,removeItem:key=>delete source[key]};
 // Keep each service's localStorage binding isolated without touching browser data.
 const previous=global.localStorage;global.localStorage=context;
 const service=new serviceModule.exports.NotesStorageService(db);
 return {db,source,service,restore:()=>{if(previous===undefined)delete global.localStorage;else global.localStorage=previous}};
}
test('raw guest migration verifies the import and keeps original bytes and empty lines in localStorage',async()=>{
 const notes='[{"id":"old","text":"<p>First</p><p><br></p><p>Last</p>"}]';const f=localStorageFixture({}, {notes});
 try{await f.service.init();assert.equal(f.service.getNotesRaw(),notes);assert.equal(f.source.notes,notes);assert.equal(await f.db.get('storage_migration_version'),'1')}finally{f.restore()}
});
test('raw locked migration keeps ciphertext and password challenge together without adding folders',async()=>{
 const f=localStorageFixture({}, {notes:'original-encrypted-bytes',app_password_challenge:'1'});
 try{await f.service.init();assert.equal(f.service.getNotesRaw(),'original-encrypted-bytes');assert.equal(f.service.getAppPasswordChallengeFlag(),'1');assert.equal(f.service.getFoldersRaw(),'[]');assert.equal(await f.db.get('folders'),null);assert.equal(f.source.notes,'original-encrypted-bytes')}finally{f.restore()}
});
test('distinct canonical and raw notes fail closed without replacing either copy',async()=>{
 const f=localStorageFixture({notes:'canonical-note'}, {notes:'different-raw-note'});
 try{await assert.rejects(()=>f.service.init(),/notesStorageImportConflict/);assert.equal(await f.db.get('notes'),'canonical-note');assert.equal(f.source.notes,'different-raw-note');assert.equal(f.db.writes.length,0)}finally{f.restore()}
});
test('failed import leaves the original source intact and never marks completion',async()=>{
 const f=localStorageFixture({}, {notes:'offline-only'});f.db.failAfter=0;
 try{await assert.rejects(()=>f.service.init(),/disk full/);assert.equal(f.source.notes,'offline-only');assert.equal(await f.db.get('notes'),null);assert.equal(await f.db.get('storage_migration_version'),null)}finally{f.restore()}
});
test('silent failed writes cannot mark an incomplete migration complete',async()=>{
 const f=localStorageFixture({}, {notes:'offline-only'}),set=f.db.set.bind(f.db);f.db.set=async(k,v)=>{if(k!=='notes')await set(k,v)};
 try{await assert.rejects(()=>f.service.init(),/notesStorageImportIncomplete/);assert.equal(f.source.notes,'offline-only');assert.equal(await f.db.get('storage_migration_version'),null);assert.equal(await f.db.get('notes'),null)}finally{f.restore()}
});
test('an unreadable legacy store is not recorded as an empty completed migration',async()=>{
 const f=localStorageFixture({}, {notes:'offline-only'});global.localStorage.getItem=()=>{throw Error('access denied')};
 try{await assert.rejects(()=>f.service.init(),/notesStorageUnavailable/);assert.equal(await f.db.get('storage_migration_version'),null);assert.equal(f.db.writes.length,0);assert.equal(f.source.notes,'offline-only')}finally{f.restore()}
});
test('interrupted raw import retries missing keys while preserving both original values',async()=>{
 const f=localStorageFixture({}, {notes:'encrypted-notes',folders:'encrypted-folders',app_password_challenge:'1'});f.db.failAfter=1;
 try{await assert.rejects(()=>f.service.init(),/disk full/);assert.equal(await f.db.get('storage_migration_version'),null);const retry=new f.service.constructor(f.db);await retry.init();assert.equal(retry.getNotesRaw(),'encrypted-notes');assert.equal(retry.getFoldersRaw(),'encrypted-folders');assert.equal(retry.getAppPasswordChallengeFlag(),'1');assert.equal(f.source.notes,'encrypted-notes');assert.equal(f.source.folders,'encrypted-folders')}finally{f.restore()}
});
test('conflicting folder or app-code metadata cannot be combined with matching notes',async()=>{
 for(const canonical of [{notes:'same-notes',folders:'canonical-folders'},{notes:'same-notes',app_password_challenge:'other-flag'}]){
  const f=localStorageFixture(canonical,{notes:'same-notes',folders:'raw-folders',app_password_challenge:'1'});
  try{await assert.rejects(()=>f.service.init(),/notesStorageImportConflict/);assert.equal(f.db.writes.length,0);assert.equal(f.source.folders,'raw-folders');assert.equal(f.source.app_password_challenge,'1')}finally{f.restore()}
 }
});
