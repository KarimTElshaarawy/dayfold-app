import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import type { ThemePref } from './hooks';

const systemDark = (): boolean => !!window.matchMedia?.('(prefers-color-scheme: dark)').matches;

/**
 * iOS: follow the in-app theme, or the system when it is "system" (Style.Default adapts by itself).
 * Android: the area behind the bar always follows the system theme (Android 15 ignores a custom bar color),
 * so the icon style follows the system theme too.
 */
export const syncStatusBar = (theme: ThemePref): void => {
  if (!Capacitor.isNativePlatform()) return;
  if (Capacitor.getPlatform() === 'android') {
    const dark = systemDark();
    // below Android 15 the web view must not draw under the bar (the page keeps no top inset there)
    void StatusBar.setOverlaysWebView({ overlay: false }).catch(() => undefined);
    void StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => undefined);
    void StatusBar.setBackgroundColor({ color: dark ? '#000000' : '#f5f5f7' }).catch(() => undefined);
    return;
  }
  const style = theme === 'system' ? Style.Default : theme === 'dark' ? Style.Dark : Style.Light;
  void StatusBar.setStyle({ style }).catch(() => undefined);
};

/** Re-apply when the system appearance flips while the app is open (for example automatic dark mode at sunset). */
export const watchSystemTheme = (getTheme: () => ThemePref): void => {
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => syncStatusBar(getTheme()));
};
