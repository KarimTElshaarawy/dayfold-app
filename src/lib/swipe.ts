import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const MIN_DISTANCE = 70;
const MAX_MS = 700;

/** True when the touch began inside something that scrolls sideways (the week grid, the day strip): that swipe belongs to it. */
const scrollsSideways = (from: Element | null): boolean => {
  for (let node = from; node && node !== document.body; node = node.parentElement) {
    const { overflowX } = getComputedStyle(node);
    if ((overflowX === 'auto' || overflowX === 'scroll') && node.scrollWidth > node.clientWidth + 1) return true;
  }
  return false;
};

/**
 * Swipe left or right anywhere on a page to move to the next or previous tab, in tab bar order.
 * Ignored while a pop-up or the keyboard is open, over text fields, and over anything that scrolls sideways.
 */
export const useSwipeTabs = (paths: readonly string[]): void => {
  const navigate = useNavigate();
  useEffect(() => {
    let start: { x: number; y: number; at: number; target: Element | null } | null = null;
    const onStart = (e: TouchEvent): void => {
      const t = e.touches[0];
      start = e.touches.length === 1 && t ? { x: t.clientX, y: t.clientY, at: Date.now(), target: e.target as Element | null } : null;
    };
    const onEnd = (e: TouchEvent): void => {
      const from = start;
      start = null;
      const t = e.changedTouches[0];
      if (!from || !t || e.touches.length > 0) return;
      const dx = t.clientX - from.x;
      const dy = t.clientY - from.y;
      if (Math.abs(dx) < MIN_DISTANCE || Math.abs(dx) < Math.abs(dy) * 2 || Date.now() - from.at > MAX_MS) return;
      if (document.querySelector('.sheet-wrap') || document.documentElement.classList.contains('kb-open')) return;
      if (from.target?.closest('input, textarea, select, [data-no-swipe]') || scrollsSideways(from.target)) return;
      // the tab is read when the swipe ends, not when the listener was set up, so a quick swipe right after a swipe is still right
      const pathname = window.location.pathname;
      const here = paths.findIndex((p) => pathname === p || pathname.startsWith(`${p}/`));
      const next = here < 0 ? undefined : paths[here + (dx < 0 ? 1 : -1)];
      if (!next) return;
      const root = document.documentElement;
      root.dataset.swipe = dx < 0 ? 'next' : 'prev';
      window.setTimeout(() => delete root.dataset.swipe, 700);
      navigate(next);
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
  }, [paths, navigate]);
};
