import { createNotifier } from '../src/device/notifications';
import { DeviceRepo } from '../src/device/repo';
import { createRouter } from '../src/device/router';
import { Service } from '../src/device/service';
import { memoryStore, type DocumentStore } from '../src/device/storage';

/** Mon 26 Oct 2026, 10:00 in Asia/Dubai */
export const NOW = Date.UTC(2026, 9, 26, 6, 0);

export const makeDevice = async (store: DocumentStore = memoryStore(), clock = { now: NOW }) => {
  const repo = new DeviceRepo(store, 'Asia/Dubai');
  await repo.load();
  const svc = new Service(repo, () => clock.now);
  const notifier = createNotifier(svc, () => clock.now);
  const router = createRouter(repo, svc, notifier);
  const req = async (method: string, url: string, body?: unknown) => {
    const r = await router.handle(method, url, body);
    return { status: r.status, json: r.json as any };
  };
  await req('PUT', '/api/settings', { timezone: 'Asia/Dubai', name: 'Sam', setupDone: true });
  return { repo, svc, router, req, clock, store };
};
