"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

test("native export payload is single-use, expires, and cannot be replaced or discarded by a wrong ID", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "notes-local-payload-"));
  try {
    const clock = path.join(dir, "android/os");
    const app = path.join(dir, "Steller/Phone/NotesApp");
    fs.mkdirSync(clock, { recursive: true }); fs.mkdirSync(app, { recursive: true });
    fs.writeFileSync(path.join(clock, "SystemClock.java"), "package android.os; public final class SystemClock { public static long now=1000; public static long elapsedRealtime(){return now;} }");
    fs.copyFileSync(path.join(__dirname, "../android/app/src/main/java/Steller/Phone/NotesApp/LocalExportPayload.java"), path.join(app, "LocalExportPayload.java"));
    fs.writeFileSync(path.join(app, "PayloadTest.java"), `package Steller.Phone.NotesApp;
public final class PayloadTest {
 static void check(boolean ok) { if(!ok) throw new AssertionError(); }
 public static void main(String[] args) {
  String a=LocalExportPayload.offer("first"); check(a!=null);
  check(LocalExportPayload.offer("replacement")==null);
  check(LocalExportPayload.take("wrong")==null);
  LocalExportPayload.discard("wrong");
  check(LocalExportPayload.deadline(a)==121000);
  check("first".equals(LocalExportPayload.take(a)));
  check(LocalExportPayload.take(a)==null);
  String b=LocalExportPayload.offer("expired"); android.os.SystemClock.now=121000;
  check(LocalExportPayload.take(b)==null);
  String c=LocalExportPayload.offer("cancelled"); LocalExportPayload.discard(c);
  check(LocalExportPayload.take(c)==null);
  String d=LocalExportPayload.offer("stale"); android.os.SystemClock.now+=120000;
  String e=LocalExportPayload.offer("new"); check(e!=null);
  LocalExportPayload.discard(d); check("new".equals(LocalExportPayload.take(e)));
 }
}`);
    const home = process.env.JAVA_HOME;
    const bin = name => home ? path.join(home, "bin", name) : name;
    const compile = spawnSync(bin("javac"), ["-d", dir, path.join(clock, "SystemClock.java"), path.join(app, "LocalExportPayload.java"), path.join(app, "PayloadTest.java")], {encoding:"utf8"});
    assert.equal(compile.status, 0, compile.stderr);
    const run = spawnSync(bin("java"), ["-cp", dir, "Steller.Phone.NotesApp.PayloadTest"], {encoding:"utf8"});
    assert.equal(run.status, 0, run.stderr);
  } finally { fs.rmSync(dir, {recursive:true, force:true}); }
});

test('native backup format rejects plaintext documents, extra note fields and malformed encryption metadata', () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'notes-encrypted-writer-'));
  try {
    const app=path.join(dir,'Steller/Phone/NotesApp'),json=path.join(dir,'org/json');
    fs.mkdirSync(app,{recursive:true});fs.mkdirSync(json,{recursive:true});
    // Parser-independent test double for Android's JSONObject accessor API.
    fs.writeFileSync(path.join(json,'JSONObject.java'),`package org.json;
public class JSONObject {
 private java.util.Map<String,Object> values=new java.util.HashMap<>();
 public JSONObject put(String key,Object value){values.put(key,value);return this;}
 public int length(){return values.size();}
 public String optString(String key){Object v=values.get(key);return v instanceof String?(String)v:"";}
 public int optInt(String key){Object v=values.get(key);return v instanceof Number?((Number)v).intValue():0;}
 public long optLong(String key){Object v=values.get(key);return v instanceof Number?((Number)v).longValue():0;}
}`);
    fs.copyFileSync(path.join(__dirname,'../android/app/src/main/java/Steller/Phone/NotesApp/LocalBackupFormat.java'),path.join(app,'LocalBackupFormat.java'));
    fs.writeFileSync(path.join(app,'FormatTest.java'),`package Steller.Phone.NotesApp;
import org.json.JSONObject;
public class FormatTest {
 static JSONObject envelope(){return new JSONObject().put("format","stellar-notes-backup").put("version",1).put("kdf","argon2id13").put("memlimit",268435456L).put("opslimit",3).put("cipher","xchacha20poly1305-ietf").put("salt","c3Nzc3Nzc3Nzc3Nzc3Nzcw==").put("nonce","bm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5u").put("ciphertext","c3ludGhldGljIGF1dGhlbnRpY2F0ZWQgY2lwaGVydGV4dA==");}
 static void check(boolean ok){if(!ok)throw new AssertionError();}
 public static void main(String[] args){
  check(LocalBackupFormat.valid(envelope()));check(!LocalBackupFormat.valid(null));
  check(!LocalBackupFormat.valid(new JSONObject().put("format","stellar-notes-export").put("notes","private")));
  check(!LocalBackupFormat.valid(envelope().put("notes","private")));
  check(!LocalBackupFormat.valid(envelope().put("format","stellar-notes-export")));
  check(!LocalBackupFormat.valid(envelope().put("ciphertext","<p>Private note</p>")));
  check(!LocalBackupFormat.valid(envelope().put("ciphertext","====AAAAAAAAAAAAAAAAAAAA")));
  check(!LocalBackupFormat.valid(envelope().put("memlimit",1099511627776L)));
  check(!LocalBackupFormat.valid(envelope().put("kdf","none")));
  check(!LocalBackupFormat.valid(envelope().put("nonce","")));
  check(!LocalBackupFormat.valid(envelope().put("version",2)));
 }
}`);
    const bin=name=>process.env.JAVA_HOME?path.join(process.env.JAVA_HOME,'bin',name):name;
    const compiled=spawnSync(bin('javac'),['-d',dir,path.join(json,'JSONObject.java'),path.join(app,'LocalBackupFormat.java'),path.join(app,'FormatTest.java')],{encoding:'utf8'});
    assert.equal(compiled.status,0,compiled.stderr);
    const run=spawnSync(bin('java'),['-cp',dir,'Steller.Phone.NotesApp.FormatTest'],{encoding:'utf8'});assert.equal(run.status,0,run.stderr);
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
