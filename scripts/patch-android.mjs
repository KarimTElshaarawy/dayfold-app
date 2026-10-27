import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadConfig } from './config.mjs';

/** Applies app.config.json to the generated Android project (android/ is created fresh by `cap add android` in CI). */
const cfg = loadConfig();
const root = resolve('android');
if (!existsSync(root)) throw new Error('android/ not found. Run `npx cap add android` first.');

const edit = (file, fn) => {
  const path = resolve(root, file);
  const before = readFileSync(path, 'utf8');
  const after = fn(before);
  if (after === before) console.log(`note: ${file} unchanged`);
  writeFileSync(path, after);
};

edit('variables.gradle', (s) => s.replace(/minSdkVersion = \d+/, `minSdkVersion = ${cfg.androidMinSdk}`));
edit('app/build.gradle', (s) =>
  s
    .replace(/versionCode \d+/, `versionCode ${Number(cfg.build)}`)
    .replace(/versionName "[^"]*"/, `versionName "${cfg.version}"`),
);
// optional release signing: only active when the keystore variables are set (the workflow sets them from repository secrets)
edit('app/build.gradle', (s) => {
  if (s.includes('ANDROID_KEYSTORE_FILE')) return s;
  const signing = `    signingConfigs {
        release {
            if (System.getenv("ANDROID_KEYSTORE_FILE")) {
                storeFile file(System.getenv("ANDROID_KEYSTORE_FILE"))
                storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")
                keyAlias System.getenv("ANDROID_KEY_ALIAS")
                keyPassword System.getenv("ANDROID_KEY_PASSWORD")
            }
        }
    }
    buildTypes {`;
  const withConfig = s.replace('    buildTypes {', signing);
  return withConfig.replace('        release {\n            minifyEnabled false', '        release {\n            if (System.getenv("ANDROID_KEYSTORE_FILE")) {\n                signingConfig signingConfigs.release\n            }\n            minifyEnabled false');
});
// stable debug signing: one public debug key kept in the repo, so every build (any run, any tag) has the same signature
edit('app/build.gradle', (s) => {
  if (s.includes('dayfold-debug-key')) return s;
  return s.replace('    signingConfigs {\n', `    signingConfigs {
        debug {
            // dayfold-debug-key: the standard public Android debug credentials; not a secret
            storeFile file("\${rootDir}/../native/android/debug.keystore")
            storePassword "android"
            keyAlias "androiddebugkey"
            keyPassword "android"
        }
`);
});

edit('app/src/main/AndroidManifest.xml', (s) => {
  let out = s;
  if (!out.includes('android.permission.POST_NOTIFICATIONS')) {
    out = out.replace('<uses-permission android:name="android.permission.INTERNET" />', '<uses-permission android:name="android.permission.INTERNET" />\n    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />');
  }
  // exact alarms, so a "starts in 5 min" reminder is not held back by Doze
  if (!out.includes('android.permission.USE_EXACT_ALARM')) {
    out = out.replace('<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />', '<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />\n    <uses-permission android:name="android.permission.USE_EXACT_ALARM" />');
  }
  if (!out.includes('android:screenOrientation')) out = out.replace('android:launchMode="singleTask"', 'android:launchMode="singleTask"\n            android:screenOrientation="portrait"\n            android:windowSoftInputMode="adjustResize"');
  return out;
});
cpSync(resolve('native/android/res'), resolve(root, 'app/src/main/res'), { recursive: true });
console.log(`Android project patched for ${cfg.appName} ${cfg.version} (${cfg.build}), minSdk ${cfg.androidMinSdk}`);
