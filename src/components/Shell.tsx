import { BarChart3, CalendarDays, CircleDot, GraduationCap, Settings as Cog } from 'lucide-react';
import { Suspense, useEffect, useRef, useState, type CSSProperties } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Logo } from './Logo';
import { APP_NAME } from '../lib/appInfo';
import { useSwipeTabs } from '../lib/swipe';
import { useTabScrub } from '../lib/tabscrub';

const items = [
  { to: '/today', label: 'Today', Icon: CircleDot },
  { to: '/exams', label: 'Exams', Icon: GraduationCap },
  { to: '/week', label: 'Week', Icon: CalendarDays },
  { to: '/stats', label: 'Stats', Icon: BarChart3 },
  { to: '/settings', label: 'Settings', Icon: Cog },
];

const PATHS = items.map((i) => i.to);

export const Shell = () => {
  useSwipeTabs(PATHS);
  const { hover, handlers } = useTabScrub(PATHS);
  const bar = useRef<HTMLElement>(null);
  // the lens keeps the last tab it was over, so it fades out where it was instead of sweeping back to the first tab
  const [lastHover, setLastHover] = useState(0);
  useEffect(() => {
    if (hover !== null) setLastHover(hover);
  }, [hover]);
  // A drag along the bar must not scroll or pan the page. This has to be a native non-passive listener (React's are passive).
  useEffect(() => {
    const nav = bar.current;
    if (!nav) return;
    const stopPan = (e: TouchEvent): void => {
      if (e.cancelable) e.preventDefault();
    };
    nav.addEventListener('touchmove', stopPan, { passive: false });
    return () => nav.removeEventListener('touchmove', stopPan);
  }, []);
  return (
    <div className="shell">
      <nav className="sidebar" aria-label="Main">
        <div className="brand">
          <Logo />
          {APP_NAME}
        </div>
        {items.map(({ to, label, Icon }) => (
          <NavLink key={to} to={to} className="side-link">
            <Icon size={20} />
            {label}
          </NavLink>
        ))}
      </nav>
      <main className="main">
        <div className="page">
          {/* a page that is still loading shows a small spinning logo here, not a full-screen splash */}
          <Suspense fallback={<div className="page-loading"><Logo size={40} className="boot-logo" /></div>}>
            <Outlet />
          </Suspense>
        </div>
      </main>
      <nav ref={bar} className={`tabbar${hover !== null ? ' scrubbing' : ''}`} aria-label="Main" data-no-swipe style={{ '--hover': hover ?? lastHover, '--tab-count': items.length } as CSSProperties} {...handlers}>
        {/* the lens and the bubble only show while a finger is sliding along the bar */}
        <span className="tab-lens" aria-hidden="true" />
        {hover !== null && <span className="tab-bubble" aria-hidden="true">{items[hover]?.label}</span>}
        {items.map(({ to, label, Icon }, i) => (
          <NavLink key={to} to={to} className={`tab${hover === i ? ' hover' : ''}`} draggable={false}>
            <Icon size={24} />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
};
