import type { CapacitorConfig } from '@capacitor/cli';
import { loadConfig } from './scripts/config.mjs';

const app = loadConfig();

const config: CapacitorConfig = {
  appId: app.bundleId,
  appName: app.appName,
  webDir: 'dist',
  backgroundColor: app.splashBackground,
  ios: {
    // the web view draws under the status bar and home indicator; the CSS handles safe areas
    contentInset: 'never',
    limitsNavigationsToAppBoundDomains: false,
  },
  android: {
    allowMixedContent: false,
    // Android 15 draws apps edge to edge; this adds the status and navigation bar margins to the web view
    adjustMarginsForEdgeToEdge: 'auto',
  },
  plugins: {
    LocalNotifications: { smallIcon: 'ic_stat_dayfold' },
  },
};

export default config;
