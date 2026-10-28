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

/** Re-applies the look every time the keyboard opens, so the system cannot bring the bar back. */
export const watchKeyboard = (getTheme: () => ThemePref): void => {
  if (Capacitor.getPlatform() !== 'ios') return;
  void Keyboard.addListener('keyboardWillShow', () => syncKeyboard(getTheme())).catch(() => undefined);
};

const NON_TEXT = ['checkbox', 'radio', 'file', 'color', 'range', 'button', 'submit', 'reset', 'image'];
/** A field that opens the keyboard. Read-only and disabled fields do not, so they must not count. */
export const isTextField = (el: Element | null): boolean =>
  (el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && !NON_TEXT.includes(el.type))) && !el.readOnly && !el.disabled;
/** Anything a tap can act on. Tapping these must reach their click handler, so they never dismiss the keyboard on press. */
const TAPPABLE = 'input, textarea, select, button, a, label, summary, [role="button"], [role="switch"], [role="checkbox"], [role="tab"]';

export const installKeyboardDismissal = (): void => {
  document.addEventListener('keydown', (e) => {
    const el = e.target as HTMLElement | null;
    if (e.key !== 'Enter' || !(el instanceof HTMLInputElement) || el.type === 'checkbox' || el.type === 'file') return;
    if (el.form) {
      e.preventDefault();
      el.form.requestSubmit();
    }
    el.blur();
  });
  // Tapping empty space closes the keyboard. Tapping a button must not close it on PRESS: that resizes the screen
  // under the finger, the button moves away and the tap is lost (the copy and tab bar bugs).
  document.addEventListener('pointerdown', (e) => {
    if (!isTextField(document.activeElement) && !(document.activeElement instanceof HTMLSelectElement)) return;
    const target = e.target as Element | null;
    if (!target?.closest(TAPPABLE)) (document.activeElement as HTMLElement).blur();
  });
  // A button on iOS does not take focus from the field, so the field would never "blur-save" (times, names) before the
  // button acts. Blur it in the capture phase of the click: this runs before React's handlers, so the typed value is
  // committed first, and the keyboard closes only after the tap has landed.
  document.addEventListener(
    'click',
    (e) => {
      const active = document.activeElement;
      if (!(active instanceof HTMLElement) || !(isTextField(active) || active instanceof HTMLSelectElement)) return;
      const target = e.target as Element | null;
      const tapped = target?.closest(TAPPABLE);
      if (tapped && !tapped.matches('input, textarea, select, label') && !tapped.hasAttribute('data-keep-keyboard')) active.blur();
    },
    true,
  );
};

/**
 * Marks <html class="kb-open"> while the keyboard is up (a text field has focus or the system says the keyboard is showing),
 * so the bottom tab bar can get out of the way instead of riding above the keyboard.
 */
export const watchKeyboardState = (): void => {
  const root = document.documentElement;
  let focused = false;
  let shown = false;
  const apply = (): void => {
    root.classList.toggle('kb-open', focused || shown);
  };
  let timer: number | undefined;
  document.addEventListener('focusin', (e) => {
    window.clearTimeout(timer);
    focused = isTextField(e.target as Element | null);
    apply();
  });
  document.addEventListener('focusout', () => {
    // a short delay so moving from one field to the next does not flash the tab bar
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      focused = isTextField(document.activeElement);
      apply();
    }, 80);
  });
  if (Capacitor.isNativePlatform()) {
    void Keyboard.addListener('keyboardWillShow', () => { shown = true; apply(); }).catch(() => undefined);
    void Keyboard.addListener('keyboardDidHide', () => { shown = false; focused = false; apply(); }).catch(() => undefined);
  }
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
