'use strict';
// Offline only. Never uploads, executes exported files, or prints note contents.
const fs=require('node:fs'),crypto=require('node:crypto');
const [keyFile,input,output]=process.argv.slice(2);
try {
  if(!keyFile||!input||!output) throw Error('Usage: node decrypt-recovery.cjs SUPPORT_PRIVATE_KEY INPUT.stnrecovery NEW_OUTPUT.zip');
  if(fs.statSync(input).size>270*1024*1024) throw Error('Export too large');
  const data=fs.readFileSync(input);
  if(data.length<29||data.subarray(0,8).toString()!=='STNREC01') throw Error('Invalid export');
  const size=data.readUInt32BE(8),end=12+size;
  if(size>4096||end+16>data.length) throw Error('Invalid header length');
  const h=JSON.parse(data.subarray(12,end));
  if(h.version!==1||h.algorithm!=='RSA-OAEP-SHA256+AES-256-GCM'||!/^[a-f0-9]{768}$/.test(h.wrappedKeyHex)||!/^[a-f0-9]{24}$/.test(h.ivHex)) throw Error('Unsupported export');
  const privateKey=crypto.createPrivateKey(fs.readFileSync(keyFile));
  const pub=crypto.createPublicKey(privateKey).export({format:'der',type:'spki'});
  if(crypto.createHash('sha256').update(pub).digest('hex')!==h.keyId) throw Error('Wrong support key');
  const key=crypto.privateDecrypt({key:privateKey,oaepHash:'sha256',padding:crypto.constants.RSA_PKCS1_OAEP_PADDING},Buffer.from(h.wrappedKeyHex,'hex'));
  try {
    const cipher=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(h.ivHex,'hex'));
    cipher.setAAD(data.subarray(0,end)); cipher.setAuthTag(data.subarray(-16));
    // Authenticate completely before writing any decrypted bytes.
    const plain=Buffer.concat([cipher.update(data.subarray(end,-16)),cipher.final()]);
    fs.writeFileSync(output,plain,{flag:'wx',mode:0o600}); plain.fill(0);
  } finally {key.fill(0);}
  console.log('Authenticated export decrypted locally. Validate the ZIP with inspect-recovery.py before inspecting contents.');
} catch(e) {console.error('Recovery rejected: '+e.message);process.exitCode=1;}
