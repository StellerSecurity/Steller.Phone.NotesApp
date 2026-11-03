'use strict';
require('./verify-identity-runtime.cjs')();
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
const {spawn}=require('node:child_process');
const readline=require('node:readline');
const {randomBytes,webcrypto}=require('node:crypto');
const ts=require('typescript');
if(!globalThis.crypto)Object.defineProperty(globalThis,'crypto',{value:webcrypto});
const file=path.resolve(__dirname,'../src/app/utils/stellar-id-client.ts');
const compiled=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const moduleInstance=new Module(file,module);moduleInstance.filename=file;moduleInstance.paths=module.paths;moduleInstance._compile(compiled,file);
const {StellarIdClient}=moduleInstance.exports;
const opaque=require('../identity-runtime/node_modules/@serenity-kit/opaque/cjs/index.js');
const api=process.env.STELLAR_USER_API_TEST_ROOT;
if(!api||!process.env.STELLAR_TEST_AUTOLOAD)throw new Error('Supply reviewed User API fixture and isolated autoloader paths.');
const child=spawn(process.env.STELLAR_TEST_PHP||'php',['-d','allow_url_fopen=0','-d','zend.exception_ignore_args=1','-d','disable_functions=curl_exec,curl_multi_exec,fsockopen,pfsockopen,stream_socket_client,socket_connect,mail',path.join(api,'tests/opaque-account-rpc.php')],{env:{PATH:process.env.PATH,STELLAR_RUNTIME_TEST:'1',STELLAR_TEST_AUTOLOAD:process.env.STELLAR_TEST_AUTOLOAD},stdio:['pipe','pipe','pipe']});
const pending=[];let stderr='',exited=false,checks=0;
child.stderr.on('data',data=>stderr+=data);
child.on('exit',code=>{exited=true;if(code!==0)process.exitCode=1;for(const p of pending.splice(0))p.reject(new Error('Fixture exit '+code));});
readline.createInterface({input:child.stdout}).on('line',line=>{const p=pending.shift();if(!p)throw new Error('Unexpected fixture output');try{p.resolve(JSON.parse(line));}catch{p.reject(new Error('Malformed fixture output'));}});
const check=(actual,expected,label)=>{assert.deepEqual(actual,expected,label);checks++;};
const request=(operation,body={})=>new Promise((resolve,reject)=>{if(exited)return reject(new Error('Fixture closed'));pending.push({resolve,reject});child.stdin.write(JSON.stringify({operation,...body})+'\n');});
async function rpc(operation,body={}){const r=await request(operation,body);assert.equal(r.ok,true,r.error);return r.result;}
const wires=[];
async function transport(operation,body){
 wires.push({operation,body:structuredClone(body)});
 if(operation==='method')return rpc('loginMethod',{body});
 if(operation==='start')return rpc('loginStart',{body});
 if(operation==='finish')return rpc('loginFinish',{body});
 if(operation==='logout')return rpc('logout',{token:body.token});
 if(operation.startsWith('account/')){const [,flow,step]=operation.split('/');return rpc(step,{flow,body});}
 throw new Error('Unexpected transport operation');
}
async function reject(work,label){await assert.rejects(work);checks++;}
const deadline=setTimeout(()=>{child.kill();throw new Error('Identity protocol test deadline');},180000);
(async()=>{
 await opaque.ready;
 const realm='https://id.stellarsecurity.com';
 const setup=opaque.server.createSetup();
 const opaqueKey=opaque.server.getPublicKey(setup);
 await rpc('initialize',{node:process.execPath,setup,publicKey:opaqueKey,realm,storageKey:randomBytes(32).toString('base64')});
 const methodKey=await rpc('methodKey');
 const pins={issuer:realm,methodKey,opaqueKey};
 const client=new StellarIdClient(pins,transport,async()=>opaque);
 check(await client.method('preexisting@example.invalid'),'legacy','existing account selects legacy');
 check(await client.method('unknown@example.invalid'),'opaque','unknown account never requests plaintext password');
 await reject(()=>client.method('preexisting@example.invalid',true),'a known protected device cannot downgrade');
 const root=new Uint8Array(randomBytes(32));
 const first='synthetic-first-password',second='synthetic-second-password',third='synthetic-recovered-password';
 const account=await client.register('new-mobile@example.invalid',first,root);
 check(Object.hasOwn(account,'root'),false,'account result never exposes the root key');
 check(await client.method('new-mobile@example.invalid'),'opaque','new account selects OPAQUE');
 const resolvedLegacy=await rpc('legacyCreate',{email:'legacy-mobile@example.invalid',password:'synthetic-legacy-password'});
 const legacyToken=await rpc('resolveToken',{body:{token:resolvedLegacy.token}});
 check(legacyToken.status,200,'new token endpoint supports existing scoped tokens');
 check(legacyToken.body.authVersion,1,'legacy token remains legacy');
 let session=await client.login('new-mobile@example.invalid',first);
 check(session.rootKey,root,'new device opens the same notes key');
 const identity=await rpc('resolveToken',{body:{token:session.token}});
 check(identity.status,200,'OPAQUE session can authorize Notes without a token in a URL');
 check(identity.body.authVersion,2,'OPAQUE session remains protected');
 check(identity.body.accountId,account.accountId,'identity owner is authoritative');
 const code=await client.setupRecovery(session,first);
 check(/^STELLAR1\.[1-9][0-9]*\.[A-Za-z0-9_-]{43}$/.test(code),true,'recovery code format');
 const beforeChange=session.token;
 session=await client.changePassword(session,first,second);
 check(session.rootKey,root,'password change preserves all notes keys');
 check((await rpc('resolveToken',{body:{token:beforeChange}})).status,401,'password change revokes previous session');
 await reject(()=>client.login('new-mobile@example.invalid',first),'old password cannot authenticate');
 session=await client.recover('new-mobile@example.invalid',code,third);
 check(session.rootKey,root,'lost-device recovery preserves notes keys');
 await reject(()=>client.recover('other-mobile@example.invalid',code,third),'recovery is bound to the intended email/account');
 await reject(()=>client.recover('new-mobile@example.invalid','STELLAR1.0.bad',third),'malformed recovery code rejected before requests');
 const secrets=[first,second,third,code.split('.')[2],Buffer.from(root).toString('base64')];
 for(const secret of secrets)check(JSON.stringify(wires).includes(secret),false,'passwords, recovery secret and root never enter transport');
 const signed=wires.filter(x=>x.operation==='method');
 check(new Set(signed.map(x=>x.body.nonce)).size,signed.length,'each method query uses a fresh nonce');
 for(const mutation of ['signature','payload','nonce','extra','replay']){
  let oldResponse;
  const hostile=new StellarIdClient(pins,async(operation,body)=>{
   assert.equal(operation,'method');
   let response=await transport(operation,body);
   if(mutation==='signature')response={...response,signature:Buffer.alloc(64).toString('base64')};
   else if(mutation==='extra')response={...response,password:'unexpected'};
   else if(mutation==='replay'){oldResponse??=response;response=oldResponse;}
   else if(mutation==='payload')response={...response,payload:Buffer.from('altered').toString('base64')};
   else {
    // A valid signature for a different nonce/issuer/time must still be rejected.
    if(mutation==='nonce')response=await transport('method',{...body,nonce:randomBytes(32).toString('base64url')});
   }
   return response;
  },async()=>opaque);
  if(mutation==='replay')await hostile.method('preexisting@example.invalid');
  await reject(()=>hostile.method('preexisting@example.invalid'),'hostile method response rejected: '+mutation);
 }
 await reject(()=>new StellarIdClient({...pins,issuer:'https://other.example.invalid'},transport,async()=>opaque).method('preexisting@example.invalid'),'signed issuer must match trusted issuer');
 await reject(()=>new StellarIdClient(pins,transport,async()=>opaque,()=>Date.now()+600000).method('preexisting@example.invalid'),'expired signed method rejected');
 const metadata=await rpc('identityKeys');
 check(metadata.status,200,'public key metadata available');
 check(metadata.body,{version:1,...pins},'public metadata exposes only the expected public keys');
 check((await rpc('methodHttp',{body:{email:'preexisting@example.invalid',nonce:randomBytes(32).toString('base64url'),password:'forbidden'}})).status,401,'method rejects password fields');
 const badPin=new StellarIdClient({...pins,opaqueKey:'incorrect-key'},transport,async()=>opaque);
 await reject(()=>badPin.login('new-mobile@example.invalid',third),'wrong OPAQUE server key rejected');
 const tokenBeforeDeletion=session.token;
 await client.removeAccount(session,third);
 check(await rpc('user',{id:account.accountId}),null,'protected account deletion is complete');
 check((await rpc('resolveToken',{body:{token:tokenBeforeDeletion}})).status,401,'deleted session is invalid');
 const methodHttp=await rpc('methodHttp',{body:{email:'preexisting@example.invalid',nonce:randomBytes(32).toString('base64url')}});
 check(methodHttp.status,200,'method endpoint HTTP success');check(methodHttp.cacheControl.includes('no-store'),true,'signed method response cannot be cached');
 await rpc('flags',{login:false,accounts:false,enrollment:false});
 check((await rpc('methodHttp',{body:{email:'preexisting@example.invalid',nonce:randomBytes(32).toString('base64url')}})).status,503,'disabled method never falls back');
 check((await rpc('resolveToken',{body:{token:resolvedLegacy.token}})).status,200,'OPAQUE disablement does not break old token validation');
 check(stderr,'','no secrets/errors on stderr');
 console.log(`PASS: ${checks} mobile identity protocol checks; real OPAQUE/WebCrypto, signed method selection, User API controllers and synthetic SQLite accounts.`);
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{clearTimeout(deadline);child.stdin.end();});
