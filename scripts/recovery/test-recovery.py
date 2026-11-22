import unittest,tempfile,subprocess,hashlib,importlib.util,os
from pathlib import Path
NODE=os.environ.get('STELLAR_RECOVERY_TEST_NODE','node')
BASE=Path(__file__).resolve().parent
ROOT=BASE.parents[1]
JAVA=str(Path(os.environ['JAVA_HOME'])/'bin')+'/' if os.environ.get('JAVA_HOME') else ''
spec=importlib.util.spec_from_file_location('inspect_recovery',BASE/'inspect-recovery.py'); module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class RecoveryTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.temp=tempfile.TemporaryDirectory(prefix='notes-recovery-tests-');cls.work=Path(cls.temp.name)
  cls.classes=cls.work/'classes';cls.classes.mkdir()
  subprocess.run([JAVA+'javac','-d',str(cls.classes),str(ROOT/'android/app/src/main/java/Steller/Phone/NotesApp/RecoveryArchive.java'),str(BASE/'RecoveryHarness.java')],check=True)
  subprocess.run([NODE,'-e',"const c=require('node:crypto'),f=require('node:fs');const k=c.generateKeyPairSync('rsa',{modulusLength:3072});f.writeFileSync(process.argv[1],k.privateKey.export({format:'pem',type:'pkcs8'}),{mode:384});f.writeFileSync(process.argv[2],k.publicKey.export({format:'der',type:'spki'}));",str(cls.work/'key.pem'),str(cls.work/'public.der')],check=True)
 @classmethod
 def tearDownClass(cls):cls.temp.cleanup()
 def setUp(self):
  self.case=Path(tempfile.mkdtemp(dir=self.work));self.source=self.case/'data';self.source.mkdir();self.out=self.case/'export.stnrecovery'
  for name,value in {'app_webview/Default/Local Storage/leveldb/000003.log':b'encrypted notes and six folders','databases/localforage-wal':b'journal-important','shared_prefs/app.xml':b'lock=true','cache/not-exported':b'cache','app_webview_old/Local Storage/http_localhost.localstorage':b'old origin','files/pending.json':b'unsynced-note'}.items():
   p=self.source/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(value)
  self.before=self.snapshot()
 def snapshot(self):return {str(p.relative_to(self.source)):hashlib.sha256(p.read_bytes()).hexdigest() for p in self.source.rglob('*') if p.is_file()}
 def create(self):return subprocess.run([JAVA+'java','-cp',str(self.classes),'Steller.Phone.NotesApp.RecoveryHarness',str(self.source),str(self.out),str(self.work/'public.der')],capture_output=True)
 def decrypt(self,input=None,key=None):return subprocess.run([NODE,str(BASE/'decrypt-recovery.cjs'),str(key or self.work/'key.pem'),str(input or self.out),str(self.case/'out.zip')],capture_output=True)
 def test_roundtrip_preserves_sources(self):
  self.assertEqual(self.create().returncode,0);self.assertEqual(self.before,self.snapshot());self.assertNotIn(b'unsynced-note',self.out.read_bytes());self.assertEqual(self.decrypt().returncode,0)
  self.assertEqual(module.inspect(self.case/'out.zip',self.case/'extracted')['files'],5)
  self.assertEqual((self.case/'extracted/storage/files/pending.json').read_bytes(),b'unsynced-note');self.assertEqual(self.before,self.snapshot())
 def test_existing_output_preserved(self):
  self.out.write_bytes(b'existing');self.assertNotEqual(self.create().returncode,0);self.assertEqual(self.out.read_bytes(),b'existing');self.assertEqual(self.before,self.snapshot())
 def test_symlink_rejected(self):
  outside=self.case/'outside';outside.write_bytes(b'secret');(self.source/'files/link').symlink_to(outside)
  self.assertNotEqual(self.create().returncode,0);self.assertFalse(self.out.exists());self.assertEqual(outside.read_bytes(),b'secret')
 def test_tampered_payload_rejected(self):
  self.assertEqual(self.create().returncode,0);data=bytearray(self.out.read_bytes());data[-25]^=1;bad=self.case/'bad';bad.write_bytes(data)
  self.assertNotEqual(self.decrypt(input=bad).returncode,0);self.assertFalse((self.case/'out.zip').exists())
 def test_tampered_header_rejected(self):
  self.assertEqual(self.create().returncode,0);data=bytearray(self.out.read_bytes());start=data.index(b'"keyId":"')+9;data[start]=ord('0') if data[start]!=ord('0') else ord('1');bad=self.case/'bad';bad.write_bytes(data)
  self.assertNotEqual(self.decrypt(input=bad).returncode,0);self.assertFalse((self.case/'out.zip').exists())
 def test_truncated_rejected(self):
  self.assertEqual(self.create().returncode,0);bad=self.case/'bad';bad.write_bytes(self.out.read_bytes()[:-20]);self.assertNotEqual(self.decrypt(input=bad).returncode,0);self.assertFalse((self.case/'out.zip').exists())
 def test_wrong_key_rejected(self):
  self.assertEqual(self.create().returncode,0);wrong=self.case/'wrong.pem';subprocess.run([NODE,'-e',"const c=require('node:crypto'),f=require('node:fs');f.writeFileSync(process.argv[1],c.generateKeyPairSync('rsa',{modulusLength:3072}).privateKey.export({format:'pem',type:'pkcs8'}),{mode:384});",str(wrong)],check=True)
  self.assertNotEqual(self.decrypt(key=wrong).returncode,0);self.assertFalse((self.case/'out.zip').exists())
 def test_size_limit(self):
  with (self.source/'files/huge').open('wb') as f:f.truncate(257*1024*1024)
  self.assertNotEqual(self.create().returncode,0);self.assertFalse(self.out.exists())
 def test_output_cannot_replace_source(self):
  self.out=self.source/'files/invalid';self.assertNotEqual(self.create().returncode,0);self.assertFalse(self.out.exists());self.assertEqual(self.before,self.snapshot())
 def test_cache_output_excluded(self):
  self.out=self.source/'cache/export.stnrecovery';self.assertEqual(self.create().returncode,0);self.assertEqual(self.decrypt().returncode,0);self.assertEqual(module.inspect(self.case/'out.zip')['files'],5)
 def test_user_file_named_like_browser_lock_is_preserved(self):
  (self.source/'files/SingletonLock').write_bytes(b'user attachment')
  self.assertEqual(self.create().returncode,0);self.assertEqual(self.decrypt().returncode,0)
  self.assertEqual(module.inspect(self.case/'out.zip',self.case/'extracted')['files'],6)
  self.assertEqual((self.case/'extracted/storage/files/SingletonLock').read_bytes(),b'user attachment')
if __name__=='__main__':unittest.main(verbosity=2)
