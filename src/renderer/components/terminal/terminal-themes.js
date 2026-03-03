// Terminal Themes - Preset themes and settings management

export const THEMES = {
  'Basic': {
    background: '#ffffff',
    foreground: '#000000',
    cursor: '#000000',
    cursorAccent: '#ffffff',
    selectionBackground: '#b5d5ff',
    selectionForeground: '#000000',
    black: '#000000',
    red: '#990000',
    green: '#00a600',
    yellow: '#999900',
    blue: '#0000b2',
    magenta: '#b200b2',
    cyan: '#00a6b2',
    white: '#bfbfbf',
    brightBlack: '#666666',
    brightRed: '#e50000',
    brightGreen: '#00d900',
    brightYellow: '#e5e500',
    brightBlue: '#0000ff',
    brightMagenta: '#e500e5',
    brightCyan: '#00e5e5',
    brightWhite: '#e5e5e5',
  },
  'Pro': {
    background: '#1e1e1e',
    foreground: '#f2f2f2',
    cursor: '#4d4d4d',
    cursorAccent: '#f2f2f2',
    selectionBackground: '#5a5a5a',
    selectionForeground: '#ffffff',
    black: '#000000',
    red: '#ff6159',
    green: '#32d74b',
    yellow: '#ffd60a',
    blue: '#0a84ff',
    magenta: '#bf5af2',
    cyan: '#55bef0',
    white: '#d9d9d9',
    brightBlack: '#636366',
    brightRed: '#ff453a',
    brightGreen: '#30d158',
    brightYellow: '#ffd426',
    brightBlue: '#409cff',
    brightMagenta: '#da8fff',
    brightCyan: '#70d7ff',
    brightWhite: '#ffffff',
  },
  'Homebrew': {
    background: '#000000',
    foreground: '#00ff00',
    cursor: '#00ff00',
    cursorAccent: '#000000',
    selectionBackground: '#00ff00',
    selectionForeground: '#000000',
    black: '#000000',
    red: '#990000',
    green: '#00a600',
    yellow: '#999900',
    blue: '#0000b2',
    magenta: '#b200b2',
    cyan: '#00a6b2',
    white: '#00ff00',
    brightBlack: '#666666',
    brightRed: '#e50000',
    brightGreen: '#00d900',
    brightYellow: '#e5e500',
    brightBlue: '#0000ff',
    brightMagenta: '#e500e5',
    brightCyan: '#00e5e5',
    brightWhite: '#00ff00',
  },
  'Ocean': {
    background: '#224fbc',
    foreground: '#ffffff',
    cursor: '#7ac4dc',
    cursorAccent: '#224fbc',
    selectionBackground: '#3567d4',
    selectionForeground: '#ffffff',
    black: '#000000',
    red: '#990000',
    green: '#00a600',
    yellow: '#999900',
    blue: '#0000b2',
    magenta: '#b200b2',
    cyan: '#00a6b2',
    white: '#bfbfbf',
    brightBlack: '#666666',
    brightRed: '#e50000',
    brightGreen: '#00d900',
    brightYellow: '#e5e500',
    brightBlue: '#0000ff',
    brightMagenta: '#e500e5',
    brightCyan: '#00e5e5',
    brightWhite: '#e5e5e5',
  },
  'Grass': {
    background: '#13773d',
    foreground: '#ffffff',
    cursor: '#73fa79',
    cursorAccent: '#13773d',
    selectionBackground: '#1e9c53',
    selectionForeground: '#ffffff',
    black: '#000000',
    red: '#990000',
    green: '#00a600',
    yellow: '#999900',
    blue: '#0000b2',
    magenta: '#b200b2',
    cyan: '#00a6b2',
    white: '#bfbfbf',
    brightBlack: '#666666',
    brightRed: '#e50000',
    brightGreen: '#00d900',
    brightYellow: '#e5e500',
    brightBlue: '#0000ff',
    brightMagenta: '#e500e5',
    brightCyan: '#00e5e5',
    brightWhite: '#e5e5e5',
  },
  'Red Sands': {
    background: '#7a251e',
    foreground: '#d7c9a7',
    cursor: '#d7c9a7',
    cursorAccent: '#7a251e',
    selectionBackground: '#a3382f',
    selectionForeground: '#d7c9a7',
    black: '#000000',
    red: '#ff6767',
    green: '#a5e075',
    yellow: '#f0d565',
    blue: '#6fb0f7',
    magenta: '#d28fd0',
    cyan: '#72dbc5',
    white: '#d7c9a7',
    brightBlack: '#7a7a7a',
    brightRed: '#ff8c8c',
    brightGreen: '#c0f08d',
    brightYellow: '#f5e17d',
    brightBlue: '#9dc6fa',
    brightMagenta: '#e0a8de',
    brightCyan: '#93eddb',
    brightWhite: '#f1e5cb',
  },
  'Clear Dark': {
    background: '#0f172a',
    foreground: '#e2e8f0',
    cursor: '#6366f1',
    cursorAccent: '#0f172a',
    selectionBackground: '#6366f1',
    selectionForeground: '#ffffff',
    black: '#1e293b',
    red: '#ef4444',
    green: '#22c55e',
    yellow: '#eab308',
    blue: '#3b82f6',
    magenta: '#a855f7',
    cyan: '#06b6d4',
    white: '#f1f5f9',
    brightBlack: '#475569',
    brightRed: '#f87171',
    brightGreen: '#4ade80',
    brightYellow: '#facc15',
    brightBlue: '#60a5fa',
    brightMagenta: '#c084fc',
    brightCyan: '#22d3ee',
    brightWhite: '#f8fafc',
  },
  'Clear Light': {
    background: '#f8fafc',
    foreground: '#1e293b',
    cursor: '#6366f1',
    cursorAccent: '#f8fafc',
    selectionBackground: '#c7d2fe',
    selectionForeground: '#1e293b',
    black: '#1e293b',
    red: '#dc2626',
    green: '#16a34a',
    yellow: '#ca8a04',
    blue: '#2563eb',
    magenta: '#9333ea',
    cyan: '#0891b2',
    white: '#f1f5f9',
    brightBlack: '#64748b',
    brightRed: '#ef4444',
    brightGreen: '#22c55e',
    brightYellow: '#eab308',
    brightBlue: '#3b82f6',
    brightMagenta: '#a855f7',
    brightCyan: '#06b6d4',
    brightWhite: '#ffffff',
  },
};

const STORAGE_KEY = 'terminal-settings';

const DEFAULTS = {
  theme: 'Clear Dark',
  fontFamily: '"SF Mono", "Fira Code", "JetBrains Mono", Menlo, monospace',
  fontSize: 13,
  lineHeight: 1.4,
  cursorStyle: 'bar',
  cursorBlink: true,
  customColors: null, // { background, foreground, cursor } overrides
};

export function getTerminalSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return { ...DEFAULTS, ...JSON.parse(raw) };
    }
  } catch (e) { /* ignore */ }
  return { ...DEFAULTS };
}

export function saveTerminalSettings(settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function getThemeOptions(themeName) {
  return THEMES[themeName] || THEMES['Clear Dark'];
}

export function buildTerminalOptions(settings) {
  const theme = { ...getThemeOptions(settings.theme) };

  // Apply custom color overrides
  if (settings.customColors) {
    if (settings.customColors.background) theme.background = settings.customColors.background;
    if (settings.customColors.foreground) theme.foreground = settings.customColors.foreground;
    if (settings.customColors.cursor) theme.cursor = settings.customColors.cursor;
  }

  return {
    theme,
    fontFamily: settings.fontFamily,
    fontSize: settings.fontSize,
    lineHeight: settings.lineHeight,
    cursorStyle: settings.cursorStyle,
    cursorBlink: settings.cursorBlink,
  };
}
