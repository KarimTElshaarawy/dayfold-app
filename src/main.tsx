import '@fontsource-variable/inter';
import { App as CapApp } from '@capacitor/app';
import { QueryClientProvider } from '@tanstack/react-query';
import { LucideProvider } from 'lucide-react';
import { LazyMotion, MotionConfig, domAnimation } from 'motion/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { StartupError } from './components/StartupError';
import { ToastProvider } from './components/Toast';
import { getDevice, initDevice } from './device';
import { applyTheme, getTheme } from './lib/hooks';
import { bootQuery, queryClient } from './lib/query';
import { applyAccent } from './lib/accent';
import { installFieldDefaults, installKeyboardDismissal, syncKeyboard, watchKeyboard, watchKeyboardState } from './lib/keyboard';
import { syncStatusBar, watchSystemTheme } from './lib/statusBar';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/pages.css';

applyTheme(getTheme());
syncStatusBar(getTheme());
watchSystemTheme(getTheme);
installKeyboardDismissal();
installFieldDefaults();
watchKeyboardState();
watchKeyboard(getTheme);
syncKeyboard(getTheme());

const root = createRoot(document.getElementById('root') as HTMLElement);

const start = async (): Promise<void> => {
  try {
    // the spinning logo (drawn by index.html) shows for at least a moment, so it reads as a start-up and not a flash
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    await Promise.all([initDevice(), new Promise<void>((done) => window.setTimeout(done, reduced ? 0 : 1900))]);
    applyAccent(getDevice().repo.getPrefs().accent);
    // have the first screen's data ready, so the spinning logo hands over straight to the app (no second splash)
    await queryClient.fetchQuery(bootQuery);
    // the start-up screen eases out instead of cutting to the app
    if (!reduced) {
      document.querySelector('.boot')?.classList.add('boot-out');
      await new Promise<void>((done) => window.setTimeout(done, 340));
    }
  } catch (error) {
    // never leave a blank screen: offer a way to see, copy or reset the stored data
    root.render(<StartupError error={error} />);
    return;
  }
  root.render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <LucideProvider strokeWidth={1.6}>
          <LazyMotion features={domAnimation} strict>
            <MotionConfig reducedMotion="user">
              <ToastProvider>
                <App />
              </ToastProvider>
            </MotionConfig>
          </LazyMotion>
        </LucideProvider>
      </QueryClientProvider>
    </StrictMode>,
  );
  // coming back to the app: roll the day over, refresh the plan and rebuild the morning notifications
  void CapApp.addListener('resume', () => {
    const { svc, notifier } = getDevice();
    svc.ensureToday();
    syncStatusBar(getTheme());
    syncKeyboard(getTheme());
    void notifier.sync().catch(() => undefined);
    void queryClient.invalidateQueries();
  });
  // going to the background: make sure the latest changes are on disk
  void CapApp.addListener('pause', () => {
    const { repo, notifier } = getDevice();
    repo.flush().catch(() => undefined);
    // do not wait for the 800 ms edit timer: the app may be frozen before it fires
    void notifier.sync().catch(() => undefined);
  });
};

void start();
