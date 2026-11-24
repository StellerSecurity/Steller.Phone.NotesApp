package Steller.Phone.NotesApp;
import java.io.*;import java.nio.file.*;import java.security.*;import java.security.spec.*;
public final class RecoveryHarness {
 public static void main(String[] a)throws Exception {
  PublicKey k=KeyFactory.getInstance("RSA").generatePublic(new X509EncodedKeySpec(Files.readAllBytes(Paths.get(a[2]))));
  RecoveryArchive.create(new File(a[0]),new File(a[1]),k,"synthetic-test");
 }
}
