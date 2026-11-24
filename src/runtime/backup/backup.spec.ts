import { generateBackupCode, backupCode, runBackupCrypto } from './backup-client';
import { BACKUP_MEMORY, BACKUP_PASSES, parseBackupEnvelope, validateBackupPayload } from './backup-format';

describe('Encrypted local backup with the shipping worker',()=>{
  let previous:number, encrypted:string, code:string;
  const worker=location.origin+'/base/www/live/backup.worker.js';
  const payload={format:'stellar-notes-export',version:1,exportedAt:'2026-11-24T00:00:00Z',
    notes:[{id:'synthetic',folderId:'folder',folder:'Personal',pinned:true,favorite:false,deleted:false,deletedAt:null,lastModified:10,
      locked:false,title:'Private backup title',html:'<p><br></p><p>Secret 🧪</p><p><br></p><p><br></p><p>Last</p><p><br></p>'},
    {id:'locked',folderId:null,folder:'',pinned:false,favorite:false,deleted:true,deletedAt:10,lastModified:11,locked:true,
      encrypted:{format:'cryptojs-aes-passphrase',title:'original-title-cipher',html:'original-body-cipher'}}],
    folders:[{id:'folder',name:'Personal',deleted:false,lastModified:10}]};
  beforeAll(async()=>{previous=jasmine.DEFAULT_TIMEOUT_INTERVAL;jasmine.DEFAULT_TIMEOUT_INTERVAL=60000;code=generateBackupCode();encrypted=await runBackupCrypto('encrypt',JSON.stringify(payload),code,undefined,worker);},60000);
  afterAll(()=>{code='';encrypted='';jasmine.DEFAULT_TIMEOUT_INTERVAL=previous;});
  it('generates 30 unbiased numeric digits and accepts grouped entry without changing leading zeroes',()=>{
    const codes=new Set(Array.from({length:50},()=>generateBackupCode()));expect(codes.size).toBe(50);
    expect([...codes].every(c=>/^[0-9]{30}$/.test(c))).toBeTrue();
    expect(backupCode('00000 12345 12345 12345 12345 12345')).toBe('000001234512345123451234512345');
    expect(()=>backupCode('123')).toThrowError('backupCodeInvalid');
  });
  it('encrypts the entire payload and preserves exact blank lines, folder metadata and locked ciphertext',async()=>{
    expect(encrypted).not.toContain('Private backup title');expect(encrypted).not.toContain('Personal');expect(encrypted).not.toContain(code);
    const envelope=JSON.parse(encrypted);expect(envelope.memlimit).toBe(BACKUP_MEMORY);expect(envelope.opslimit).toBe(BACKUP_PASSES);
    expect(JSON.parse(await runBackupCrypto('decrypt',encrypted,code,undefined,worker))).toEqual(payload);
  });
  it('rejects the wrong 30-digit code',async()=>{
    const wrong=(code[0]==='0'?'1':'0')+code.slice(1);
    await expectAsync(runBackupCrypto('decrypt',encrypted,wrong,undefined,worker)).toBeRejectedWithError('backupUnlockFailed');
  });
  it('rejects a modified ciphertext and a modified authenticated nonce',async()=>{
    const value=JSON.parse(encrypted);value.ciphertext=(value.ciphertext[0]==='A'?'B':'A')+value.ciphertext.slice(1);
    await expectAsync(runBackupCrypto('decrypt',JSON.stringify(value),code,undefined,worker)).toBeRejectedWithError('backupUnlockFailed');
    const nonce=JSON.parse(encrypted);nonce.nonce=(nonce.nonce[0]==='A'?'B':'A')+nonce.nonce.slice(1);
    await expectAsync(runBackupCrypto('decrypt',JSON.stringify(nonce),code,undefined,worker)).toBeRejectedWithError('backupUnlockFailed');
  });
  it('rejects unsupported versions, malicious KDF costs and truncated files before key derivation',()=>{
    const value=JSON.parse(encrypted);
    expect(()=>parseBackupEnvelope(JSON.stringify({...value,memlimit:2**40}))).toThrowError('backupInvalid');
    expect(()=>parseBackupEnvelope(JSON.stringify({...value,opslimit:999999}))).toThrowError('backupInvalid');
    expect(()=>parseBackupEnvelope(JSON.stringify({...value,version:999}))).toThrowError('backupInvalid');
    expect(()=>parseBackupEnvelope(encrypted.slice(0,-5))).toThrowError('backupInvalid');
    expect(()=>validateBackupPayload({...payload,notes:[payload.notes[0],payload.notes[0]]})).toThrowError('backupInvalid');
  });
  it('cancels worker processing without producing an export',async()=>{
    const controller=new AbortController();const pending=runBackupCrypto('encrypt',JSON.stringify(payload),code,controller.signal,worker);controller.abort();
    await expectAsync(pending).toBeRejectedWith(jasmine.objectContaining({name:'AbortError'}));
  });
});
