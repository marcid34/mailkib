export interface ThemeColors {
  bg: string
  bgDeep: string
  bgSunken: string
  bgRaise: string
  bgHover: string
  bgActive: string
  border: string
  borderSoft: string
  borderStrong: string
  fg: string
  fgDim: string
  fgMute: string
  fgFaint: string
  blue: string
  cyan: string
  teal: string
  green: string
  yellow: string
  orange: string
  red: string
  purple: string
  accent: string
}

export interface Theme {
  id: string
  name: string
  family: string
  colors: ThemeColors
}

export const THEMES: Theme[] = [
  {
    id: 'tokyo-night-storm',
    name: 'Storm',
    family: 'Tokyo Night',
    colors: {
      bg: '#24283b',
      bgDeep: '#1f2335',
      bgSunken: '#1d2130',
      bgRaise: '#2a2f45',
      bgHover: '#292e42',
      bgActive: '#343a55',
      border: '#303650',
      borderSoft: '#2a3048',
      borderStrong: '#3b4261',
      fg: '#c0caf5',
      fgDim: '#a9b1d6',
      fgMute: '#848cad',
      fgFaint: '#565f89',
      blue: '#7aa2f7',
      cyan: '#7dcfff',
      teal: '#2ac3de',
      green: '#9ece6a',
      yellow: '#e0af68',
      orange: '#ff9e64',
      red: '#f7768e',
      purple: '#bb9af7',
      accent: '#7aa2f7'
    }
  },
  {
    id: 'tokyo-night',
    name: 'Night',
    family: 'Tokyo Night',
    colors: {
      bg: '#1a1b26',
      bgDeep: '#16161e',
      bgSunken: '#13131a',
      bgRaise: '#24283b',
      bgHover: '#1f2335',
      bgActive: '#2a2f45',
      border: '#2a2e3f',
      borderSoft: '#22263a',
      borderStrong: '#3b4261',
      fg: '#c0caf5',
      fgDim: '#a9b1d6',
      fgMute: '#7f86a8',
      fgFaint: '#565f89',
      blue: '#7aa2f7',
      cyan: '#7dcfff',
      teal: '#2ac3de',
      green: '#9ece6a',
      yellow: '#e0af68',
      orange: '#ff9e64',
      red: '#f7768e',
      purple: '#bb9af7',
      accent: '#7aa2f7'
    }
  },
  {
    id: 'catppuccin-mocha',
    name: 'Mocha',
    family: 'Catppuccin',
    colors: {
      bg: '#1e1e2e',
      bgDeep: '#181825',
      bgSunken: '#11111b',
      bgRaise: '#2e2f42',
      bgHover: '#28293c',
      bgActive: '#3a3c52',
      border: '#313244',
      borderSoft: '#292a3b',
      borderStrong: '#45475a',
      fg: '#cdd6f4',
      fgDim: '#bac2de',
      fgMute: '#9399b2',
      fgFaint: '#6c7086',
      blue: '#89b4fa',
      cyan: '#89dceb',
      teal: '#94e2d5',
      green: '#a6e3a1',
      yellow: '#f9e2af',
      orange: '#fab387',
      red: '#f38ba8',
      purple: '#cba6f7',
      accent: '#89b4fa'
    }
  },
  {
    id: 'catppuccin-macchiato',
    name: 'Macchiato',
    family: 'Catppuccin',
    colors: {
      bg: '#24273a',
      bgDeep: '#1e2030',
      bgSunken: '#181926',
      bgRaise: '#333747',
      bgHover: '#2c3044',
      bgActive: '#414559',
      border: '#363a4f',
      borderSoft: '#2e3244',
      borderStrong: '#494d64',
      fg: '#cad3f5',
      fgDim: '#b8c0e0',
      fgMute: '#939ab7',
      fgFaint: '#6e738d',
      blue: '#8aadf4',
      cyan: '#91d7e3',
      teal: '#8bd5ca',
      green: '#a6da95',
      yellow: '#eed49f',
      orange: '#f5a97f',
      red: '#ed8796',
      purple: '#c6a0f6',
      accent: '#8aadf4'
    }
  },
  {
    id: 'catppuccin-frappe',
    name: 'Frappé',
    family: 'Catppuccin',
    colors: {
      bg: '#303446',
      bgDeep: '#292c3c',
      bgSunken: '#232634',
      bgRaise: '#3c4055',
      bgHover: '#363a4c',
      bgActive: '#484d63',
      border: '#414559',
      borderSoft: '#383c4e',
      borderStrong: '#51576d',
      fg: '#c6d0f5',
      fgDim: '#b5bfe2',
      fgMute: '#949cbb',
      fgFaint: '#737994',
      blue: '#8caaee',
      cyan: '#99d1db',
      teal: '#81c8be',
      green: '#a6d189',
      yellow: '#e5c890',
      orange: '#ef9f76',
      red: '#e78284',
      purple: '#ca9ee6',
      accent: '#8caaee'
    }
  },
  {
    id: 'one-dark',
    name: 'One Dark',
    family: 'Atom',
    colors: {
      bg: '#282c34',
      bgDeep: '#21252b',
      bgSunken: '#1b1e24',
      bgRaise: '#2f343e',
      bgHover: '#2c313a',
      bgActive: '#3a3f4b',
      border: '#3a3f4b',
      borderSoft: '#31363f',
      borderStrong: '#4b5263',
      fg: '#c8cdd7',
      fgDim: '#abb2bf',
      fgMute: '#8b93a3',
      fgFaint: '#5c6370',
      blue: '#61afef',
      cyan: '#56b6c2',
      teal: '#56b6c2',
      green: '#98c379',
      yellow: '#e5c07b',
      orange: '#d19a66',
      red: '#e06c75',
      purple: '#c678dd',
      accent: '#61afef'
    }
  },
  {
    id: 'gruvbox-dark',
    name: 'Gruvbox',
    family: 'Retro',
    colors: {
      bg: '#282828',
      bgDeep: '#1d2021',
      bgSunken: '#191919',
      bgRaise: '#3c3836',
      bgHover: '#32302f',
      bgActive: '#504945',
      border: '#3c3836',
      borderSoft: '#32302f',
      borderStrong: '#504945',
      fg: '#ebdbb2',
      fgDim: '#d5c4a1',
      fgMute: '#a89984',
      fgFaint: '#7c6f64',
      blue: '#83a598',
      cyan: '#8ec07c',
      teal: '#689d6a',
      green: '#b8bb26',
      yellow: '#fabd2f',
      orange: '#fe8019',
      red: '#fb4934',
      purple: '#d3869b',
      accent: '#83a598'
    }
  },
  {
    id: 'nord',
    name: 'Nord',
    family: 'Arctic',
    colors: {
      bg: '#2e3440',
      bgDeep: '#292e39',
      bgSunken: '#242933',
      bgRaise: '#3b4252',
      bgHover: '#353c4a',
      bgActive: '#434c5e',
      border: '#3b4252',
      borderSoft: '#343b49',
      borderStrong: '#4c566a',
      fg: '#eceff4',
      fgDim: '#d8dee9',
      fgMute: '#a6adbb',
      fgFaint: '#7b8494',
      blue: '#81a1c1',
      cyan: '#88c0d0',
      teal: '#8fbcbb',
      green: '#a3be8c',
      yellow: '#ebcb8b',
      orange: '#d08770',
      red: '#bf616a',
      purple: '#b48ead',
      accent: '#88c0d0'
    }
  },
  {
    id: 'dracula',
    name: 'Dracula',
    family: 'Classic',
    colors: {
      bg: '#282a36',
      bgDeep: '#21222c',
      bgSunken: '#1c1d26',
      bgRaise: '#343746',
      bgHover: '#2f313f',
      bgActive: '#44475a',
      border: '#3a3d4d',
      borderSoft: '#32343f',
      borderStrong: '#44475a',
      fg: '#f8f8f2',
      fgDim: '#dfdfda',
      fgMute: '#a9aab8',
      fgFaint: '#6272a4',
      blue: '#8be9fd',
      cyan: '#8be9fd',
      teal: '#50fa7b',
      green: '#50fa7b',
      yellow: '#f1fa8c',
      orange: '#ffb86c',
      red: '#ff5555',
      purple: '#ff79c6',
      accent: '#bd93f9'
    }
  },
  {
    id: 'rose-pine',
    name: 'Rosé Pine',
    family: 'Classic',
    colors: {
      bg: '#1f1d2e',
      bgDeep: '#191724',
      bgSunken: '#16141f',
      bgRaise: '#26233a',
      bgHover: '#232135',
      bgActive: '#312e45',
      border: '#2a2740',
      borderSoft: '#232038',
      borderStrong: '#403c5c',
      fg: '#e0def4',
      fgDim: '#cdcbe3',
      fgMute: '#908caa',
      fgFaint: '#6e6a86',
      blue: '#9ccfd8',
      cyan: '#9ccfd8',
      teal: '#31748f',
      green: '#95b1ac',
      yellow: '#f6c177',
      orange: '#ebbcba',
      red: '#eb6f92',
      purple: '#c4a7e7',
      accent: '#c4a7e7'
    }
  }
]

export const DEFAULT_THEME = 'tokyo-night-storm'

export function themeById(id: string | undefined): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]
}

const VAR_NAMES: Record<keyof ThemeColors, string> = {
  bg: '--bg',
  bgDeep: '--bg-deep',
  bgSunken: '--bg-sunken',
  bgRaise: '--bg-raise',
  bgHover: '--bg-hover',
  bgActive: '--bg-active',
  border: '--border',
  borderSoft: '--border-soft',
  borderStrong: '--border-strong',
  fg: '--fg',
  fgDim: '--fg-dim',
  fgMute: '--fg-mute',
  fgFaint: '--fg-faint',
  blue: '--blue',
  cyan: '--cyan',
  teal: '--teal',
  green: '--green',
  yellow: '--yellow',
  orange: '--orange',
  red: '--red',
  purple: '--purple',
  accent: '--accent'
}

function rgba(hex: string, alpha: number): string {
  const value = hex.replace('#', '')
  const full =
    value.length === 3
      ? value
          .split('')
          .map((c) => c + c)
          .join('')
      : value
  const int = parseInt(full, 16)
  return `rgba(${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}, ${alpha})`
}

/** Write the theme onto :root as custom properties. */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement
  for (const [key, name] of Object.entries(VAR_NAMES)) {
    root.style.setProperty(name, theme.colors[key as keyof ThemeColors])
  }
  // Derived tokens that need alpha over the theme's own accent.
  root.style.setProperty('--accent-soft', rgba(theme.colors.accent, 0.14))
  root.style.setProperty('--accent-line', rgba(theme.colors.accent, 0.38))
  root.style.setProperty('--bg-overlay', rgba(theme.colors.bgSunken, 0.66))
  root.style.setProperty('--on-accent', theme.colors.bgDeep)
  root.dataset.theme = theme.id
}
