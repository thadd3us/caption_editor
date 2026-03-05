# macOS release build: signed & notarized app

This document describes how to build a **signed and notarized** macOS app so that users can download and run it without Gatekeeper blocking or deleting the app.

---

## What the script does

Running `./scripts/build-released-app.sh`:

1. Loads environment variables from `.envrc` (which can source `.envrc.private`).
2. Ensures `notarytool` is available if notarization will run (see below).
3. Runs `npm install` (including `patch-package` to apply the notarize patch).
4. Runs `npm run package:mac`, which:
   - Builds the app with electron-builder.
   - **Code-signs** the app with your Developer ID Application certificate.
   - **Notarizes** the app with Apple (if credentials are set), then **staples** the ticket to the app.

Outputs go to the `release/` directory (e.g. `release/Caption Editor-1.3.6.dmg`, `release/mac-arm64/Caption Editor.app`, and zip).

---

## Why notarization is required

For apps distributed **outside the Mac App Store** (e.g. downloaded from a website):

- **Code signing** alone is not enough. macOS Gatekeeper also expects a **notarization ticket**.
- Without notarization, Gatekeeper may show “macOS has identified a security issue” and offer to **delete the app** when the user opens it after download.
- Notarization = Apple’s service checks the app, then issues a ticket that is **stapled** to the app. Gatekeeper trusts notarized apps when the user opens them.

So for a distributable release, the app must be both **signed** and **notarized**.

---

## Prerequisites

### 1. Xcode 13 or later

- **Full Xcode** from the App Store (not only “Command Line Tools”).
- After installing/updating, set the active developer directory:
  ```bash
  sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
  ```
- If prompted, accept the license:
  ```bash
  sudo xcodebuild -license accept
  ```
- Verify `notarytool` is available:
  ```bash
  xcrun --find notarytool
  ```
  You should see a path like `/Applications/Xcode.app/Contents/Developer/usr/bin/notarytool`.

### 2. Apple Developer account

- You need an [Apple Developer](https://developer.apple.com/) account (paid program).

### 3. Developer ID Application certificate

- In [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/certificates/list), create a **Developer ID Application** certificate (used for apps distributed outside the App Store).
- **Do not use** “Apple Distribution” or “Mac Development” for this build; those are for App Store or local development and can cause notarization/stapling issues (e.g. Error 65).
- Install the certificate in your keychain. The script expects the identity name used in `package.json` (e.g. `Developer ID Application: Your Name (TEAMID)`).

### 4. App-specific password (for notarization)

- Go to [Apple ID account page](https://appleid.apple.com/account/manage) → Sign-In and Security → App-Specific Passwords.
- Generate a new app-specific password (e.g. “Caption Editor notarization”). You will use this in an environment variable; never commit it.

### 5. Team ID

- Your Apple Developer **Team ID** (e.g. `RWVMRK3723`). The script sets `APPLE_TEAM_ID`; you can override in `.envrc` if needed.

---

## Environment variables

The script sources `.envrc`, which can in turn source `.envrc.private` (typically gitignored) so secrets stay out of the repo.

### Required for notarization

Set these (e.g. in `.envrc.private`) so the build can notarize:

| Variable | Description |
|----------|-------------|
| `APPLE_ID` | Your Apple ID email (e.g. `you@example.com`). |
| `APPLE_APP_SPECIFIC_PASSWORD` | The app-specific password from [appleid.apple.com](https://appleid.apple.com/account/manage). |

Example `.envrc.private`:

```bash
export APPLE_ID="your-apple-id@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
```

### Set by the script

| Variable | Description |
|----------|-------------|
| `APPLE_TEAM_ID` | Set in the script (e.g. `RWVMRK3723`). Override in `.envrc` if you use a different team. |

### Optional

- `DEBUG=electron-builder` is set by the script for verbose build logs.

If `APPLE_ID` and `APPLE_APP_SPECIFIC_PASSWORD` are **not** set, the build still runs and produces a **signed** app, but **notarization is skipped**. The resulting app may be quarantined or blocked by Gatekeeper when users download it.

---

## Certificate and identity

- Code signing uses the **identity** configured in `package.json` under `mac.identity` (e.g. `Developer ID Application: Christopher Thaddeus Hughes (RWVMRK3723)`).
- electron-builder uses this (and your keychain) to sign the app. Ensure the matching certificate is installed and that you’re using **Developer ID Application**, not Apple Distribution or Mac Development.

---

## Staple Error 65 and the `@electron/notarize` patch

Sometimes notarization **succeeds** (Apple accepts the upload) but **stapling** fails with:

```text
Could not validate ticket for .../Caption Editor.app
The staple and validate action failed! Error 65.
```

**Cause:** `@electron/notarize` zips the app with `ditto ... --sequesterRsrc ...`. Apple’s guidance is that `--sequesterRsrc` is incorrect for this use and that `ditto`-created zips can produce a ticket that doesn’t match the on-disk app, so the stapler fails with Error 65.

**Fix in this project:** We patch `@electron/notarize` to use **`zip -r -y`** instead of `ditto` when creating the archive for notarization. The `-y` flag preserves symlinks (important for app bundles). This produces an archive that matches the on-disk app so the notarization ticket matches and stapling succeeds.

- Patch file: `patches/@electron+notarize+2.5.0.patch`
- After every `npm install`, `postinstall` runs `patch-package`, which reapplies this patch.

So a normal `npm install` (including when the build script runs it) keeps the fix in place. Do not remove the `patches/` directory or the `postinstall` script if you want notarization + stapling to work.

---

## Troubleshooting

### “notarytool is not available”

- Install or update **full Xcode** from the App Store.
- Run: `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`
- Run: `xcrun --find notarytool` to confirm it’s found.

### “The staple and validate action failed! Error 65”

- Ensure you’re using a **Developer ID Application** certificate (not Apple Distribution or Mac Development).
- Ensure the `@electron/notarize` patch is applied: run `npm install` and check that `patch-package` reports applying `@electron/notarize@2.5.0`.
- If you ever removed the patch or changed `node_modules` by hand, run `npm install` again so the patch is reapplied.

### Notarization “Invalid credentials” (e.g. 401)

- Use an **app-specific password** from [appleid.apple.com](https://appleid.apple.com/account/manage), not your main Apple ID password.
- Ensure `APPLE_ID` and `APPLE_APP_SPECIFIC_PASSWORD` are set in the environment that runs the script (e.g. in `.envrc.private` and that `.envrc` sources it).

### App still quarantined or blocked after download

- Confirm the app was **notarized** (build log should show notarization and stapling).
- Confirm you’re distributing the **same** app that was notarized (e.g. the DMG or zip produced by the script), not a modified copy.
- Users can right‑click → Open the first time to bypass Gatekeeper once, but a properly notarized app should open without that after the ticket is verified.

---

## Verifying the built app

- **Check notarization ticket:**
  ```bash
  xcrun stapler validate "release/mac-arm64/Caption Editor.app"
  ```
  You should see that the ticket was validated.

- **Check code signature:**
  ```bash
  codesign -dvvv "release/mac-arm64/Caption Editor.app"
  ```

- **Check Gatekeeper assessment:**
  ```bash
  spctl -a -vv -t execute "release/mac-arm64/Caption Editor.app"
  ```
  You should see “accepted” and “source=Notarized Developer ID”.

---

## Summary checklist

- [ ] Xcode 13+ installed, `xcode-select` points to Xcode, `xcrun --find notarytool` works.
- [ ] Developer ID Application certificate installed (identity matches `package.json`).
- [ ] `APPLE_ID` and `APPLE_APP_SPECIFIC_PASSWORD` set (e.g. in `.envrc.private`).
- [ ] `.envrc` sources `.envrc.private` (or you set the vars another way).
- [ ] `npm install` has been run so the `@electron/notarize` patch is applied.
- [ ] Run `./scripts/build-released-app.sh`; artifacts are in `release/`.

For more detail, run:

```bash
./scripts/build-released-app.sh --help
```
