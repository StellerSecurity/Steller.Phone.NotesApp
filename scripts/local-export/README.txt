STELLAR NOTES — ENCRYPTED BACKUP AND IMPORT

Settings → Your data provides only encrypted backup and import.
There is no ordinary plaintext export action or native writer route.
All exported files use .stellarbackup and the encrypted format documented in
encrypted-format.txt. The ordinary notes JSON is only the encrypted inner payload.
Existing note storage and previously saved files are never removed by this change.

Each backup generates a new 30-digit code displayed as six five-digit groups
separated by hyphens. The user re-enters it before proceeding and keeps it apart
from the file. No code is persisted or uploaded. Forgotten codes cannot be recovered.

A fresh app code is required when app lock is enabled, even while unlocked.
The native writer requires Android DEVICE_CREDENTIAL only, never biometrics.
No screen code or Android below 11 means no file export. Every export has a new
native authorization that expires after two minutes or screen lock/activity exit.
Consent includes the existing five-to-zero countdown; cancellation never saves.
Native and runtime layers reject plaintext and missing/invalid backup codes.

Writes go directly to Android's document-picker destination with no plaintext
temporary files. Original notes/folders remain in the app. A failed external write
may leave an incomplete encrypted destination file, while source notes are untouched.
Import decrypts locally, previews counts and requires confirmation. Notes receive
new IDs; existing notes are never overwritten. Existing individual note codes stay
required. App lock/logout/cancellation/expiry invalidate the import preview.

This protects backup files at rest. It does not redesign V1 local storage or claim
forensic erasure or security for an already unlocked or compromised device.
The separate opt-in encrypted raw recovery launcher remains outside the normal
app manifest, documented in scripts/recovery/README.txt.
