import { Clipboard } from '@capacitor/clipboard';
import { Capacitor } from '@capacitor/core';

/** The web view's own copy: works when the other ways are not allowed (no user gesture, no permission). */
const legacyCopy = (text: string): boolean => {
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0';
  document.body.appendChild(area);
  area.select();
  area.setSelectionRange(0, text.length);
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    area.remove();
  }
};

/** Copies text to the clipboard. Uses the phone's own clipboard first, then the browser's. Resolves false only if every way failed. */
export const copyText = async (text: string): Promise<boolean> => {
  if (Capacitor.isNativePlatform()) {
    try {
      await Clipboard.write({ string: text });
      return true;
    } catch {
      // fall through to the web view's ways
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return legacyCopy(text);
  }
};
