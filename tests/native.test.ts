import { beforeEach, describe, expect, it, vi } from 'vitest';

const prefs = new Map<string, string>();
const cancelled: number[] = [];
const scheduled: Array<{ id: number }> = [];
let pending: number[] = [];

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios' } }));
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: async ({ key }: { key: string }) => ({ value: prefs.get(key) ?? null }),
    set: async ({ key, value }: { key: string; value: string }) => void prefs.set(key, value),
    remove: async ({ key }: { key: string }) => void prefs.delete(key),
  },
}));
vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    checkPermissions: async () => ({ display: 'granted' }),
    requestPermissions: async () => ({ display: 'granted' }),
    createChannel: async () => undefined,
    getPending: async () => ({ notifications: pending.map((id) => ({ id })) }),
    cancel: async ({ notifications }: { notifications: Array<{ id: number }> }) => void cancelled.push(...notifications.map((n) => n.id)),
    schedule: async ({ notifications }: { notifications: Array<{ id: number }> }) => void scheduled.push(...notifications),
  },
}));

const { preferencesStore } = await import('../src/device/storage');
const { createNotifier } = await import('../src/device/notifications');
const { makeDevice, NOW } = await import('./helpers');

beforeEach(() => {
  prefs.clear();
  cancelled.length = 0;
  scheduled.length = 0;
  pending = [];
});

describe('native storage (Capacitor Preferences)', () => {
  it('writes and reads the document, and appends parked copies instead of overwriting them', async () => {
    const store = preferencesStore();
    await store.write('{"v":1}');
    expect(await store.read()).toBe('{"v":1}');
    await store.keepUnreadable('first');
    await store.keepUnreadable('second');
    const kept = await store.readUnreadable();
    expect(kept).toContain('first');
    expect(kept).toContain('second');
    await store.clearUnreadable();
    expect(await store.readUnreadable()).toBeNull();
  });
});

describe('native notifications', () => {
  it('re-sync cancels only morning reminders and keeps a pending test notification', async () => {
    const d = await makeDevice();
    await d.req('POST', '/api/seed/demo');
    const notifier = createNotifier(d.svc, () => NOW);
    pending = [999, 1000, 1001];
    await notifier.sync();
    expect(cancelled.sort()).toEqual([1000, 1001]);
    expect(scheduled.length).toBeGreaterThan(5);
    expect(scheduled.every((n) => n.id >= 1000)).toBe(true);
  });

  it('schedules a test notification that a later sync does not remove', async () => {
    const d = await makeDevice();
    const notifier = createNotifier(d.svc, () => NOW);
    expect(await notifier.test()).toBe(true);
    expect(scheduled.map((n) => n.id)).toContain(999);
    pending = [999];
    await notifier.sync();
    expect(cancelled).not.toContain(999);
  });
});
