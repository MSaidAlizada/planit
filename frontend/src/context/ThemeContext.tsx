import { createContext, useContext, useEffect, useState } from 'react';

// ── Theme definitions ─────────────────────────────────────────────────────

export type ThemeId = 'warm' | 'midnight' | 'forest' | 'lavender';

export type ThemeDefinition = {
  id: ThemeId;
  name: string;
  /** Quick preview colors for the swatch card */
  preview: { bg: string; panel: string; accent: string; sidebar: string };
  vars: Record<string, string>;
};

export const THEMES: ThemeDefinition[] = [
  {
    id: 'warm',
    name: 'Warm Paper',
    preview: { bg: '#f2e8da', panel: '#fffcf7', accent: '#b8723a', sidebar: '#18100a' },
    vars: {
      '--bg':                '#f2e8da',
      '--bg-2':              '#ece0cf',
      '--panel':             '#fffcf7',
      '--panel-2':           '#faf4ea',
      '--panel-border':      '#e8dcc8',
      '--sb-bg':             '#18100a',
      '--sb-text':           'rgba(255, 245, 230, 0.55)',
      '--sb-text-hover':     'rgba(255, 245, 230, 0.80)',
      '--sb-text-active':    'rgba(255, 245, 230, 0.95)',
      '--sb-active-bg':      'rgba(255, 255, 255, 0.09)',
      '--sb-border':         'rgba(255, 255, 255, 0.07)',
      '--sb-accent':         '#c07a3a',
      '--text':              '#251508',
      '--text-2':            '#5a3d28',
      '--muted':             '#9c7e65',
      '--accent':            '#b8723a',
      '--accent-light':      '#f0d5b5',
      '--accent-dark':       '#8e5220',
      '--green':             '#3e8a5c',
      '--green-bg':          '#e6f4ec',
      '--amber':             '#b07820',
      '--amber-bg':          '#fdf3dd',
      '--red':               '#b83a30',
      '--red-bg':            '#fce8e6',
      '--blue':              '#4070b0',
      '--blue-bg':           '#deeaf8',
      '--gray':              '#787060',
      '--gray-bg':           '#edeae4',
      '--input-bg':          '#ffffff',
      '--input-placeholder': '#b09a84',
      '--focus-ring':        'rgba(184, 114, 58, 0.14)',
      '--color-scheme':      'light',
    },
  },
  {
    id: 'midnight',
    name: 'Midnight',
    preview: { bg: '#0e1117', panel: '#1c2333', accent: '#4f80ff', sidebar: '#090d13' },
    vars: {
      '--bg':                '#0e1117',
      '--bg-2':              '#161b22',
      '--panel':             '#1c2333',
      '--panel-2':           '#161b22',
      '--panel-border':      'rgba(255, 255, 255, 0.08)',
      '--sb-bg':             '#090d13',
      '--sb-text':           'rgba(150, 185, 240, 0.5)',
      '--sb-text-hover':     'rgba(178, 210, 252, 0.82)',
      '--sb-text-active':    'rgba(212, 230, 255, 0.96)',
      '--sb-active-bg':      'rgba(79, 128, 255, 0.1)',
      '--sb-border':         'rgba(255, 255, 255, 0.05)',
      '--sb-accent':         '#5090ff',
      '--text':              'rgba(215, 230, 255, 0.93)',
      '--text-2':            'rgba(160, 195, 240, 0.76)',
      '--muted':             'rgba(105, 145, 200, 0.56)',
      '--accent':            '#4f80ff',
      '--accent-light':      'rgba(79, 128, 255, 0.16)',
      '--accent-dark':       '#3566e0',
      '--green':             '#4ade80',
      '--green-bg':          'rgba(74, 222, 128, 0.1)',
      '--amber':             '#fbbf24',
      '--amber-bg':          'rgba(251, 191, 36, 0.1)',
      '--red':               '#f87171',
      '--red-bg':            'rgba(248, 113, 113, 0.1)',
      '--blue':              '#60a5fa',
      '--blue-bg':           'rgba(96, 165, 250, 0.1)',
      '--gray':              'rgba(148, 163, 184, 0.65)',
      '--gray-bg':           'rgba(148, 163, 184, 0.08)',
      '--input-bg':          'rgba(255, 255, 255, 0.06)',
      '--input-placeholder': 'rgba(105, 145, 200, 0.38)',
      '--focus-ring':        'rgba(79, 128, 255, 0.2)',
      '--color-scheme':      'dark',
    },
  },
  {
    id: 'forest',
    name: 'Forest',
    preview: { bg: '#0d1a12', panel: '#152218', accent: '#22c55e', sidebar: '#091010' },
    vars: {
      '--bg':                '#0d1a12',
      '--bg-2':              '#111e16',
      '--panel':             '#152218',
      '--panel-2':           '#111d15',
      '--panel-border':      'rgba(255, 255, 255, 0.08)',
      '--sb-bg':             '#091010',
      '--sb-text':           'rgba(150, 220, 170, 0.5)',
      '--sb-text-hover':     'rgba(180, 240, 195, 0.82)',
      '--sb-text-active':    'rgba(210, 255, 225, 0.96)',
      '--sb-active-bg':      'rgba(34, 197, 94, 0.1)',
      '--sb-border':         'rgba(255, 255, 255, 0.05)',
      '--sb-accent':         '#4ade80',
      '--text':              'rgba(210, 240, 220, 0.93)',
      '--text-2':            'rgba(160, 210, 175, 0.76)',
      '--muted':             'rgba(100, 165, 120, 0.56)',
      '--accent':            '#22c55e',
      '--accent-light':      'rgba(34, 197, 94, 0.16)',
      '--accent-dark':       '#16a34a',
      '--green':             '#4ade80',
      '--green-bg':          'rgba(74, 222, 128, 0.1)',
      '--amber':             '#fbbf24',
      '--amber-bg':          'rgba(251, 191, 36, 0.1)',
      '--red':               '#f87171',
      '--red-bg':            'rgba(248, 113, 113, 0.1)',
      '--blue':              '#67e8f9',
      '--blue-bg':           'rgba(103, 232, 249, 0.1)',
      '--gray':              'rgba(148, 180, 158, 0.65)',
      '--gray-bg':           'rgba(148, 180, 158, 0.08)',
      '--input-bg':          'rgba(255, 255, 255, 0.06)',
      '--input-placeholder': 'rgba(100, 165, 120, 0.38)',
      '--focus-ring':        'rgba(34, 197, 94, 0.2)',
      '--color-scheme':      'dark',
    },
  },
  {
    id: 'lavender',
    name: 'Lavender',
    preview: { bg: '#120f1a', panel: '#1e1a2e', accent: '#8b5cf6', sidebar: '#0d0b18' },
    vars: {
      '--bg':                '#120f1a',
      '--bg-2':              '#17142c',
      '--panel':             '#1e1a2e',
      '--panel-2':           '#1a1628',
      '--panel-border':      'rgba(255, 255, 255, 0.08)',
      '--sb-bg':             '#0d0b18',
      '--sb-text':           'rgba(195, 175, 255, 0.5)',
      '--sb-text-hover':     'rgba(210, 195, 255, 0.82)',
      '--sb-text-active':    'rgba(232, 225, 255, 0.96)',
      '--sb-active-bg':      'rgba(139, 92, 246, 0.1)',
      '--sb-border':         'rgba(255, 255, 255, 0.05)',
      '--sb-accent':         '#a78bfa',
      '--text':              'rgba(230, 222, 255, 0.93)',
      '--text-2':            'rgba(195, 182, 245, 0.76)',
      '--muted':             'rgba(150, 132, 210, 0.56)',
      '--accent':            '#8b5cf6',
      '--accent-light':      'rgba(139, 92, 246, 0.16)',
      '--accent-dark':       '#7c3aed',
      '--green':             '#a3e635',
      '--green-bg':          'rgba(163, 230, 53, 0.1)',
      '--amber':             '#fbbf24',
      '--amber-bg':          'rgba(251, 191, 36, 0.1)',
      '--red':               '#f87171',
      '--red-bg':            'rgba(248, 113, 113, 0.1)',
      '--blue':              '#818cf8',
      '--blue-bg':           'rgba(129, 140, 248, 0.1)',
      '--gray':              'rgba(168, 155, 200, 0.65)',
      '--gray-bg':           'rgba(168, 155, 200, 0.08)',
      '--input-bg':          'rgba(255, 255, 255, 0.06)',
      '--input-placeholder': 'rgba(150, 132, 210, 0.38)',
      '--focus-ring':        'rgba(139, 92, 246, 0.2)',
      '--color-scheme':      'dark',
    },
  },
];

// ── Color override keys the user can customize ────────────────────────────

export type ColorKey = '--accent' | '--bg' | '--panel' | '--sb-bg';

export const COLOR_LABELS: Record<ColorKey, string> = {
  '--accent':  'Accent',
  '--bg':      'Background',
  '--panel':   'Panels',
  '--sb-bg':   'Sidebar',
};

// ── Helpers ───────────────────────────────────────────────────────────────

export function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function darkenHex(hex: string, amount: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, n));
  const r = clamp(parseInt(hex.slice(1, 3), 16) - amount);
  const g = clamp(parseInt(hex.slice(3, 5), 16) - amount);
  const b = clamp(parseInt(hex.slice(5, 7), 16) - amount);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function lightenHex(hex: string, amount: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, n));
  const r = clamp(parseInt(hex.slice(1, 3), 16) + amount);
  const g = clamp(parseInt(hex.slice(3, 5), 16) + amount);
  const b = clamp(parseInt(hex.slice(5, 7), 16) + amount);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function applyVars(vars: Record<string, string>, overrides: Partial<Record<ColorKey, string>>) {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(vars)) {
    if (key === '--color-scheme') root.style.setProperty('color-scheme', value);
    else root.style.setProperty(key, value);
  }
  for (const [varName, value] of Object.entries(overrides) as [ColorKey, string][]) {
    if (!value || !/^#[0-9a-f]{6}$/i.test(value)) continue;
    root.style.setProperty(varName, value);
    if (varName === '--accent') {
      root.style.setProperty('--sb-accent',    value);
      root.style.setProperty('--accent-light', hexToRgba(value, 0.16));
      root.style.setProperty('--accent-dark',  darkenHex(value, 28));
      root.style.setProperty('--focus-ring',   hexToRgba(value, 0.18));
    }
    if (varName === '--bg') {
      root.style.setProperty('--bg-2', darkenHex(value, 12));
    }
    if (varName === '--panel') {
      root.style.setProperty('--panel-2',      darkenHex(value, 8));
      root.style.setProperty('--panel-border', darkenHex(value, 20));
    }
    if (varName === '--sb-bg') {
      root.style.setProperty('--sb-bg', value);
      // keep sidebar text readable — lighten derivations slightly
      root.style.setProperty('--sb-text',        hexToRgba(lightenHex(value, 180), 0.55));
      root.style.setProperty('--sb-text-hover',  hexToRgba(lightenHex(value, 200), 0.82));
      root.style.setProperty('--sb-text-active', hexToRgba(lightenHex(value, 220), 0.95));
    }
  }
}

// ── Context ───────────────────────────────────────────────────────────────

type ThemeCtx = {
  themeId: ThemeId;
  colorOverrides: Partial<Record<ColorKey, string>>;
  setTheme: (id: ThemeId) => void;
  setColorOverride: (key: ColorKey, value: string | null) => void;
  resetAllOverrides: () => void;
};

const ThemeContext = createContext<ThemeCtx>({
  themeId: 'warm',
  colorOverrides: {},
  setTheme: () => {},
  setColorOverride: () => {},
  resetAllOverrides: () => {},
});

function loadOverrides(): Partial<Record<ColorKey, string>> {
  try { return JSON.parse(localStorage.getItem('planit-color-overrides') ?? '{}'); }
  catch { return {}; }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeId, setThemeId] = useState<ThemeId>(
    () => (localStorage.getItem('planit-theme') as ThemeId) ?? 'warm',
  );
  const [colorOverrides, setOverridesState] = useState<Partial<Record<ColorKey, string>>>(loadOverrides);

  useEffect(() => {
    const theme = THEMES.find((t) => t.id === themeId) ?? THEMES[0];
    applyVars(theme.vars, colorOverrides);
  }, [themeId, colorOverrides]);

  function setTheme(id: ThemeId) {
    setThemeId(id);
    localStorage.setItem('planit-theme', id);
  }

  function setColorOverride(key: ColorKey, value: string | null) {
    setOverridesState((prev) => {
      const next = { ...prev };
      if (value) next[key] = value;
      else delete next[key];
      localStorage.setItem('planit-color-overrides', JSON.stringify(next));
      return next;
    });
  }

  function resetAllOverrides() {
    setOverridesState({});
    localStorage.removeItem('planit-color-overrides');
  }

  return (
    <ThemeContext.Provider value={{ themeId, colorOverrides, setTheme, setColorOverride, resetAllOverrides }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
