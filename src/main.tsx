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
import { queryClient } from './lib/query';
import { syncStatusBar, watchSystemTheme } from './lib/statusBar';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/pages.css';

applyTheme(getTheme());
syncStatusBar(getTheme());
watchSystemTheme(getTheme);

const root = createRoot(document.getElementById('root') as HTMLElement);

const start = async (): Promise<void> => {
  try {
    await initDevice();
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
    void notifier.sync().catch(() => undefined);
    void queryClient.invalidateQueries();
  });
  // going to the background: make sure the latest changes are on disk
  void CapApp.addListener('pause', () => {
    getDevice().repo.flush().catch(() => undefined);
  });
};

void start();
