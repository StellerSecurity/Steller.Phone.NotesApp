# Stellar Private Notes – Client App

This is the **official client** for Stellar Private Notes – a zero-knowledge, end‑to‑end encrypted notes application by **Stellar Security (Switzerland)**.

The client is built with **Angular** (and Ionic/Capacitor for mobile builds) and talks to the Stellar Notes API over HTTPS.  
All encryption and decryption happen **only on the client**. The server never sees your plaintext notes or encryption keys.

---

## 🔐 Zero‑Knowledge by Design

The client implements the full cryptographic flow:

- User provides a password.
- The client derives a **Password Key (PK)** using **PBKDF2‑SHA256** with a high iteration count and a random salt.
- The PK is used to unwrap a 32‑byte **Master Key (MK)** from the encrypted key blob (**EAK**).
- The MK is kept **only in memory** and is used to encrypt/decrypt all note content with **AES‑GCM (256‑bit)**.
- Only encrypted notes and encrypted key material are sent to the server.

> Not even Stellar can decrypt user notes. Only the user’s devices hold the keys in plaintext.

---

## 🌟 Stellar ID Is Optional

The client supports two flows:

1. **Create a new Stellar ID inside the app**
  - During registration, the app creates a fresh E2EE vault and uploads the EAK bundle to the API.

2. **Log in with an existing Stellar ID created elsewhere**
  - Some users may have created a Stellar ID on `stellarsecurity.com` or another Stellar product before using Private Notes.
  - In that case, the account may **not yet have an EAK** attached.
  - On first login, if the API returns a user *without* `eak_b64` / `kdf_salt_b64`, the client:
    - Creates a new vault locally.
    - Generates a new EAK bundle.
    - Calls the API’s `updateEak` endpoint to attach the EAK to the existing account.
    - From that point on, the account is fully E2EE‑enabled.

Stellar ID is therefore **optional** for using notes:  
you can come from the broader Stellar ecosystem or start directly in this app.

---

## 🧱 Project Structure (Client)

> Note: file and folder names may vary slightly depending on your project layout, but the core concepts remain.

Typical structure:

```text
src/app/
  app.module.ts
  app-routing.module.ts
  app.component.ts

  services/
    auth.service.ts          # Login, registration, token handling
    crypto-key.service.ts    # E2EE vault, EAK handling, AES-GCM helpers
    crypto.service.ts        # Extra encryption helpers (e.g. lock password)
    notes.service.ts         # Local notes handling (in-memory / storage)
    notes-api-v1.service.ts  # HTTP calls to Notes API
    secure-storage.service.ts# Wrapper around secure storage APIs
    toast-message.service.ts # UI notifications
    data.service.ts          # Shared app state flags

  user/
    login/
      login.component.ts     # Login form + EAK creation if missing
    create-account/
      create-account.component.ts
    ...

  ... other feature modules and components ...
```

Key services:

- **`CryptoKeyService`**
  - Implements vault creation (`createVault`)
  - Exports server bundle (`exportServerBundleFromHeader`)
  - Implements `extractPlainEAK` to unwrap the Master Key on login
  - Holds the Master Key in memory as a `CryptoKey` for AES‑GCM operations

- **`AuthService`**
  - Calls:
    - `/v1/logincontroller/create`
    - `/v1/logincontroller/auth`
    - `/v1/logincontroller/updateEak`
    - Password reset endpoints
  - Stores the API token in secure storage.

- **`NotesApiV1Service`**
  - Handles:
    - `/v1/notescontroller/upload`
    - `/v1/notescontroller/sync-plan`
    - `/v1/notescontroller/download`
    - `/v1/notescontroller/find`

---

## ⚙ Setup & Development

> The following commands are typical for an Angular/Ionic project.  
> Adjust if your project uses a different tooling setup.

### 1. Install dependencies

```bash
npm install
# or
pnpm install
# or
yarn install
```

### 2. Run in development mode (web)

```bash
npm run start
# or
ng serve
# or with Ionic:
ionic serve
```

Then open:

```text
http://localhost:4200
```

(or whatever dev port you see in the console output).

### 3. Build for production (web)

```bash
npm run build
# or
ng build --configuration production
```

The compiled app will typically live in `dist/`.

### 4. Mobile builds (if using Ionic + Capacitor)

```bash
ionic build
npx cap sync
npx cap open android
npx cap open ios
```

From there, use Android Studio / Xcode to build and sign your apps.

### 5. Desktop (Electron/Tauri/Capacitor Desktop)

We also offer the app for desktop computers. If you want users to know it exists for desktop, mention it here and provide packaging options:

- Electron: Build the web app (`ng build` or `ionic build`) and point an Electron BrowserWindow to the `dist/` output.
- Tauri: Use Tauri to wrap the `dist/` output and build lightweight installers.
- Capacitor Desktop: Add a desktop target (e.g., community Electron plugin) and run `npx cap sync`.

Tip: As a quick alternative, the app can be used as a PWA on desktop browsers. After building, serve `dist/` and use the browser's "Install App" option.

---

## 🔑 Authentication & Tokens

- The client logs in via the Stellar User API using email + password.
- On success, it receives:
  - A **Bearer token** (Laravel Sanctum) used for all subsequent API calls.
  - A `user` object, which may or may not contain E2EE fields (`eak_b64`, `kdf_salt_b64`, `kdf_params`, `crypto_version`).

- The token is stored via `SecureStorageService`, **not** plain `localStorage`, to reduce the risk of session theft on mobile devices.

---

## 🔐 E2EE Flow (Client-Side)

### Register

1. User enters email + password.
2. Client:
  - Creates a vault (`createVault(password)`).
  - Exports server bundle:
    - `crypto_version`
    - `kdf_params` (`algo`, `hash`, `iters`)
    - `kdf_salt` (base64)
    - `eak` (base64(IV || ciphertext))
  - Sends bundle + credentials to `/v1/logincontroller/create`.
3. API stores the E2EE fields as raw bytes and returns `user + token`.
4. Client unwraps EAK using `extractPlainEAK(password, bundle)` and keeps MK in memory.

### Login (user already has EAK)

1. Client calls `/auth` with email + password.
2. API returns `user` with `eak_b64` and `kdf_salt_b64`.
3. Client builds a `ServerBundle` from the user object.
4. Client calls `extractPlainEAK(password, bundle)` → gets plaintext MK.
5. Notes can now be decrypted and encrypted.

### Login (user has no EAK yet – Stellar ID from elsewhere)

1. Client calls `/auth` with email + password.
2. API returns `user` **without** `eak_b64`.
3. Client:
  - Calls `createVault(password)`.
  - Exports `bundle = exportServerBundleFromHeader()`.
  - Sends `bundle` to `/updateEak` with the Bearer token.
  - Option A:
    - Uses the local `bundle` immediately for `extractPlainEAK`.
  - Option B:
    - Uses the updated `user` returned by `/updateEak`.
4. From here, the flow is identical to the normal login case.

---

## 🧩 Notes Sync

The client uses:

- `upload` to push encrypted notes to the server.
- `sync-plan` to ask the server which notes need updating (diff/sync logic).
- `download` to pull encrypted notes.
- `find` to search/filter notes (still operating on encrypted or metadata fields depending on design).

All note bodies remain encrypted; only the client ever sees decrypted content.

---

## 🛡 Security Considerations

- EAK / MK are never stored unencrypted at rest on the server.
- The client may additionally protect local EAK with a **secondary app password** (app‑lock), encrypting it again before storage.
- Tokens and sensitive values are stored via secure storage mechanisms where possible.

---

## 🧪 Development Tips

- When debugging, take care **not to log** plaintext note content or keys.
- You can safely log:
  - Whether EAK exists or not.
  - High-level sync stats (number of notes, timestamps, etc.).
- Never log:
  - Raw `eak_b64` (in production logs).
  - Decrypted note content.
  - User passwords.

---

## 📄 License

Open‑source for transparency and education.  
Commercial usage of the Stellar stack is available via Stellar SDK and partnership agreements.

---

## 💬 Contact

For questions, contributions or security review:

**Stellar Security (Switzerland)**  
https://stellarsecurity.com

---

Made with ❤️ and paranoia by Stellar Security  
