# Building Stellar Notes for Android

This is the mobile application repository. The current Android UI combines the approved Notes design, this repository's API/offline/sync services, and the shared desktop Quill editor.

## Source checkouts

Keep these three repositories available locally:

| Repository | Purpose |
| --- | --- |
| [Steller.Phone.NotesApp](https://github.com/StellerSecurity/Steller.Phone.NotesApp) | Mobile services, native Android project and packaging scripts |
| [Stellar.App.Prototypes](https://github.com/StellerSecurity/Stellar.App.Prototypes) | `stellar-notes-mobile-test/`: the shipping design |
| [Stellar.UI.Notes.DesktopApp](https://github.com/StellerSecurity/Stellar.UI.Notes.DesktopApp) | Shared Quill integration and reviewed editor dependencies |

Use mutually compatible, reviewed revisions. Record all three commit SHAs for each release. The design's `editor/sources.lock.json` checks exact editor dependency versions and source hashes.

## Toolchain and dependencies

- Node.js 24 (the local build environment used 24.20.0), with npm.
- JDK **21**. Select it in Android Studio's **Gradle JDK** settings as well as in `JAVA_HOME`. JDK 25 does not work with this Gradle configuration.
- Android Studio, Android SDK Platform **36**, and the SDK build tools required by the project.
- The checked-in wrapper pins **Gradle 8.9**; Android Gradle Plugin is **8.7.3**.
- Android minimum SDK is **23**; target and compile SDK are **36**.

Dependencies must pass the project's security review before downloading or executing them. Use committed lockfiles, keep install scripts disabled, and retain all hardening and integrity checks. Do not use `npx` to fetch a CLI or install newer packages to silence a build error.

After dependency approval, the mobile repository provides:

```sh
npm run deps:install
```

This runs the locked install with `--ignore-scripts` and `--legacy-peer-deps`, applies the checked-in hardening, and installs/verifies the separately locked OPAQUE runtime. Desktop dependencies must also be prepared under that repository's reviewed process. The editor builder reads the desktop's existing `node_modules`; installing only the mobile dependencies is insufficient.

The commands below assume those reviewed dependencies and native build artifacts are already present.

## Build the shipping UI

Set absolute paths for your checkouts, then work from the mobile repository:

```sh
export NOTES_MOBILE="/absolute/path/to/Steller.Phone.NotesApp"
export STELLAR_NOTES_DESIGN_SOURCE="/absolute/path/to/Stellar.App.Prototypes/stellar-notes-mobile-test"
export STELLAR_NOTES_DESKTOP_SOURCE="/absolute/path/to/Stellar.UI.Notes.DesktopApp"

cd "$NOTES_MOBILE"
npm run build:design-app
npm run cap -- sync android
```

`build:design-app` verifies and builds the shared Quill engine, bundles the mobile services using production endpoints, and stages the shipping design in `www/`. Capacitor sync copies it into the native project and configures the plugins/background worker.

**Do not run `npm run build` after staging the design:** it builds the original Angular screen tree and can overwrite `www/` with the old UI. To refresh the shipping app, rerun `build:design-app`, followed by Capacitor sync.

Never replace the note body with a separate textarea or change stored notes to compensate for visual spacing. Preserve the shared editor's import/export rules and intentional empty lines.

## Open and build Android

```sh
npm run cap -- open android
```

In Android Studio:

1. Open this checkout's `android/` project.
2. Set **Gradle JDK to JDK 21** and configure the local Android SDK.
3. Use the reviewed Gradle cache/repository. Keep offline mode enabled when using the prepared release environment.
4. Select the desired build variant and build.

From a terminal, with JDK 21 and the reviewed native artifacts available:

```sh
cd "$NOTES_MOBILE/android"
./gradlew --offline :app:lintRelease :app:assembleRelease :app:bundleRelease
```

A fresh machine is **not** ready for this offline command until its native artifacts have been reviewed and cached. The 2.89 release used a separately prepared, hash-verified Maven repository and Gradle initialization script, including reviewed lint-tool fixes. That local release harness is not included in this repository. Ordinary Gradle caches alone do not reproduce those release checks. Obtain the matching reviewed setup before a release build; do not omit lint, relax checks, or silently resolve different versions online.

Standard output locations:

- APK: `android/app/build/outputs/apk/release/`
- AAB: `android/app/build/outputs/bundle/release/app-release.aab`

A release build is not necessarily signed. Use the signing steps below for Play.

## Sign the Google Play AAB

1. Set a new, unused `versionCode` and the intended `versionName` in `android/app/build.gradle`.
2. Confirm `applicationId` remains `steller.phone.notesapp`.
3. Choose **Build → Generate Signed App Bundle or APK → Android App Bundle**.
4. Select the existing Notes **upload keystore**, enter its alias and passwords locally, and choose **release**.
5. Record the output path shown by Android Studio. The wizard may place the AAB in `android/app/release/` instead of Gradle's default output directory.
6. Verify the AAB before uploading:

```sh
jarsigner -verify -verbose -certs "/absolute/path/to/app-release.aab"
keytool -printcert -jarfile "/absolute/path/to/app-release.aab"
shasum -a 256 "/absolute/path/to/app-release.aab"
```

Require a valid signature and compare the certificate SHA-256 with the known upload certificate from a previous accepted release. Never publish a QA-key-signed bundle. Keep the keystore, passwords and signing configuration outside Git; never put passwords in command arguments or documentation.

For reference, release **2.89 (45)** was built from mobile commit `fa7da9a57b0708c91d26c3689262d0c7dfb0d48e`. Its portrait hardware feature is optional while the activity stays portrait-locked. Preserve both settings so orientation remains fixed without excluding tablets and other eligible devices.

## Checks before publishing

Run the existing automated checks with reviewed dependencies:

```sh
cd "$NOTES_MOBILE"
npm run test:dependency-hardening
npm run test:upgrade-storage
node --test scripts/stage-design-assets.test.cjs
npm run test:sync
npm run test:security
```

Browser suites require an installed Chrome/Chromium available to Karma. Run the design regression tests from the design repository as well:

```sh
cd "$STELLAR_NOTES_DESIGN_SOURCE"
node --test tests/*.test.cjs
```

Also test the actual release-mode app with a separate QA account/profile:

- Login, offline startup, autosave and save/reopen.
- Quill formatting, Enter, leading/trailing and consecutive empty lines.
- Toolbar position above the real keyboard, navigation and app lock.
- Mobile → old desktop and old desktop → mobile sync, including an already-open note.
- Note/folder deletion, restore and simultaneous edits.
- An in-place upgrade with synced and unsynced notes preserved.

Unit tests alone do not establish cross-device compatibility. Never clear app data or uninstall an existing installation to make an upgrade test pass. Use a separate QA application ID for isolated tests. A local upload-key-signed APK may not update a Play-installed app because Play App Signing can use a different certificate.

Finally, upload the verified AAB to the intended Play track, inspect device compatibility and pre-review checks, confirm release notes/rollout, and submit for Google's review. Uploading a bundle is not the same as being live.
