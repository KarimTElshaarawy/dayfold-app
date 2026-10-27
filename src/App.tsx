import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Shell } from './components/Shell';
import { Skeleton } from './components/ui';
import { useBoot } from './lib/query';
import { NotFound } from './pages/NotFound';
import { Today } from './pages/Today';

const Exams = lazy(() => import('./pages/Exams').then((m) => ({ default: m.Exams })));
const Settings = lazy(() => import('./pages/Settings').then((m) => ({ default: m.Settings })));
const Setup = lazy(() => import('./pages/Setup').then((m) => ({ default: m.Setup })));
const Stats = lazy(() => import('./pages/Stats').then((m) => ({ default: m.Stats })));
const Week = lazy(() => import('./pages/Week').then((m) => ({ default: m.Week })));

const Splash = () => (
  <div className="center-screen" aria-busy="true">
    <Skeleton h={120} w={120} r={60} />
  </div>
);

const Routed = () => {
  const boot = useBoot();
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
