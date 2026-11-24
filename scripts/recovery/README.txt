For normal encrypted backups/import, see scripts/local-export/README.txt.
The normal app exports only a backup encrypted with its separate 30-digit code,
after fresh app-code verification (when enabled) and device-code confirmation.
It does not expose plaintext export or invoke this diagnostic exporter.

STELLAR NOTES — OPT-IN RECOVERY EXPORT

Build with -PnotesRecoveryExport=true for Android 2.92-recovery (48), a TARGETED recovery-only update.
Without this flag, ordinary Notes builds keep their original manifest and behavior.
It is not a general-purpose Notes release. MainActivity is disabled; the native
RecoveryActivity opens before any normal WebView or migration. Inherited app
startup/background components are excluded. No INTERNET permission is allowed.
Use the same package and Google Play app-signing lineage for a customer update.
A locally QA-signed APK cannot replace the customer's Play installation.
No customer rollout or production release is authorized by this build task.

The customer must accept both disclosures, then choose a destination through
Android's document picker. No automatic upload, account creation, password
capture, original-file deletion, migration, or restoration is performed.
The recovery package may contain private notes, folders, settings and login
material. Support must explain this and obtain the customer's explicit consent
before receiving or inspecting a real export. The customer keeps the original.

Support CAN decrypt the recovery container and inspect the copied raw records.
The exporter does NOT bypass encryption applied before the update. An old app
password may still be needed to read note plaintext. Do not claim otherwise or
collect a customer's account password. Diagnose and work on copies only.

Encryption: fresh AES-256-GCM key and 96-bit nonce for each export; the AES key
is wrapped to the embedded 3072-bit RSA public key with OAEP SHA-256/MGF1-SHA256.
The versioned header is authenticated as GCM AAD. No plaintext archive is written
by the Android app. SHA-256 checks before/copy/after detect changing sources.
All selected files, including SQLite journals and WebView LevelDB files, are
copied as opaque bytes. No SQLite, browser engine or exported script is opened.
Symlinks, oversized sources, unavailable files, changed records and existing
output files fail closed. A completion manifest must validate before inspection.
A valid encrypted file does not independently authenticate the sender's identity.

Public recipient key: android/app/src/main/assets/recovery-support-public.der
The private key is intentionally OUTSIDE this repository and must never be
committed, uploaded or included in APK/AAB. Its only copy must be secured and
backed up by the support owner before distributing this build. Losing the key
makes recovery exports unreadable. Key rotation requires retaining old keys.

OFFLINE SUPPORT COMMANDS (existing Node, Python 3.9+ and JDK; no package installation)
  node scripts/recovery/decrypt-recovery.cjs PRIVATE_KEY.pem INPUT.stnrecovery NEW_OUTPUT.zip
  python3 -B scripts/recovery/inspect-recovery.py NEW_OUTPUT.zip

Only after validation, explicitly extract to a new private directory if needed:
  python3 -B scripts/recovery/inspect-recovery.py NEW_OUTPUT.zip NEW_PRIVATE_DIRECTORY

Decryption authenticates the whole container before writing plaintext. ZIP
validation verifies the completion marker, every stored size/hash, path safety,
entry limits and absence of duplicates. Existing output paths are refused.
No support command executes exported code or sends files to a service.
Decrypted ZIPs/records are sensitive; keep them private and out of Git.

TESTS
  node --test scripts/recovery-export.test.cjs
  python3 -B scripts/recovery/test-recovery.py

The existing scripts/test-release.cjs release gate includes the recovery test.
JAVA_HOME may select the existing reviewed JDK. Missing tools fail the test;
there are no automatic downloads and no skipped security checks.

BUILD
  ./gradlew --offline -PnotesRecoveryExport=true :app:lintRelease :app:assembleRelease :app:bundleRelease

Use the existing reviewed toolchain and full release gate. For Android Studio
signing, set notesRecoveryExport=true only in the isolated recovery project’s
local android/gradle.properties; do not change global Gradle settings. Verify
2.92-recovery (48) and RecoveryActivity again after signing. The normal build
keeps 2.91 (47) until a separately reviewed general release version change.
