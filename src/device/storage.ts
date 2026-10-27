import { Preferences } from '@capacitor/preferences';

/** One JSON document holds all app data. Native builds keep it in UserDefaults / SharedPreferences, which iOS and Android do not purge like web storage. */
export interface DocumentStore {
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
  /** Park an unreadable document under a separate key so it is never overwritten. */
  keepUnreadable(value: string): Promise<void>;
  /** The most recently parked unreadable document, if any. */
  readUnreadable(): Promise<string | null>;
  clearUnreadable(): Promise<void>;
}

const KEY = 'dayfold-data-v1';
const KEPT_KEY = 'dayfold-data-unreadable';
const SEPARATOR = '\n\n--- next unreadable copy ---\n\n';

export const preferencesStore = (): DocumentStore => ({
  read: async () => (await Preferences.get({ key: KEY })).value,
  write: async (value) => {
    await Preferences.set({ key: KEY, value });
  },
  keepUnreadable: async (value) => {
    // never overwrite an earlier parked copy: append, so nothing is lost
    const existing = (await Preferences.get({ key: KEPT_KEY })).value;
    await Preferences.set({ key: KEPT_KEY, value: existing ? `${existing}${SEPARATOR}${value}` : value });
  },
  readUnreadable: async () => (await Preferences.get({ key: KEPT_KEY })).value,
  clearUnreadable: async () => {
    await Preferences.remove({ key: KEPT_KEY });
  },
});

export const memoryStore = (initial: string | null = null): DocumentStore & { value: string | null; kept: string | null } => {
  const s = {
    value: initial,
    kept: null as string | null,
    read: async () => s.value,
    write: async (v: string) => {
      s.value = v;
    },
    keepUnreadable: async (v: string) => {
      s.kept = s.kept ? `${s.kept}${SEPARATOR}${v}` : v;
    },
    readUnreadable: async () => s.kept,
    clearUnreadable: async () => {
      s.kept = null;
    },
  };
  return s;
};
