import { useEffect, useState } from 'react';
import { applyAccent } from './accent';
import { syncStatusBar } from './statusBar';

export const useNow = (intervalMs = 30_000): number => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(t);
  }, [intervalMs]);
  return now;
};

export type ThemePref = 'system' | 'light' | 'dark';
export const getTheme = (): ThemePref => {
  try {
    return (localStorage.getItem('dayfold-theme') as ThemePref | null) ?? 'system';
  } catch {
    return 'system';
  }
};
export const applyTheme = (t: ThemePref): void => {
  const root = document.documentElement;
  if (t === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', t);
  syncStatusBar(t);
  applyAccent();
  try {
    localStorage.setItem('dayfold-theme', t);
  } catch {
    // storage unavailable
  }
};
