import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { isTextField, justDismissedKeyboard } from './keyboard';

const MIN_DISTANCE = 70;
const MAX_MS = 700;
/** The slide-in lasts the longest page animation (0.25 s delay + 0.5 s) plus a margin: the attribute must outlive it. */
const SLIDE_MS = 950;

let slideTimer: number | undefined;
/** Tells the page transition which side the next page should slide in from. Cleared only after the animation has ended. */
export const slideDirection = (dir: 'next' | 'prev'): void => {
  const root = document.documentElement;
  root.dataset.swipe = dir;
  window.clearTimeout(slideTimer);
  slideTimer = window.setTimeout(() => delete root.dataset.swipe, SLIDE_MS);
};

/** True when the touch began inside something that scrolls sideways (the week grid, the day strip): that swipe belongs to it. */
const scrollsSideways = (from: Element | null): boolean => {
  for (let node = from; node && node !== document.body; node = node.parentElement) {
    const { overflowX } = getComputedStyle(node);
    if ((overflowX === 'auto' || overflowX === 'scroll') && node.scrollWidth > node.clientWidth + 1) return true;
  }
  return false;
};

/** A pop-up is open, or the keyboard is (or has just been closed by this very touch): a sideways drag then is not a page swipe. */
const blocked = (): boolean =>
  !!document.querySelector('.sheet-wrap') || document.documentElement.classList.contains('kb-open') || isTextField(document.activeElement) || justDismissedKeyboard();

/**
 * Swipe left or right anywhere on a page to move to the next or previous tab, in tab bar order.
 * Ignored while a pop-up or the keyboard is open, over text fields, over anything that scrolls sideways,
 * and when the page itself scrolled during the gesture.
 */
export const useSwipeTabs = (paths: readonly string[]): void => {
  const navigate = useNavigate();
  const go = useRef(navigate);
  go.current = navigate;
  useEffect(() => {
    let start: { x: number; y: number; at: number; scrollY: number; target: Element | null; blocked: boolean } | null = null;
    const onEnd = (e: TouchEvent): void => {
      const from = start;
      start = null;
      const t = e.changedTouches[0];
      if (!from || !t || e.touches.length > 0 || from.blocked) return;
      const dx = t.clientX - from.x;
      const dy = t.clientY - from.y;
      if (Math.abs(dx) < MIN_DISTANCE || Math.abs(dx) < Math.abs(dy) * 2 || Date.now() - from.at > MAX_MS) return;
      // a drag that scrolled the page is a scroll, even if it drifted sideways
      if (Math.abs(window.scrollY - from.scrollY) > 4) return;
      if (blocked()) return;
      if (from.target?.closest('input, textarea, select, [data-no-swipe]') || scrollsSideways(from.target)) return;
      // the tab is read when the swipe ends, not when the listener was set up, so a quick swipe right after a swipe is still right
      const pathname = window.location.pathname;
      const here = paths.findIndex((p) => pathname === p || pathname.startsWith(`${p}/`));
      const next = here < 0 ? undefined : paths[here + (dx < 0 ? 1 : -1)];
      if (!next) return;
      slideDirection(dx < 0 ? 'next' : 'prev');
      go.current(next);
    };
    const onStart = (e: TouchEvent): void => {
      const t = e.touches[0];
      if (e.touches.length !== 1 || !t) {
        start = null;
        return;
      }
      const target = e.target as Element | null;
      start = { x: t.clientX, y: t.clientY, at: Date.now(), scrollY: window.scrollY, target, blocked: blocked() };
      // if the element under the finger is replaced mid-gesture (a refresh re-renders it), its touchend never reaches the document: listen on it too
      target?.addEventListener('touchend', onEnd as EventListener, { once: true, passive: true });
    };
    const onCancel = (): void => {
      start = null;
    };
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: true });
    document.addEventListener('touchcancel', onCancel, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onCancel);
    };
  }, [paths]);
};
