import { Preferences } from '@capacitor/preferences';

/** One JSON document holds all app data. Native builds keep it in UserDefaults / SharedPreferences, which iOS and Android do not purge like web storage. */
export interface DocumentStore {
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
}

const KEY = 'dayfold-data-v1';

export const preferencesStore = (): DocumentStore => ({
  read: async () => (await Preferences.get({ key: KEY })).value,
  write: async (value) => {
    await Preferences.set({ key: KEY, value });
  },
});

export const memoryStore = (initial: string | null = null): DocumentStore & { value: string | null } => {
  const s = {
    value: initial,
    read: async () => s.value,
    write: async (v: string) => {
      s.value = v;
    },
  };
  return s;
};
