/** Accent colors: presets, and contrast-safe variants derived from any chosen color. */

export interface AccentPreset {
  id: string;
  name: string;
  hex: string;
}

export const ACCENT_PRESETS: AccentPreset[] = [
  { id: 'red', name: 'Red', hex: '#e5322d' },
  { id: 'orange', name: 'Orange', hex: '#e8650f' },
  { id: 'amber', name: 'Amber', hex: '#d49a00' },
  { id: 'green', name: 'Green', hex: '#2f9e5b' },
  { id: 'teal', name: 'Teal', hex: '#0f9d9a' },
  { id: 'blue', name: 'Blue', hex: '#2f7df6' },
  { id: 'pink', name: 'Pink', hex: '#e0457b' },
  { id: 'graphite', name: 'Graphite', hex: '#5f636b' },
];

type Rgb = [number, number, number];

export const hexToRgb = (hex: string): Rgb => {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
export const rgbToHex = ([r, g, b]: Rgb): string => `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;

const channel = (v: number): number => {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
export const luminance = (hex: string): number => {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};
export const contrast = (a: string, b: string): number => {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

const mix = (hex: string, target: Rgb, amount: number): string => {
  const c = hexToRgb(hex);
  return rgbToHex([0, 1, 2].map((i) => (c[i] as number) + ((target[i] as number) - (c[i] as number)) * amount) as Rgb);
};

/** Moves the color toward black (or white) in small steps until it reaches the contrast ratio against every background. */
const reach = (hex: string, backgrounds: string[], ratio: number, toward: Rgb): string => {
  let out = hex;
  for (let i = 0; i < 40 && !backgrounds.every((bg) => contrast(out, bg) >= ratio); i++) out = mix(out, toward, 0.06);
  return out;
};

const BLACK: Rgb = [0, 0, 0];
const WHITE: Rgb = [255, 255, 255];

export interface AccentVars {
  '--accent': string;
  '--accent-strong': string;
  '--accent-ink': string;
  '--accent-num': string;
  '--accent-soft': string;
  '--on-accent': string;
}

/**
 * strong: fill behind white button text (4.5:1). ink: small accent text on the surface colors (4.5:1).
 * accent: rings and graphics (3:1 against the surface). Light and dark use different lightness.
 */
export const accentVars = (base: string, dark: boolean): AccentVars => {
  const [r, g, b] = hexToRgb(base);
  if (!dark) {
    const strong = reach(base, ['#ffffff'], 4.5, BLACK);
    // ink also sits on the accent tint (pills, current tab, exam blocks), so reach 4.5:1 on the tint over each surface
    const tints = ['#ffffff', '#f5f5f7', '#f0f0f3'].map((s) => mix(s, [r, g, b], 0.1));
    const ink = reach(base, ['#ffffff', '#f5f5f7', '#f0f0f3', ...tints], 4.5, BLACK);
    const accent = reach(base, ['#ffffff'], 3, BLACK);
    return { '--accent': accent, '--accent-strong': strong, '--accent-ink': ink, '--accent-num': strong, '--accent-soft': `rgba(${r}, ${g}, ${b}, 0.1)`, '--on-accent': '#ffffff' };
  }
  const strong = reach(base, ['#ffffff'], 4.5, BLACK);
  const accent = reach(mix(base, WHITE, 0.08), ['#1c1c1e', '#000000'], 4.5, WHITE);
  const tints = ['#1c1c1e', '#2c2c2e'].map((s) => mix(s, [r, g, b], 0.18));
  const ink = reach(mix(base, WHITE, 0.2), ['#1c1c1e', '#2c2c2e', ...tints], 4.5, WHITE);
  return { '--accent': accent, '--accent-strong': strong, '--accent-ink': ink, '--accent-num': accent, '--accent-soft': `rgba(${r}, ${g}, ${b}, 0.18)`, '--on-accent': '#ffffff' };
};

const isDarkNow = (): boolean => {
  const forced = document.documentElement.getAttribute('data-theme');
  if (forced === 'dark') return true;
  if (forced === 'light') return false;
  return !!window.matchMedia?.('(prefers-color-scheme: dark)').matches;
};

const storedAccent = (): string => {
  try {
    const v = localStorage.getItem('dayfold-accent');
    return v && /^#[0-9a-f]{6}$/i.test(v) ? v : '#e5322d';
  } catch {
    return '#e5322d';
  }
};

let current = storedAccent();

/** Sets the accent custom properties on <html>. Call again whenever the theme or the system appearance changes. */
export const applyAccent = (hex?: string): void => {
  if (hex) {
    current = hex;
    try {
      localStorage.setItem('dayfold-accent', hex);
    } catch {
      // storage unavailable: the start-up logo just uses the default color
    }
  }
  const vars = accentVars(current, isDarkNow());
  for (const [k, v] of Object.entries(vars)) document.documentElement.style.setProperty(k, v);
};
