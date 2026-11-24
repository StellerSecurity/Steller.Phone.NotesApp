package Steller.Phone.NotesApp;
import org.json.JSONObject;
/** The native writer accepts only the encrypted file format; never a notes document. */
final class LocalBackupFormat {
    static boolean valid(JSONObject backup) {
        if (backup == null || backup.length() != 9) return false;
        if (!"stellar-notes-backup".equals(backup.optString("format")) || backup.optInt("version") != 1
            || !"argon2id13".equals(backup.optString("kdf")) || backup.optLong("memlimit") != 268435456L
            || backup.optInt("opslimit") != 3 || !"xchacha20poly1305-ietf".equals(backup.optString("cipher"))) return false;
        String salt=backup.optString("salt"), nonce=backup.optString("nonce"), cipher=backup.optString("ciphertext");
        return salt.length()==24 && nonce.length()==32 && cipher.length()>=24 && cipher.length()<=48*1024*1024
            && base64(salt) && base64(nonce) && base64(cipher);
    }
    private static boolean base64(String value) {
        // Linear scan avoids a deep regex stack on large backup files.
        if ((value.length() & 3) != 0) return false;
        int padding=0;
        for(int i=0;i<value.length();i++) {
            char c=value.charAt(i);
            if(c=='=') { if(++padding>2 || i<value.length()-2) return false; }
            else if(padding>0 || !((c>='A'&&c<='Z')||(c>='a'&&c<='z')||(c>='0'&&c<='9')||c=='+'||c=='/')) return false;
        }
        return true;
    }
}
