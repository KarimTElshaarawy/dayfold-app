import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * The single source of truth for app identity: app.config.json.
 * Any value can be overridden per run with an environment variable (the workflow inputs use these).
 */
const FIELDS = {
  appName: 'DAYFOLD_APP_NAME',
  bundleId: 'DAYFOLD_BUNDLE_ID',
  version: 'DAYFOLD_VERSION',
  build: 'DAYFOLD_BUILD',
  iosMinVersion: 'DAYFOLD_IOS_MIN',
  androidMinSdk: 'DAYFOLD_ANDROID_MIN_SDK',
  splashBackground: 'DAYFOLD_SPLASH_BACKGROUND',
  iconBackground: 'DAYFOLD_ICON_BACKGROUND',
  iconSource: 'DAYFOLD_ICON_SOURCE',
  artifactBaseName: 'DAYFOLD_ARTIFACT_NAME',
};

export const loadConfig = (root = process.cwd(), env = process.env) => {
  const file = JSON.parse(readFileSync(resolve(root, 'app.config.json'), 'utf8'));
  const out = { ...file };
  for (const [key, envName] of Object.entries(FIELDS)) {
    const v = env[envName];
    if (v !== undefined && v !== '') out[key] = key === 'androidMinSdk' ? Number(v) : v;
  }
  for (const key of Object.keys(FIELDS)) {
    if (out[key] === undefined || out[key] === '') throw new Error(`app.config.json is missing "${key}"`);
  }
  // how long the start-up animation plays (tap skips it); 0 turns it off
  out.startupSeconds = Number(env.DAYFOLD_STARTUP_SECONDS || out.startupSeconds || 0);
  if (!(out.startupSeconds >= 0 && out.startupSeconds <= 30)) throw new Error(`Invalid startupSeconds: ${out.startupSeconds}`);
  if (!/^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/.test(out.bundleId)) throw new Error(`Invalid bundleId: ${out.bundleId}`);
  if (!/^\d+(\.\d+){0,2}$/.test(String(out.version))) throw new Error(`Invalid version: ${out.version}`);
  if (!/^\d+$/.test(String(out.build))) throw new Error(`Invalid build number: ${out.build}`);
  return out;
};

/** Prints KEY=value lines for $GITHUB_ENV, or one value by name. */
const main = () => {
  const c = loadConfig();
  const mode = process.argv[2];
  if (mode === 'github-env') {
    const lines = {
      APP_NAME: c.appName,
      BUNDLE_ID: c.bundleId,
      APP_VERSION: c.version,
      APP_BUILD: c.build,
      IOS_MIN: c.iosMinVersion,
      ANDROID_MIN_SDK: c.androidMinSdk,
      ARTIFACT_NAME: c.artifactBaseName,
    };
    for (const [k, v] of Object.entries(lines)) console.log(`${k}=${v}`);
  } else if (mode) {
    if (!(mode in c)) throw new Error(`Unknown key: ${mode}`);
    console.log(c[mode]);
  } else {
    console.log(JSON.stringify(c, null, 2));
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
