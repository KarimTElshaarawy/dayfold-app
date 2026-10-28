export interface AppConfig {
  appName: string;
  bundleId: string;
  version: string;
  build: string;
  iosMinVersion: string;
  androidMinSdk: number;
  splashBackground: string;
  iconBackground: string;
  iconSource: string;
  artifactBaseName: string;
  startupSeconds: number;
}
export function loadConfig(root?: string, env?: NodeJS.ProcessEnv): AppConfig;
