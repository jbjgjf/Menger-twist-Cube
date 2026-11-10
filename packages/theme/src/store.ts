import { useSyncExternalStore } from 'react';

export type ThemeMode = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export interface AccentOption {
  id: string;
  label: string;
  /** Sticker colour shown on the swatch. */
  swatch: string;
  /** Colour the accent scale is generated from. */
  base: string;
}

/** The six sticker colours of the cube. White is the neutral "no colour" accent. */
export const accentOptions: AccentOption[] = [
  { id: 'white', label: 'White', swatch: '#ffffff', base: '#d1d1d6' },
  { id: 'red', label: 'Red', swatch: '#c41e3a', base: '#c41e3a' },
  { id: 'orange', label: 'Orange', swatch: '#ff5800', base: '#ff5800' },
  { id: 'yellow', label: 'Yellow', swatch: '#ffd500', base: '#ffd500' },
  { id: 'green', label: 'Green', swatch: '#009e60', base: '#009e60' },
  { id: 'blue', label: 'Blue', swatch: '#0051ba', base: '#0051ba' },
];

export interface ThemeState {
  mode: ThemeMode;
  accent: string;
  resolved: ResolvedTheme;
  /** Accent for strokes and highlights drawn in WebGL. */
  accentHex: string;
  /** Page background, for the WebGL clear colour. */
  background: string;
  /** Primary text colour, for WebGL / SVG drawing. */
  foreground: string;
}

const STORAGE_KEY = 'menger.theme';
const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const backgrounds: Record<ResolvedTheme, string> = { dark: '#000000', light: '#f5f5f7' };
const foregrounds: Record<ResolvedTheme, string> = { dark: '#f5f5f7', light: '#1d1d1f' };
const defaultAccent = 'blue';

type Rgb = [number, number, number];

const toRgb = (hex: string): Rgb => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const toHex = ([r, g, b]: Rgb) =>
  `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
const mix = (a: Rgb, b: Rgb, t: number): Rgb =>
  [0, 1, 2].map((i) => Math.round(a[i]! + (b[i]! - a[i]!) * t)) as Rgb;

/** Lighter toward 50, darker toward 950. Light mode reads the scale back to front. */
const shade = (base: Rgb, step: number, resolved: ResolvedTheme): Rgb => {
  const s = resolved === 'dark' ? step : 1000 - step;
  const t = (s - 500) / 500;
  return t < 0 ? mix(base, [255, 255, 255], -t * 0.92) : mix(base, [0, 0, 0], t * 0.78);
};

const accentBase = (id: string): Rgb =>
  toRgb((accentOptions.find((option) => option.id === id) ?? accentOptions[0]!).base);

const systemQuery = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;

const resolveMode = (mode: ThemeMode): ResolvedTheme => {
  if (mode !== 'system') return mode;
  return systemQuery()?.matches === false ? 'light' : 'dark';
};

const build = (mode: ThemeMode, accent: string): ThemeState => {
  const resolved = resolveMode(mode);
  return {
    mode,
    accent,
    resolved,
    accentHex: toHex(shade(accentBase(accent), 400, resolved)),
    background: backgrounds[resolved],
    foreground: foregrounds[resolved],
  };
};

const readStored = (): { mode: ThemeMode; accent: string } => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<{ mode: ThemeMode; accent: string }>;
      const mode = parsed.mode === 'light' || parsed.mode === 'dark' ? parsed.mode : 'system';
      const accent = accentOptions.some((o) => o.id === parsed.accent) ? parsed.accent! : defaultAccent;
      return { mode, accent };
    }
  } catch {
    // Storage can be unavailable (private windows, blocked cookies); fall through.
  }
  return { mode: 'system', accent: defaultAccent };
};

const writeStored = (state: ThemeState) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode: state.mode, accent: state.accent }));
  } catch {
    // Not persisting is fine.
  }
};

const apply = (state: ThemeState) => {
  const root = document.documentElement;
  root.dataset.theme = state.resolved;
  root.style.colorScheme = state.resolved;
  const base = accentBase(state.accent);
  for (const step of STEPS) {
    root.style.setProperty(`--accent-${step}`, shade(base, step, state.resolved).join(' '));
  }
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', state.background);
};

let current: ThemeState = (() => {
  if (typeof window === 'undefined') return build('system', defaultAccent);
  const stored = readStored();
  return build(stored.mode, stored.accent);
})();

if (typeof document !== 'undefined') apply(current);

const listeners = new Set<() => void>();
const commit = (next: ThemeState, persist: boolean) => {
  current = next;
  apply(next);
  if (persist) writeStored(next);
  listeners.forEach((listener) => listener());
};

export const setThemeMode = (mode: ThemeMode) => commit(build(mode, current.accent), true);
export const setThemeAccent = (accent: string) => commit(build(current.mode, accent), true);

// "Auto" follows the operating system as it changes, and other tabs/pages.
systemQuery()?.addEventListener('change', () => {
  if (current.mode === 'system') commit(build('system', current.accent), false);
});
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return;
    const stored = readStored();
    commit(build(stored.mode, stored.accent), false);
  });
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Works anywhere, including inside an R3F <Canvas>, because it needs no context provider. */
export const useTheme = (): ThemeState => useSyncExternalStore(subscribe, () => current, () => current);
