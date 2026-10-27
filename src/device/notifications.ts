import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { buildReminders, REMINDER_ID_BASE, TEST_NOTIFICATION_ID } from './reminders';
import type { Service } from './service';
import { APP_NAME } from '../lib/appInfo';

export type Permission = 'granted' | 'denied' | 'prompt' | 'unsupported';

const CHANNEL = 'daily-plan';
const SMALL_ICON = 'ic_stat_dayfold';

export interface Notifier {
  permission(): Promise<Permission>;
  request(): Promise<Permission>;
  /** cancel what is pending and schedule the next days from the current plan */
  sync(): Promise<void>;
  test(): Promise<boolean>;
}

const toPermission = (state: string): Permission => (state === 'granted' ? 'granted' : state === 'denied' ? 'denied' : 'prompt');

export const createNotifier = (svc: Service, now: () => number = Date.now): Notifier => {
  const native = Capacitor.isNativePlatform();
  let channelReady = false;
  const ensureChannel = async (): Promise<void> => {
    if (channelReady || Capacitor.getPlatform() !== 'android') return;
    await LocalNotifications.createChannel({ id: CHANNEL, name: 'Morning plan', description: 'Your plan for the day', importance: 3 });
    channelReady = true;
  };
  const permission = async (): Promise<Permission> => {
    if (!native) return 'unsupported';
    return toPermission((await LocalNotifications.checkPermissions()).display);
  };
  const clearPending = async (): Promise<void> => {
    // only the morning reminders: a test notification that is about to fire must survive a re-sync
    const pending = await LocalNotifications.getPending();
    const mine = pending.notifications.filter((n) => n.id >= REMINDER_ID_BASE);
    if (mine.length > 0) await LocalNotifications.cancel({ notifications: mine.map((n) => ({ id: n.id })) });
  };
  return {
    permission,
    request: async () => {
      if (!native) return 'unsupported';
      const res = await LocalNotifications.requestPermissions();
      return toPermission(res.display);
    },
    sync: async () => {
      if (!native || (await permission()) !== 'granted') return;
      await ensureChannel();
      await clearPending();
      const reminders = buildReminders(svc, now());
      if (reminders.length === 0) return;
      await LocalNotifications.schedule({
        notifications: reminders.map((r) => ({
          id: r.id,
          title: r.title,
          body: r.body,
          channelId: CHANNEL,
          smallIcon: SMALL_ICON,
          schedule: { at: new Date(r.at), allowWhileIdle: true },
        })),
      });
    },
    test: async () => {
      if (!native || (await permission()) !== 'granted') return false;
      await ensureChannel();
      await LocalNotifications.schedule({
        notifications: [{ id: TEST_NOTIFICATION_ID, title: APP_NAME, body: 'Notifications are on. Your morning plan arrives like this.', channelId: CHANNEL, smallIcon: SMALL_ICON, schedule: { at: new Date(now() + 4_000), allowWhileIdle: true } }],
      });
      return true;
    },
  };
};
