import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadConfig } from './config.mjs';

/**
 * Applies app.config.json to the generated Xcode project (ios/ is created fresh by `cap add ios` in CI):
 * the Info.plist keys that Capacitor's template hard-codes, and the app target's version, build number,
 * bundle id and deployment target in project.pbxproj (the workflow passes no overrides to xcodebuild).
 */
const cfg = loadConfig();
const plistPath = resolve('ios/App/App/Info.plist');
if (!existsSync(plistPath)) throw new Error('ios/App/App/Info.plist not found. Run `npx cap add ios` first.');
let plist = readFileSync(plistPath, 'utf8');

const esc = (s) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;');

const setString = (key, value) => {
  const re = new RegExp(`(<key>${key}</key>\\s*<string>)[^<]*(</string>)`);
  if (re.test(plist)) plist = plist.replace(re, `$1${esc(value)}$2`);
  else plist = plist.replace('</dict>\n</plist>', `\t<key>${key}</key>\n\t<string>${esc(value)}</string>\n</dict>\n</plist>`);
};
const setArray = (key, values) => {
  const body = values.map((v) => `\t\t<string>${v}</string>`).join('\n');
  const re = new RegExp(`(<key>${key}</key>\\s*<array>)[\\s\\S]*?(</array>)`);
  if (!re.test(plist)) throw new Error(`Info.plist has no ${key}`);
  plist = plist.replace(re, `$1\n${body}\n\t$2`);
};
const setBool = (key, value) => {
  const re = new RegExp(`<key>${key}</key>\\s*<(true|false)/>`);
  const line = `<key>${key}</key>\n\t<${value}/>`;
  if (re.test(plist)) plist = plist.replace(re, line);
  else plist = plist.replace('</dict>\n</plist>', `\t${line}\n</dict>\n</plist>`);
};

setString('CFBundleDisplayName', cfg.appName);
// iPhone portrait only; iPad keeps both portrait orientations
setArray('UISupportedInterfaceOrientations', ['UIInterfaceOrientationPortrait']);
setArray('UISupportedInterfaceOrientations~ipad', ['UIInterfaceOrientationPortrait', 'UIInterfaceOrientationPortraitUpsideDown']);
// every supported iPhone is 64-bit; the template still says armv7
setArray('UIRequiredDeviceCapabilities', ['arm64']);
setBool('ITSAppUsesNonExemptEncryption', 'false');

writeFileSync(plistPath, plist);

// Build settings live in the app target of the Xcode project (the Pods are a separate project and keep their own ids).
const pbxPath = resolve('ios/App/App.xcodeproj/project.pbxproj');
let pbx = readFileSync(pbxPath, 'utf8');
const setting = (name, value) => {
  const re = new RegExp(`${name} = [^;]+;`, 'g');
  if (!re.test(pbx)) throw new Error(`project.pbxproj has no ${name}`);
  pbx = pbx.replace(re, `${name} = ${value};`);
};
setting('MARKETING_VERSION', cfg.version);
setting('CURRENT_PROJECT_VERSION', cfg.build);
setting('IPHONEOS_DEPLOYMENT_TARGET', cfg.iosMinVersion);
setting('PRODUCT_BUNDLE_IDENTIFIER', cfg.bundleId);
writeFileSync(pbxPath, pbx);

const podfilePath = resolve('ios/App/Podfile');
if (existsSync(podfilePath)) {
  const podfile = readFileSync(podfilePath, 'utf8').replace(/platform :ios, '[^']*'/, `platform :ios, '${cfg.iosMinVersion}'`);
  writeFileSync(podfilePath, podfile);
}
console.log(`Xcode project patched for ${cfg.appName} ${cfg.version} (${cfg.build}), ${cfg.bundleId}, iOS ${cfg.iosMinVersion}+`);
