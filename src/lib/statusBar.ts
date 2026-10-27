import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import type { ThemePref } from './hooks';

const isDark = (theme: ThemePref): boolean => theme === 'dark' || (theme === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);

/** Keeps status bar text readable when the in-app theme differs from the system theme. */
export const syncStatusBar = (theme: ThemePref): void => {
  if (!Capacitor.isNativePlatform()) return;
  const dark = isDark(theme);
  void StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => undefined);
  if (Capacitor.getPlatform() === 'android') void StatusBar.setBackgroundColor({ color: dark ? '#000000' : '#f5f5f7' }).catch(() => undefined);
};
