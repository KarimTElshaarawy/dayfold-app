import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Shell } from './components/Shell';
import { Logo } from './components/Logo';
import { StartupError } from './components/StartupError';
import { useBoot } from './lib/query';
import { NotFound } from './pages/NotFound';
import { Today } from './pages/Today';

const loaders = {
  exams: () => import('./pages/Exams').then((m) => ({ default: m.Exams })),
  settings: () => import('./pages/Settings').then((m) => ({ default: m.Settings })),
  setup: () => import('./pages/Setup').then((m) => ({ default: m.Setup })),
  stats: () => import('./pages/Stats').then((m) => ({ default: m.Stats })),
  week: () => import('./pages/Week').then((m) => ({ default: m.Week })),
};
const Exams = lazy(loaders.exams);
const Settings = lazy(loaders.settings);
const Setup = lazy(loaders.setup);
const Stats = lazy(loaders.stats);
const Week = lazy(loaders.week);

/** Loads every page's code up front (during the start-up animation), so switching tabs never waits on it. */
export const preloadPages = (): Promise<unknown> => Promise.all(Object.values(loaders).map((load) => load()));

/** The same spinning logo as the start-up screen in index.html, so loading never looks like a different screen. */
const Splash = () => (
  <div className="boot again" role="status" aria-label="Loading">
    <Logo size={76} className="boot-logo" />
  </div>
);

const Routed = () => {
  const boot = useBoot();
  if (boot.isError && !boot.data) return <StartupError error={boot.error} />;
  if (!boot.data) return <Splash />;
  const done = boot.data.settings.setupDone;
  return (
    <Routes>
      <Route path="/setup" element={done ? <Navigate to="/today" replace /> : <Setup />} />
      <Route element={done ? <Shell /> : <Navigate to="/setup" replace />}>
        <Route path="/" element={<Navigate to="/today" replace />} />
        <Route path="/today" element={<Today />} />
        <Route path="/exams" element={<Exams />} />
        <Route path="/week" element={<Week />} />
        <Route path="/stats" element={<Stats />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

export const App = () => (
  <BrowserRouter>
    <Suspense fallback={<Splash />}>
      <Routed />
    </Suspense>
  </BrowserRouter>
);
