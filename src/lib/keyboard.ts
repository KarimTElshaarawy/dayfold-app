import { Capacitor } from '@capacitor/core';
import { Keyboard, KeyboardStyle } from '@capacitor/keyboard';
import type { ThemePref } from './hooks';

/**
 * iOS web views add a grey bar above the keyboard (arrows and Done). It is hidden here, and the keyboard
 * follows the app's Light / Dark / System choice instead of looking out of place.
 * Other platforms already show their normal keyboard.
 */
export const syncKeyboard = (theme: ThemePref): void => {
  if (Capacitor.getPlatform() !== 'ios') return;
  void Keyboard.setAccessoryBarVisible({ isVisible: false }).catch(() => undefined);
  const style = theme === 'dark' ? KeyboardStyle.Dark : theme === 'light' ? KeyboardStyle.Light : KeyboardStyle.Default;
  void Keyboard.setStyle({ style }).catch(() => undefined);
};

/** With the Done bar gone: Return closes the keyboard on single-line fields, and tapping outside a field closes it too. */
/** Re-applies the look every time the keyboard opens, so the system cannot bring the bar back. */
export const watchKeyboard = (getTheme: () => ThemePref): void => {
  if (Capacitor.getPlatform() !== 'ios') return;
  void Keyboard.addListener('keyboardWillShow', () => syncKeyboard(getTheme())).catch(() => undefined);
};

export const installKeyboardDismissal = (): void => {
  document.addEventListener('keydown', (e) => {
    const el = e.target as HTMLElement | null;
    if (e.key === 'Enter' && el instanceof HTMLInputElement && el.type !== 'checkbox' && el.type !== 'file') el.blur();
  });
  document.addEventListener('pointerdown', (e) => {
    const active = document.activeElement;
    if (!(active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement)) return;
    const target = e.target as Element | null;
    if (!target?.closest('input, textarea, select, label')) active.blur();
  });
};

const tune = (el: Element): void => {
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
  if (el instanceof HTMLInputElement && ['checkbox', 'radio', 'file', 'color', 'range', 'button', 'submit'].includes(el.type)) return;
  // fields behave like app fields: no red-underline spell check, no predictive suggestion bar, no auto-fill
  if (!el.hasAttribute('autocorrect')) el.setAttribute('autocorrect', 'off');
  if (!el.hasAttribute('autocomplete')) el.setAttribute('autocomplete', 'off');
  el.spellcheck = false;
  if (!el.hasAttribute('autocapitalize')) el.setAttribute('autocapitalize', el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && el.type === 'email') ? 'none' : 'words');
  if (el instanceof HTMLInputElement && !el.hasAttribute('enterkeyhint')) el.setAttribute('enterkeyhint', 'done');
};

/** Applies the same keyboard behavior to every text field, now and as screens and sheets open. */
export const installFieldDefaults = (): void => {
  document.querySelectorAll('input, textarea').forEach(tune);
  new MutationObserver((records) => {
    for (const r of records) {
      r.addedNodes.forEach((n) => {
        if (!(n instanceof Element)) return;
        tune(n);
        n.querySelectorAll('input, textarea').forEach(tune);
      });
    }
  }).observe(document.body, { childList: true, subtree: true });
};
