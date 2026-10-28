# Dayfold for iPhone and Android

Dayfold as a real app: exam countdowns, a planned day, tick-off sessions and a morning notification. **Everything runs on the phone.** There is no server, no account and no email. Built with [Capacitor](https://capacitorjs.com); all web assets are bundled inside the app, so it works fully offline.

You need no Mac and no local build tools. GitHub builds both apps in the cloud:

- **`Dayfold.ipa`**: an **unsigned** iOS app. [Sideloadly](https://sideloadly.io) signs it with your free Apple ID and installs it.
- **`Dayfold.apk`**: an Android app you can install directly.

## 1. Build the apps

1. Put this folder in a GitHub repository and push it:
   ```bash
   git init -b main && git add -A && git commit -m "Dayfold app"
   git remote add origin https://github.com/<you>/dayfold-app.git
   git push -u origin main
   ```
2. On GitHub open **Actions → Build apps → Run workflow**. Leave **platform** on `both`.
3. Wait for the green check (the iOS job takes about 10 minutes). Open the run and download the artifacts at the bottom: `Dayfold-ios-ipa` and `Dayfold-android-apk`. Each is a zip containing the file.

## 2. Install on iPhone (Windows, free Apple ID)

1. On Windows install **iTunes from Apple's website** (not the Microsoft Store version) and **Sideloadly**. Sideloadly runs on Windows itself, not inside WSL.
2. Connect the iPhone by USB, unlock it and tap **Trust** on the phone.
3. Open Sideloadly, drag in `Dayfold.ipa`, pick your iPhone, enter your Apple ID and press **Start**. Sideloadly asks for your normal Apple ID password; if your account has two-factor authentication, type the code Apple sends to your devices when it asks. (An app-specific password is not what it wants.)
4. When it finishes, open **Settings → General → VPN & Device Management**, tap your Apple ID under *Developer App* and tap **Trust**.
5. **iOS 16 and newer:** the **Developer Mode** switch only appears *after* the first sideload. Turn it on under **Settings → Privacy & Security → Developer Mode** and restart when asked. (iOS 15 has no Developer Mode and needs nothing here.)
6. Open Dayfold. The first screens ask for your name, your wake and sleep times, notifications and your exams.

A free Apple ID gives you a signature that lasts **7 days** and allows about 3 sideloaded apps at once.

**Windows on ARM.** I could not verify Sideloadly on Windows on ARM. It runs as an x64 program under emulation, and it depends on Apple's iTunes drivers to see the phone. If Sideloadly does not detect your iPhone: use a direct USB port, reinstall iTunes from Apple's website, and if that still fails run the same steps once on any other Windows PC. After that, the installed app keeps working without the laptop until its 7 days run out.

### Renew the signature automatically (Sideloadly Daemon)

Without this you re-install every 7 days. The Sideloadly Daemon re-signs the app in the background.

1. In Sideloadly open **Advanced Options** and turn on **Automatic app refreshing** (Sideloadly Daemon) **before** pressing Start. The wording can differ slightly between versions. Install the app with it enabled.
2. In iTunes select the iPhone and enable **Sync with this iPhone over Wi-Fi**.
3. Leave the Sideloadly Daemon running. It sits in the Windows tray and should start with Windows.

What it needs: the **computer on and awake**, the daemon running, and the **iPhone on the same Wi-Fi** (or plugged in by USB), unlocked now and then. If any of those are missing for more than about 7 days the app stops opening; plug the phone in and install the `.ipa` again. Your data stays as long as the app is not deleted and the bundle ID does not change.

## 3. Install on Android

1. Get `Dayfold.apk` onto the phone. The workflow artifact is a `.zip` (`Dayfold-android-apk`): download it on the phone (you must be signed in to GitHub there), or download it on the PC and copy it over, then open the zip in your Files app and extract `Dayfold.apk`.
2. Open it. Android asks to allow installs from that app (your browser or Files): allow it once.
3. Open Dayfold and allow notifications when asked.

Builds are signed with a fixed debug key from the repository, so a newer APK installs over the old one and keeps your data. **Before you ever uninstall, copy a backup** (Settings → Data → Backup and restore), because uninstalling deletes the data.

## Your data

All data lives on the device in native storage (not the web view's browser storage, which the OS can clear). **Deleting the app deletes the data.** In **Settings → Data → Backup and restore** copy a backup now and then and paste it into Notes. Paste it back to restore.

## Notifications

There is no server to send email, so Dayfold schedules notifications on the phone itself:

- **Morning plan** for each of the next 14 days (for example "Tue 27 Oct: CSC230 Quiz 3 in 8 days. 4 sessions, 3 h 20 min. First at 08:00: CSC230 Lectures 1-3").
- **Session reminders**: a notification 0, 5, 10 or 15 minutes before each study session starts (default 5), for the next few days. Ticking a session off removes its reminder.

Both are in **Settings → Notifications**. Open the app every now and then so the coming days are rebuilt from your latest progress. iOS keeps at most 64 pending notifications, so only the soonest sessions are scheduled. On Android the time is approximate: Android may hold a notification back while the phone is in deep sleep.

## Add your timetable quickly

- **Classes, shifts and training:** Settings → Commitments → **Import**. Paste or choose a CSV (`label,kind,days,start,end`, days like `Mon;Wed` or `weekdays`, times like `10:30` or `2:30pm`), or a calendar `.ics` file: weekly repeating events become rows. **Use a template** fills in an example. The day chips in the add form (Weekdays, Mon Wed, ...) set days in one tap.
- **Course topics:** open a course and paste several topics, one per line, or Settings → Data → **Import courses and topics** with a CSV (`course,name,topic`). The name and the topic are each optional, so one row can add a course, a topic, or both. Unknown courses are created, and new topics can replace the placeholder ones.
- **Exams:** Settings → Data → **Import exams** (CSV or `.ics`).

## Colors

Settings → Appearance → **Accent color**: eight presets or any custom color. Dayfold adjusts the shade for light and dark mode so text stays readable. Course colors are chosen per course (open a course). The app icon and launch screen come from `assets/source.png` (see below).

## Change the name, bundle ID, version or icon

Everything lives in **`app.config.json`**:

```json
{ "appName": "Dayfold", "bundleId": "com.karim.dayfold", "version": "1.0.0", "build": "1", "iosMinVersion": "15.0", "androidMinSdk": 24, "splashBackground": "#0b0b0c", "iconBackground": "#0b0b0c", "iconSource": "assets/source.png", "artifactBaseName": "Dayfold" }
```

The workflow also accepts **version** and **build** as inputs for a single run. Do not change `bundleId` after installing, or iOS treats it as a different app with empty data.

**One source image.** `assets/source.png` is a transparent mark. Replace it with your own (square, 1024 px or larger, transparent background) and run the workflow: the iOS icon, Android adaptive icon and both splash screens are generated from it by `scripts/make-assets.mjs`. To preview locally: `npm run assets`.

## Optional: stable Android signing

The default build is signed with the public Android debug key stored in `native/android/debug.keystore`. It is the same on every build, so updates install over the old app, but anyone could sign an APK with it. For a private key, make one once and add four repository secrets (Settings → Secrets and variables → Actions):

```bash
keytool -genkeypair -v -keystore dayfold.keystore -alias dayfold -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 dayfold.keystore      # paste the output as ANDROID_KEYSTORE_BASE64
```

**Switching from the debug key to your own key changes the signature**, so Android refuses to update over the old app: copy a backup, uninstall once, install the new APK and restore the backup.

Secrets: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. Keep the keystore file safe and out of git. With the secrets set, the workflow builds a release-signed APK.

## Develop

```bash
npm install
npm run dev        # runs in a browser; storage falls back to the browser, notifications are off
npm test           # on-device API, persistence, reminders
npm run test:e2e   # Playwright smoke test of the whole UI
```

The planner in `shared/` is copied from the Dayfold web repo. Pull planner fixes with `npm run sync:shared -- <path to that repo>`.

## What is not verified

The cloud builds themselves (Xcode on the macOS runner, Gradle on the Linux runner) could not be run where this project was written: the sandbox had no macOS and could not reach Google's Android and Gradle downloads. Everything that can run without them was checked: type check, lint, 48 unit tests, a browser end-to-end test, the Capacitor config, `cap add ios` and `cap add android`, icon and splash generation, and the patch scripts against the generated projects. If a workflow step fails, open its log and send me the error.

## License

PolyForm Noncommercial License 1.0.0 (see `LICENSE`). Free for noncommercial use; nobody may charge for it.

## Start-up animation and navigation

- The start-up animation plays for `startupSeconds` in `app.config.json` (default 10, `0` turns it off). Tap to skip it.
- Swipe left or right on a page to move between tabs. Hold the tab bar and slide to pick a page.
