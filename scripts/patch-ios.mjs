import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadConfig } from './config.mjs';

/**
 * Applies app.config.json to the generated Xcode project (ios/ is created fresh by `cap add ios` in CI).
 * Version, build, bundle id and deployment target are passed to xcodebuild as build settings in the workflow;
 * this script fixes the Info.plist keys that Capacitor's template hard-codes.
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
console.log(`Info.plist patched for ${cfg.appName} ${cfg.version} (${cfg.build})`);
