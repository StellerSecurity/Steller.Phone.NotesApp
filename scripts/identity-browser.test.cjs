'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os');
const {spawn}=require('node:child_process');const {randomBytes,createHash}=require('node:crypto');const readline=require('node:readline');const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
require(root+'/scripts/verify-identity-runtime.cjs')();
const opaque=require(root+'/identity-runtime/node_modules/@serenity-kit/opaque/cjs/index.js');
const api=process.env.STELLAR_USER_API_TEST_ROOT;const build=process.env.STELLAR_BROWSER_BUILD;const autoload=process.env.STELLAR_TEST_AUTOLOAD;
if(!api||!build||!autoload||process.env.STELLAR_BROWSER_TEST!=='1')throw new Error('Supply the isolated User API, reviewed autoloader and built HTML paths with STELLAR_BROWSER_TEST=1.');
let chrome,php,server,socket,appOrigin,closing=false;let checks=0;const wires=[],exceptions=[];const profile=fs.mkdtempSync(path.join(os.tmpdir(),'stellar-browser-e2e-'));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const verify=(condition,label)=>{assert.ok(condition,label);checks++;console.log('PASS '+label)};
const pending=[];let phpErrors='';
const rpc=(operation,body={})=>new Promise((resolve,reject)=>{pending.push({resolve,reject});php.stdin.write(JSON.stringify({operation,...body})+'\n')});
let serial=Promise.resolve();const request=(operation,body)=>{const result=serial.then(()=>rpc(operation,body));serial=result.catch(()=>{});return result};
let seq=0;const calls=new Map();
const call=(method,params={})=>new Promise((resolve,reject)=>{if(closing&&method!=='Browser.close')return reject(new Error('Browser test closed'));const id=++seq;const timer=setTimeout(()=>{calls.delete(id);reject(new Error('CDP timeout: '+method))},12000);calls.set(id,{resolve:value=>{clearTimeout(timer);resolve(value)},reject:error=>{clearTimeout(timer);reject(error)}});socket.send(JSON.stringify({id,method,params}))});
const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error('Browser evaluation failed: '+r.exceptionDetails.text);return r.result.value};
async function wait(expression,label,timeout=12000){const start=Date.now();while(Date.now()-start<timeout){if(await evaluate(expression))return;await delay(100)}throw new Error('Timed out: '+label)}
async function click(selector){await wait(`!!document.querySelector(${JSON.stringify(selector)})`,'button exists');await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center'})`);await delay(120);await wait(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return hit===e || e.contains(hit)})()`,'click target uncovered');const r=await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);await call('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...r});await call('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...r});}
async function input(selector,value){await wait(`!!document.querySelector(${JSON.stringify(selector)})`,'input exists');await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'center'});e.focus();e.select()})()`);await call('Input.insertText',{text:value})}
async function go(route){await call('Page.navigate',{url:appOrigin+route});await wait("document.querySelector('ion-router-outlet > :not(.ion-page-hidden) form') !== null",'page form');await delay(150)}
async function clearDevice(){await evaluate("localStorage.clear();sessionStorage.clear()");await call('Storage.clearDataForOrigin',{origin:appOrigin,storageTypes:'indexeddb,cache_storage'});}
async function paused(event){
 const {requestId,request:req}=event;const url=new URL(req.url);
 if(url.origin===appOrigin)return call('Fetch.continueRequest',{requestId});
 const headers=[{name:'Content-Type',value:'application/json'},{name:'Access-Control-Allow-Origin',value:appOrigin},{name:'Access-Control-Allow-Headers',value:'content-type,authorization'},{name:'Access-Control-Allow-Methods',value:'GET,POST,PATCH,OPTIONS'},{name:'Cache-Control',value:'no-store'}];
 let status=200,result={};
 try{
  if(req.method==='OPTIONS')status=204;
  else if(req.url==='https://stellaruserapiprod.azurewebsites.net/api/v2/auth/keys'){const r=await request('identityKeys');status=r.status;result=r.body}
  else if(url.hostname==='stellarprivatenotesuiappapiprod.stellarsecurity.com'){
   const body=req.postData?JSON.parse(req.postData):{};wires.push({path:url.pathname,body});
   if(url.pathname.startsWith('/api/v2/auth/')){
    const operation=url.pathname.slice('/api/v2/auth/'.length);
    if(operation==='method'){result=await request('loginMethod',{body});if(globalThis.tamper)result.signature=Buffer.alloc(64).toString('base64')}
    else if(operation==='start')result=await request('loginStart',{body});
    else if(operation==='finish')result=await request('loginFinish',{body});
    else if(operation==='logout')result=await request('logout',{token:body.token});
    else if(operation==='session')result=await request('inspect',{token:body.token});
    else if(operation.startsWith('account/')){const [,flow,step]=operation.split('/');result=await request(step,{flow,body})}
    else throw new Error('Unknown identity operation');
   }else if(url.pathname.endsWith('/notescontroller/download'))result={notes:[],folders:[],has_more:false,watermark:0};
   else if(url.pathname.endsWith('/notescontroller/upload'))result={response_code:200,acknowledged:[],notes:[],folders:[]};
   else if(url.pathname.endsWith('/notescontroller/sync-plan'))result={response_code:200,notes:[],folders:[],upload:[],download:[]};
   else if(url.pathname.endsWith('/logincontroller/auth'))result=await request('legacyLogin',{email:body.username,password:body.password});
   else if(url.pathname.endsWith('/logincontroller/updateEak')){const token=(req.headers.Authorization||req.headers.authorization||'').replace(/^Bearer /,'');const resolved=await request('resolveToken',{body:{token}});result=await request('legacyPatch',{id:resolved.body.accountId,token,envelope:body.eak})}
   else {status=503;result={error:'TEST_UNEXPECTED_ROUTE'}}
  }else{status=503;result={error:'TEST_NETWORK_BLOCKED'}}
 }catch(error){console.log('Fixture rejected:',url.pathname,error.message);status=401;result={error:'OPAQUE_REJECTED'}}
 await delay(100);
 return call('Fetch.fulfillRequest',{requestId,responseCode:status,responseHeaders:headers,body:Buffer.from(JSON.stringify(result)).toString('base64')});
}
(async()=>{
 php=spawn('php',['-d','allow_url_fopen=0','-d','zend.exception_ignore_args=1','-d','disable_functions=curl_exec,curl_multi_exec,fsockopen,pfsockopen,stream_socket_client,socket_connect,mail',api+'/tests/opaque-account-rpc.php'],{env:{PATH:process.env.PATH,STELLAR_RUNTIME_TEST:'1',STELLAR_TEST_AUTOLOAD:autoload},stdio:['pipe','pipe','pipe']});
 php.stderr.on('data',d=>phpErrors+=d);php.on('exit',code=>{for(const p of pending.splice(0))p.reject(new Error('Fixture exited '+code))});
 readline.createInterface({input:php.stdout}).on('line',line=>{const p=pending.shift();if(!p)return;try{const v=JSON.parse(line);v.ok?p.resolve(v.result):p.reject(new Error(v.error))}catch(e){p.reject(e)}});
 await opaque.ready;const setup=opaque.server.createSetup();await request('initialize',{node:process.execPath,setup,publicKey:opaque.server.getPublicKey(setup),realm:'https://id.stellarsecurity.com',storageKey:randomBytes(32).toString('base64')});
 server=http.createServer((req,res)=>{let file=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);if(file==='/assets/env.js'){res.writeHead(200,{'Content-Type':'text/javascript'});return res.end('window.env = {};')};let full=path.resolve(build,'.'+file);if(!full.startsWith(build+path.sep)||!fs.existsSync(full)||fs.statSync(full).isDirectory())full=build+'/index.html';const type={'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.ttf':'font/ttf'}[path.extname(full)]||'application/octet-stream';res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'});fs.createReadStream(full).pipe(res)});await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
 appOrigin='http://127.0.0.1:'+server.address().port;
 chrome=spawn(process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless','--disable-background-networking','--disable-component-update','--disable-sync','--disable-extensions','--no-first-run','--no-default-browser-check','--user-data-dir='+profile,'--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--window-size=430,932','about:blank'],{stdio:'ignore'});
 let tabs;for(let i=0;i<60;i++){try{const port=fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0];tabs=await(await fetch('http://127.0.0.1:'+port+'/json')).json();break}catch{await delay(100)}}const tab=tabs.find(t=>t.type==='page');socket=new WebSocket(tab.webSocketDebuggerUrl);await new Promise(r=>socket.onopen=r);
 socket.onmessage=e=>{const v=JSON.parse(e.data);if(v.id){const p=calls.get(v.id);calls.delete(v.id);if(p)v.error?p.reject(v.error):p.resolve(v.result)}else if(v.method==='Fetch.requestPaused')paused(v.params).catch(e=>{if(!closing&&!String(e.message).includes('Invalid InterceptionId'))console.error('Transport test failed:',e.message)});else if(v.method==='Runtime.exceptionThrown')exceptions.push(v.params.exceptionDetails.text)};
 await call('Runtime.enable');await call('Page.enable');await call('Network.enable');await call('Fetch.enable',{patterns:[{urlPattern:'http*',requestStage:'Request'}]});
 await call('Emulation.setDeviceMetricsOverride',{width:430,height:932,deviceScaleFactor:1,mobile:true});
 await call('Page.addScriptToEvaluateOnNewDocument',{source:"window.WebSocket = class {constructor(){throw new Error('WebSockets disabled in isolated browser test')}};"});
 await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'dark'}]});
 await go('/profile/recover');
 verify(await evaluate("!document.body.classList.contains('stellar-dark-theme')"),'fresh installation stays light despite dark system preference');
 verify(await evaluate("document.querySelector('h1').textContent.includes('Recover')"),'recovery screen renders');
 verify(await evaluate("document.documentElement.scrollWidth <= innerWidth"),'recovery fits mobile viewport');
 await click('app-identity-security ion-button[type=submit]');verify(await evaluate("document.querySelector('#recovery-email').classList.contains('ng-touched')"),'empty recovery validates fields');
 await input('#recovery-password','Cobalt!Ridge-47-Qs');await click('.password-field button');verify(await evaluate("document.querySelector('#recovery-password').type==='text'"),'password visibility toggles');
 await click('.password-field button');const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,fromSurface:true});fs.writeFileSync(path.join(os.tmpdir(),'stellar-browser-recovery.png'),Buffer.from(shot.data,'base64'));
 await go('/profile/create-account');await input('ion-input[formcontrolname=email] input','browser-new@example.invalid');await input('ion-input[formcontrolname=password] input','Cobalt!Ridge-47-Qs');await click('ion-checkbox');await click('.create-button');
 verify(await evaluate("!!document.querySelector('.create-button ion-spinner')"),'registration shows loading');await wait("location.pathname==='/profile/security' && !!document.querySelector('textarea.code')",'registration and recovery code',20000);
 const code=await evaluate("document.querySelector('textarea.code').value");verify(/^STELLAR1\./.test(code),'real registration creates recovery code');
 const readRoot=()=>evaluate("atob(localStorage.getItem('cap_sec_ssEakB64'))");const rootHash=createHash('sha256').update(await readRoot()).digest('hex');
 verify(await evaluate("JSON.parse(atob(localStorage.getItem('cap_sec_ssUser'))).auth_version===2"),'browser persists protected account');
 const secretBodies=JSON.stringify(wires);verify(!secretBodies.includes('Cobalt!Ridge-47-Qs'),'protected password absent from all requests');
 await clearDevice();await go('/profile/login');await input('ion-input[formcontrolname=email] input','browser-new@example.invalid');await input('ion-input[formcontrolname=password] input','wrong-synthetic-password');await click('.login-button');
 verify(await evaluate("!!document.querySelector('.login-button ion-spinner')"),'login shows loading');await wait("!document.querySelector('.login-button ion-spinner')",'failed login ends loading');verify(await evaluate("location.pathname==='/profile/login'"),'wrong password stays at login');verify(!wires.some(w=>w.path.endsWith('/logincontroller/auth')),'wrong protected password never falls back to legacy');
 await input('ion-input[formcontrolname=password] input','Cobalt!Ridge-47-Qs');await click('.login-button');await wait("location.pathname==='/'",'new device login',20000);verify(createHash('sha256').update(await readRoot()).digest('hex')===rootHash,'new device browser login retains Notes root');
 await clearDevice();await go('/profile/recover');await input('#recovery-email','browser-new@example.invalid');await input('#recovery-code',code);await input('#recovery-password','Marble!Delta-82-Rv');await click('app-identity-security ion-button[type=submit]');await wait("location.pathname==='/'",'lost device recovery',20000);verify(createHash('sha256').update(await readRoot()).digest('hex')===rootHash,'browser recovery preserves Notes root');
 await call('Page.navigate',{url:appOrigin+'/profile'});await wait("!!document.querySelector('.action-item-logout')",'profile logout');
 await click('.action-item-logout');await wait("!!document.querySelector('ion-modal.show-modal .close')",'logout dialog');
 verify(await evaluate("(()=>{const e=document.querySelector('ion-modal.show-modal .close'),r=e.getBoundingClientRect();return r.width>=44&&r.height>=44&&!!e.getAttribute('aria-label')})()"),'modal has accessible 44px close control');
 await click('ion-modal.show-modal .close');await wait("!document.querySelector('ion-modal.show-modal')",'X closes modal');verify(true,'X dismisses without logout');
 await click('.action-item-logout');await wait("!!document.querySelector('ion-modal.show-modal .close')",'logout reopen');await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await wait("!document.querySelector('ion-modal.show-modal')",'Escape dismisses modal');verify(true,'Escape dismisses account confirmation');
 await click('.action-item-logout');await wait("!!document.querySelector('ion-modal.show-modal .close')",'logout reopen');await delay(350);await call('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,x:5,y:20});await call('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:5,y:20});await wait("!document.querySelector('ion-modal.show-modal')",'outside tap dismisses modal');verify(true,'outside tap dismisses account confirmation');verify(await evaluate("location.pathname==='/profile'&&!!localStorage.getItem('cap_sec_ssToken')&&!!localStorage.getItem('cap_sec_ssEakB64')"),'dismissing confirmation keeps session and local key');
 await clearDevice();globalThis.tamper=true;await go('/profile/login');await input('ion-input[formcontrolname=email] input','browser-new@example.invalid');await input('ion-input[formcontrolname=password] input','Marble!Delta-82-Rv');const before=wires.length;await click('.login-button');await wait("!document.querySelector('.login-button ion-spinner')",'tampered signature ends loading');verify(wires.slice(before).length===1&&wires[before].path.endsWith('/auth/method'),'tampered signature stops before any password/proof request');globalThis.tamper=false;
 await go('/profile/forgot-password');await input('ion-input input','browser-new@example.invalid');await click('.confirm-button');await wait("location.pathname==='/profile/recover'",'protected forgot password route');verify(true,'forgot password opens protected recovery');
 for(const width of [360,768,1280]){await call('Emulation.setDeviceMetricsOverride',{width,height:932,deviceScaleFactor:1,mobile:width<768});verify(await evaluate('document.documentElement.scrollWidth <= innerWidth'),'recovery has no horizontal overflow at '+width)}
 await clearDevice();await go('/profile/login');await input('ion-input[formcontrolname=email] input','preexisting@example.invalid');await input('ion-input[formcontrolname=password] input','preexisting-password');await click('.login-button');await wait("location.pathname==='/'",'legacy browser login',20000);verify(await evaluate("atob(localStorage.getItem('cap_sec_ssAuthVersion'))==='1'"),'existing account retains legacy login');
 verify(!wires.some(w=>JSON.stringify(w.body).includes(code.split('.')[2])),'recovery secret absent from network');verify(exceptions.length===0,'no uncaught browser exceptions');verify(phpErrors==='','no fixture errors');
 console.log('PASS: '+checks+' browser E2E checks; real HTML, browser WASM and local synthetic User API. No production requests.');
})().catch(async error=>{console.error('FAIL:',error.message);try{console.log('Diagnostic:',JSON.stringify(await evaluate("({url:location.pathname,toasts:[...document.querySelectorAll('ion-toast')].map(e=>e.message),buttons:[...document.querySelectorAll('ion-button')].map(e=>({text:e.textContent.trim(),disabled:e.disabled})),spinners:document.querySelectorAll('ion-spinner').length})")));console.log('Paths:',JSON.stringify(wires.map(w=>w.path)));}catch{}process.exitCode=1}).finally(async()=>{closing=true;for(const p of calls.values())p.reject(new Error('Browser test closed'));calls.clear();if(socket){try{await call('Browser.close')}catch{}socket.close()}if(chrome)chrome.kill();if(php)php.stdin.end();if(server)server.close();setTimeout(()=>{try{fs.rmSync(profile,{recursive:true,force:true})}catch{}},300).unref()});
