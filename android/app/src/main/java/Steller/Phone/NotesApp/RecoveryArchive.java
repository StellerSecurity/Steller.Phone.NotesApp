package Steller.Phone.NotesApp;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.security.spec.MGF1ParameterSpec;
import java.util.*;
import java.util.zip.*;
import javax.crypto.*;
import javax.crypto.spec.*;

/** Reads app-owned files only. Never opens a database or starts a WebView. */
public final class RecoveryArchive {
    static final long MAX_BYTES = 256L * 1024 * 1024;
    static final int MAX_FILES = 12000;
    static final byte[] MAGIC = "STNREC01".getBytes(StandardCharsets.US_ASCII);
    private RecoveryArchive() {}

    static boolean includedRoot(String name) {
        return name.startsWith("app_")
            || name.equals("databases") || name.equals("shared_prefs")
            || name.equals("files") || name.equals("no_backup");
    }

    static final class Entry {
        final File file; final long size, modified;
        Entry(File file) { this.file=file; size=file.length(); modified=file.lastModified(); }
    }

    static SortedMap<String,Entry> inventory(File root) throws IOException {
        root=root.getCanonicalFile();
        SortedMap<String,Entry> result = new TreeMap<>();
        File[] children=root.listFiles();
        if(children==null) throw new IOException("Cannot read app storage");
        String base=root.getCanonicalPath()+File.separator;
        long[] total={0};
        for(File child:children) if(includedRoot(child.getName())) collect(child,base,result,total);
        return result;
    }

    private static void collect(File file,String base,SortedMap<String,Entry> entries,long[] total) throws IOException {
        String actual=file.getCanonicalPath();
        // Skip only Chromium's process-lock symlinks, never same-named user files.
        if(file.getAbsolutePath().startsWith(base+"app_webview")
            && !actual.equals(file.getAbsolutePath())
            && Arrays.asList("SingletonLock","SingletonSocket","SingletonCookie").contains(file.getName())) return;
        if(!actual.startsWith(base) || !actual.equals(file.getAbsolutePath())) throw new IOException("Unsafe storage link");
        if(file.isDirectory()) {
            File[] children=file.listFiles();
            if(children==null) throw new IOException("Unreadable storage directory");
            for(File child:children) collect(child,base,entries,total);
        } else if(file.isFile()) {
            total[0]+=file.length();
            if(total[0]>MAX_BYTES || entries.size()>=MAX_FILES) throw new IOException("Recovery size limit exceeded");
            entries.put(actual.substring(base.length()),new Entry(file));
        } else throw new IOException("Unsupported storage entry");
    }

    static String quote(String text) {
        StringBuilder s=new StringBuilder("\"");
        for(char c:text.toCharArray()) {
            if(c=='"' || c=='\\') s.append('\\').append(c);
            else if(c<32) s.append(String.format(Locale.ROOT,"\\u%04x",(int)c));
            else s.append(c);
        }
        return s.append('"').toString();
    }

    static String hex(byte[] data) {
        StringBuilder s=new StringBuilder();
        for(byte b:data) s.append(String.format(Locale.ROOT,"%02x",b&255));
        return s.toString();
    }

    static String hash(File file) throws IOException,GeneralSecurityException {
        MessageDigest digest=MessageDigest.getInstance("SHA-256");
        try(InputStream in=new FileInputStream(file)) {
            byte[] buffer=new byte[65536]; int n;
            while((n=in.read(buffer))!=-1) digest.update(buffer,0,n);
        }
        return hex(digest.digest());
    }

    private static void jsonEntry(ZipOutputStream zip,String name,String value) throws IOException {
        zip.putNextEntry(new ZipEntry(name)); zip.write(value.getBytes(StandardCharsets.UTF_8)); zip.closeEntry();
    }

    public static void create(File root,File output,PublicKey recipient,String caseId) throws Exception {
        SortedMap<String,Entry> files=inventory(root);
        if(files.isEmpty()) throw new IOException("No candidate storage found");
        String base=root.getCanonicalPath()+File.separator;
        if(output.getCanonicalPath().startsWith(base) && !output.getCanonicalPath().startsWith(base+"cache"+File.separator))
            throw new IOException("Output must not be inside source storage");
        if(output.exists()) throw new IOException("Refusing to overwrite export");
        // Hash before copying, then compare copied bytes and every source again.
        SortedMap<String,String> hashes=new TreeMap<>();
        for(Map.Entry<String,Entry> item:files.entrySet()) hashes.put(item.getKey(),hash(item.getValue().file));
        SecureRandom random=new SecureRandom(); byte[] key=new byte[32],iv=new byte[12];
        random.nextBytes(key); random.nextBytes(iv);
        boolean complete=false;
        try {
            Cipher wrap=Cipher.getInstance("RSA/ECB/OAEPPadding");
            wrap.init(Cipher.ENCRYPT_MODE,recipient,new OAEPParameterSpec("SHA-256","MGF1",MGF1ParameterSpec.SHA256,PSource.PSpecified.DEFAULT));
            byte[] wrapped=wrap.doFinal(key);
            String keyId=hex(MessageDigest.getInstance("SHA-256").digest(recipient.getEncoded()));
            // Hex encoding works on all supported Android versions, without java.util.Base64.
            String header="{\"version\":1,\"algorithm\":\"RSA-OAEP-SHA256+AES-256-GCM\",\"keyId\":"+quote(keyId)
                +",\"wrappedKeyHex\":"+quote(hex(wrapped))+",\"ivHex\":"+quote(hex(iv))+"}";
            ByteArrayOutputStream aad=new ByteArrayOutputStream();
            DataOutputStream prefix=new DataOutputStream(aad); prefix.write(MAGIC);
            byte[] headerBytes=header.getBytes(StandardCharsets.UTF_8);
            prefix.writeInt(headerBytes.length); prefix.write(headerBytes); prefix.flush();
            Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE,new SecretKeySpec(key,"AES"),new GCMParameterSpec(128,iv));
            cipher.updateAAD(aad.toByteArray());
            try(OutputStream out=new FileOutputStream(output)) {
                out.write(aad.toByteArray());
                try(ZipOutputStream zip=new ZipOutputStream(new CipherOutputStream(out,cipher))) {
                    StringBuilder manifest=new StringBuilder("{\"version\":1,\"caseId\":"+quote(caseId)+",\"files\":[");
                    boolean first=true;
                    for(Map.Entry<String,Entry> item:files.entrySet()) {
                        Entry e=item.getValue(); String name=item.getKey();
                        if(e.file.length()!=e.size || e.file.lastModified()!=e.modified) throw new IOException("Storage changed; retry after closing Notes");
                        MessageDigest copied=MessageDigest.getInstance("SHA-256"); long count=0;
                        zip.putNextEntry(new ZipEntry("storage/"+name));
                        try(InputStream in=new FileInputStream(e.file)) {
                            byte[] buffer=new byte[65536]; int n;
                            while((n=in.read(buffer))!=-1) { if(Thread.currentThread().isInterrupted()) throw new IOException("Cancelled"); count+=n; if(count>e.size) throw new IOException("Storage changed"); copied.update(buffer,0,n); zip.write(buffer,0,n); }
                        }
                        zip.closeEntry();
                        if(count!=e.size || !hex(copied.digest()).equals(hashes.get(name))) throw new IOException("Storage changed");
                        if(!first) manifest.append(','); first=false;
                        manifest.append("{\"path\":").append(quote(name)).append(",\"size\":").append(e.size)
                            .append(",\"sha256\":").append(quote(hashes.get(name))).append('}');
                    }
                    if(!inventory(root).keySet().equals(files.keySet())) throw new IOException("Storage changed");
                    for(Map.Entry<String,Entry> item:files.entrySet()) if(!hash(item.getValue().file).equals(hashes.get(item.getKey()))) throw new IOException("Storage changed");
                    jsonEntry(zip,"manifest.json",manifest.append("]}").toString());
                    jsonEntry(zip,"complete.json","{\"complete\":true,\"originalStorageModified\":false}");
                }
            }
            complete=true;
        } finally {
            Arrays.fill(key,(byte)0);
            if(!complete && output.exists() && !output.delete()) output.deleteOnExit();
        }
    }
}
