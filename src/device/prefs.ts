export interface Prefs {
  /** notify shortly before each study session starts */
  sessionReminders: boolean;
  /** minutes before the session start (0 = at the start) */
  sessionLeadMin: number;
  /** accent color as #rrggbb */
  accent: string;
}

export const LEAD_OPTIONS = [0, 5, 10, 15] as const;
export const DEFAULT_ACCENT = '#e5322d';

export const defaultPrefs = (): Prefs => ({ sessionReminders: true, sessionLeadMin: 5, accent: DEFAULT_ACCENT });

export const isHexColor = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);

/** Reads stored prefs leniently: anything unusable falls back to the default instead of rejecting the whole document. */
export const readPrefs = (raw: unknown): Prefs => {
  const d = defaultPrefs();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Record<string, unknown>;
  return {
    sessionReminders: typeof r.sessionReminders === 'boolean' ? r.sessionReminders : d.sessionReminders,
    sessionLeadMin: typeof r.sessionLeadMin === 'number' && (LEAD_OPTIONS as readonly number[]).includes(r.sessionLeadMin) ? r.sessionLeadMin : d.sessionLeadMin,
    accent: isHexColor(r.accent) ? r.accent.toLowerCase() : d.accent,
  };
};
