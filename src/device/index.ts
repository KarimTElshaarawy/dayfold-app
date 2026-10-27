import { createNotifier, type Notifier } from './notifications';
import { DeviceRepo } from './repo';
import { createRouter, type Router } from './router';
import { Service } from './service';
import { preferencesStore, type DocumentStore } from './storage';

export interface Device {
  repo: DeviceRepo;
  svc: Service;
  router: Router;
  notifier: Notifier;
}

let current: Device | null = null;

const deviceTimezone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

/** Loads stored data and wires the on-device "server". Call once before rendering. */
export const initDevice = async (store: DocumentStore = preferencesStore(), now: () => number = Date.now): Promise<Device> => {
  const repo = new DeviceRepo(store, deviceTimezone());
  await repo.load();
  const svc = new Service(repo, now);
  const notifier = createNotifier(svc, now);
  const router = createRouter(repo, svc, notifier);
  svc.ensureToday();
  current = { repo, svc, router, notifier };
  void notifier.sync().catch(() => undefined);
  return current;
};

export const getDevice = (): Device => {
  if (!current) throw new Error('Device not initialised');
  return current;
};
