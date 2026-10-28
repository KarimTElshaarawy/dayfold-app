import { BarChart3, CalendarDays, CircleDot, GraduationCap, Settings as Cog } from 'lucide-react';
import { Suspense } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Logo } from './Logo';
import { APP_NAME } from '../lib/appInfo';
import { useSwipeTabs } from '../lib/swipe';

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
      <nav className="tabbar" aria-label="Main">
        {items.map(({ to, label, Icon }) => (
          <NavLink key={to} to={to} className="tab">
            <Icon size={24} />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
};
