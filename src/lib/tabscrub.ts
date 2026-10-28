import { useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { buzz } from './format';
import { slideDirection } from './swipe';

const HOLD_MS = 240;
const DRAG_PX = 10;

/**
 * Hold the tab bar (or just drag along it) and slide to the page you want: a lens follows your finger, the tab under it
 * lifts and a bubble names the page. Letting go opens that page. A plain tap still works as a normal tap.
 */
export const useTabScrub = (paths: readonly string[]) => {
  const navigate = useNavigate();
  const [hover, setHover] = useState<number | null>(null);
  const gesture = useRef<{ id: number; x: number; y: number; scrubbing: boolean; timer: number | undefined } | null>(null);
  const suppressClick = useRef(false);
  const hoverRef = useRef<number | null>(null);

  const indexAt = (nav: HTMLElement, clientX: number): number => {
    const box = nav.getBoundingClientRect();
    // the bar's own horizontal padding (--tabbar-pad in components.css), so the lens and the finger always agree
    const pad = parseFloat(getComputedStyle(nav).paddingLeft) || 0;
    const column = (box.width - pad * 2) / paths.length;
    return Math.min(paths.length - 1, Math.max(0, Math.floor((clientX - box.left - pad) / column)));
  };
  const setHovered = (i: number | null): void => {
    if (hoverRef.current === i) return;
    hoverRef.current = i;
    setHover(i);
    if (i !== null) buzz(8);
  };
  const stop = (): void => {
    const g = gesture.current;
    if (g) window.clearTimeout(g.timer);
    gesture.current = null;
    setHovered(null);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLElement>): void => {
    if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
    // a new touch starts a new gesture: the click swallowing below only ever covers the release that just happened
    suppressClick.current = false;
    const nav = e.currentTarget;
    const g = { id: e.pointerId, x: e.clientX, y: e.clientY, scrubbing: false, timer: undefined as number | undefined };
    const begin = (clientX: number): void => {
      if (gesture.current !== g) return;
      g.scrubbing = true;
      try {
        nav.setPointerCapture(g.id);
      } catch {
        // the pointer is already gone
      }
      setHovered(indexAt(nav, clientX));
    };
    // a hold that stays put starts scrubbing too
    g.timer = window.setTimeout(() => begin(g.x), HOLD_MS);
    gesture.current = g;
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLElement>): void => {
    const g = gesture.current;
    if (!g || e.pointerId !== g.id) return;
    const nav = e.currentTarget;
    if (!g.scrubbing) {
      const dx = e.clientX - g.x;
      const dy = e.clientY - g.y;
      if (Math.abs(dx) > DRAG_PX && Math.abs(dx) > Math.abs(dy)) {
        window.clearTimeout(g.timer);
        g.scrubbing = true;
        try {
          nav.setPointerCapture(g.id);
        } catch {
          // gone
        }
      } else {
        if (Math.abs(dy) > 14) stop();
        return;
      }
    }
    setHovered(indexAt(nav, e.clientX));
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLElement>): void => {
    const g = gesture.current;
    if (!g || e.pointerId !== g.id) return;
    const target = g.scrubbing ? indexAt(e.currentTarget, e.clientX) : null;
    const wasScrubbing = g.scrubbing;
    stop();
    if (!wasScrubbing || target === null) return;
    // the click that follows the release must not also hit whatever tab is under the finger
    suppressClick.current = true;
    window.setTimeout(() => {
      suppressClick.current = false;
    }, 350);
    const here = paths.findIndex((p) => window.location.pathname === p || window.location.pathname.startsWith(`${p}/`));
    const next = paths[target];
    if (next && target !== here) {
      slideDirection(target > here ? 'next' : 'prev');
      navigate(next);
    }
  };

  const onClickCapture = (e: ReactMouseEvent<HTMLElement>): void => {
    if (suppressClick.current) {
      e.preventDefault();
      e.stopPropagation();
      suppressClick.current = false;
    }
  };

  return { hover, handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: stop, onClickCapture } };
};
