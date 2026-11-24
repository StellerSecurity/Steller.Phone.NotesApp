'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const vm=require('node:vm');
const {pathToFileURL}=require('node:url');

test('Vite virtual-module IDs remain data and cannot execute injected expressions',async()=>{
  const {createServer}=await import(pathToFileURL(require.resolve('vite')).href);
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'stellar-vite-virtual-'));
  const server=await createServer({root,configFile:false,envFile:false,appType:'custom',
    server:{watch:null,hmr:false},optimizeDeps:{noDiscovery:true,include:[]},logLevel:'silent'});
  try {
    const payloads=['${globalThis.__stellarInjected=1}', '`;globalThis.__stellarInjected=2;//', '";globalThis.__stellarInjected=3;//', 'line\n${globalThis.__stellarInjected=4}'];
    for(const prefix of ['__vite-browser-external:','__vite-optional-peer-dep:']){
      for(const payload of payloads){
        const id=prefix+payload+(prefix.includes('optional')?':fixture-parent':'');
        const result=await server.environments.client.pluginContainer.load(id);
        const code=typeof result==='string'?result:result?.code;
        assert.equal(typeof code,'string','Expected virtual module code');
        const converted=require('esbuild').transformSync(code,{format:'cjs',loader:'js'}).code;
        const context=vm.createContext({__stellarInjected:0,module:{exports:{}},exports:{}});
        let thrown;
        try {
          vm.runInContext(converted,context,{timeout:1000});
          if(prefix.includes('browser'))context.module.exports.default.arbitraryProperty;
        }catch(error){thrown=error;}
        assert.equal(context.__stellarInjected,0,'Virtual module ID executed as JavaScript');
        assert.ok(thrown,'A diagnostic must still be thrown for the unsupported import');
        assert.ok(thrown.message.includes(payload),'Diagnostic must retain the import text');
      }
    }
  }finally{await server.close();fs.rmSync(root,{recursive:true,force:true});}
});
