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
  /**
   * The accent's counterweight. Picked to sit across the wheel from `accent`
   * rather than beside it, so the app has two voices instead of ten shades of
   * one. Badges, counts and highlights use it to mean "something new".
   */
  accent2: string
}

export interface Theme {
  id: string
  name: string
  family: string
  /** Drives `color-scheme`, shadow weight and which text reads on the accent. */
  dark: boolean
  colors: ThemeColors
}

export const THEMES: Theme[] = [
  {
    id: 'tokyo-night-storm',
    name: 'Storm',
    family: 'Tokyo Night',
    dark: true,
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
      accent: '#7aa2f7',
      accent2: '#ff9e64'
    }
  },
  {
    id: 'tokyo-night',
    name: 'Night',
    family: 'Tokyo Night',
    dark: true,
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
      accent: '#7aa2f7',
      accent2: '#ff9e64'
    }
  },
  {
    id: 'catppuccin-mocha',
    name: 'Mocha',
    family: 'Catppuccin',
    dark: true,
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
      accent: '#89b4fa',
      accent2: '#fab387'
    }
  },
  {
    id: 'catppuccin-macchiato',
    name: 'Macchiato',
    family: 'Catppuccin',
    dark: true,
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
      accent: '#8aadf4',
      accent2: '#f5a97f'
    }
  },
  {
    id: 'catppuccin-frappe',
    name: 'Frappé',
    family: 'Catppuccin',
    dark: true,
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
      accent: '#8caaee',
      accent2: '#ef9f76'
    }
  },
  {
    id: 'catppuccin-latte',
    name: 'Latte',
    family: 'Catppuccin',
    dark: false,
    colors: {
      bg: '#eff1f5',
      bgDeep: '#e6e9ef',
      bgSunken: '#dce0e8',
      bgRaise: '#ffffff',
      bgHover: '#e6e9ef',
      bgActive: '#d3d8e3',
      border: '#ccd0da',
      borderSoft: '#dee1e9',
      borderStrong: '#acb0be',
      fg: '#4c4f69',
      fgDim: '#5c5f77',
      fgMute: '#7c7f93',
      fgFaint: '#9ca0b0',
      blue: '#1e66f5',
      cyan: '#04a5e5',
      teal: '#179299',
      green: '#40a02b',
      yellow: '#df8e1d',
      orange: '#fe640b',
      red: '#d20f39',
      purple: '#8839ef',
      accent: '#1e66f5',
      accent2: '#fe640b'
    }
  },
  {
    id: 'everforest-dark',
    name: 'Everforest',
    family: 'Woodland',
    dark: true,
    colors: {
      bg: '#2d353b',
      bgDeep: '#272e33',
      bgSunken: '#1e2326',
      bgRaise: '#374145',
      bgHover: '#333c43',
      bgActive: '#414b50',
      border: '#3d484d',
      borderSoft: '#343f44',
      borderStrong: '#4f585e',
      fg: '#d3c6aa',
      fgDim: '#c0b295',
      fgMute: '#9da9a0',
      fgFaint: '#7a8478',
      blue: '#7fbbb3',
      cyan: '#83c092',
      teal: '#83c092',
      green: '#a7c080',
      yellow: '#dbbc7f',
      orange: '#e69875',
      red: '#e67e80',
      purple: '#d699b6',
      accent: '#a7c080',
      accent2: '#e69875'
    }
  },
  {
    id: 'kanagawa-wave',
    name: 'Kanagawa',
    family: 'Woodland',
    dark: true,
    colors: {
      bg: '#1f1f28',
      bgDeep: '#16161d',
      bgSunken: '#12121a',
      bgRaise: '#2a2a37',
      bgHover: '#24242f',
      bgActive: '#363646',
      border: '#2a2a37',
      borderSoft: '#232330',
      borderStrong: '#54546d',
      fg: '#dcd7ba',
      fgDim: '#c8c093',
      fgMute: '#938aa9',
      fgFaint: '#727169',
      blue: '#7e9cd8',
      cyan: '#7fb4ca',
      teal: '#6a9589',
      green: '#98bb6c',
      yellow: '#e6c384',
      orange: '#ffa066',
      red: '#e46876',
      purple: '#957fb8',
      accent: '#7e9cd8',
      accent2: '#ffa066'
    }
  },
  {
    id: 'ayu-mirage',
    name: 'Mirage',
    family: 'Ayu',
    dark: true,
    colors: {
      bg: '#242936',
      bgDeep: '#1f2430',
      bgSunken: '#1a1f29',
      bgRaise: '#2d3441',
      bgHover: '#2a303c',
      bgActive: '#3a4250',
      border: '#323945',
      borderSoft: '#2b323d',
      borderStrong: '#4a5364',
      fg: '#cbccc6',
      fgDim: '#b8bcb6',
      fgMute: '#8a9199',
      fgFaint: '#5c6773',
      blue: '#73d0ff',
      cyan: '#5ccfe6',
      teal: '#95e6cb',
      green: '#bae67e',
      yellow: '#ffd580',
      orange: '#ffa759',
      red: '#f28779',
      purple: '#d4bfff',
      accent: '#ffa759',
      accent2: '#5ccfe6'
    }
  },
  {
    id: 'one-dark',
    name: 'One Dark',
    family: 'Atom',
    dark: true,
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
      accent: '#61afef',
      accent2: '#d19a66'
    }
  },
  {
    id: 'gruvbox-dark',
    name: 'Gruvbox',
    family: 'Retro',
    dark: true,
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
      accent: '#83a598',
      accent2: '#fe8019'
    }
  },
  {
    id: 'solarized-dark',
    name: 'Solarized',
    family: 'Retro',
    dark: true,
    colors: {
      bg: '#002b36',
      bgDeep: '#00252e',
      bgSunken: '#001f26',
      bgRaise: '#073642',
      bgHover: '#04303b',
      bgActive: '#0d4552',
      border: '#0b3c49',
      borderSoft: '#073642',
      borderStrong: '#17505f',
      fg: '#93a1a1',
      fgDim: '#839496',
      fgMute: '#6b8189',
      fgFaint: '#586e75',
      blue: '#268bd2',
      cyan: '#2aa198',
      teal: '#2aa198',
      green: '#859900',
      yellow: '#b58900',
      orange: '#cb4b16',
      red: '#dc322f',
      purple: '#6c71c4',
      accent: '#268bd2',
      accent2: '#cb4b16'
    }
  },
  {
    id: 'solarized-light',
    name: 'Solarized Light',
    family: 'Retro',
    dark: false,
    colors: {
      bg: '#fdf6e3',
      bgDeep: '#f5eeda',
      bgSunken: '#eee8d5',
      bgRaise: '#fffdf6',
      bgHover: '#f4edd8',
      bgActive: '#e6dfc8',
      border: '#e3dcc4',
      borderSoft: '#eee8d5',
      borderStrong: '#c9c2ab',
      fg: '#4a5c62',
      fgDim: '#586e75',
      fgMute: '#78909a',
      fgFaint: '#93a1a1',
      blue: '#268bd2',
      cyan: '#2aa198',
      teal: '#2aa198',
      green: '#6f7f00',
      yellow: '#a37800',
      orange: '#cb4b16',
      red: '#dc322f',
      purple: '#6c71c4',
      accent: '#268bd2',
      accent2: '#cb4b16'
    }
  },
  {
    id: 'arch',
    name: 'Arch',
    family: 'Linux',
    dark: true,
    colors: {
      bg: '#1a1d21',
      bgDeep: '#15181b',
      bgSunken: '#101214',
      bgRaise: '#23272c',
      bgHover: '#1f2328',
      bgActive: '#2c3138',
      border: '#272c32',
      borderSoft: '#20252a',
      borderStrong: '#3a424b',
      fg: '#d5dbe1',
      fgDim: '#b9c1c9',
      fgMute: '#8b949e',
      fgFaint: '#636d78',
      blue: '#1793d1',
      cyan: '#4dc4e8',
      teal: '#33b1a3',
      green: '#8bc34a',
      yellow: '#e2b341',
      orange: '#e08d3c',
      red: '#e05561',
      purple: '#a98bd8',
      accent: '#1793d1',
      accent2: '#e2b341'
    }
  },
  {
    id: 'nord',
    name: 'Nord',
    family: 'Arctic',
    dark: true,
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
      accent: '#88c0d0',
      accent2: '#d08770'
    }
  },
  {
    id: 'dracula',
    name: 'Dracula',
    family: 'Classic',
    dark: true,
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
      accent: '#bd93f9',
      accent2: '#50fa7b'
    }
  },
  {
    id: 'rose-pine',
    name: 'Rosé Pine',
    family: 'Classic',
    dark: true,
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
      accent: '#c4a7e7',
      accent2: '#f6c177'
    }
  },
  {
    id: 'rose-pine-dawn',
    name: 'Dawn',
    family: 'Classic',
    dark: false,
    colors: {
      bg: '#faf4ed',
      bgDeep: '#f2e9e1',
      bgSunken: '#eae0d6',
      bgRaise: '#fffaf3',
      bgHover: '#f4ede8',
      bgActive: '#e4dcd6',
      border: '#dfdad9',
      borderSoft: '#ece5df',
      borderStrong: '#c5bfc4',
      fg: '#575279',
      fgDim: '#6a6389',
      fgMute: '#797593',
      fgFaint: '#9893a5',
      blue: '#56949f',
      cyan: '#56949f',
      teal: '#286983',
      green: '#4f8f68',
      yellow: '#ea9d34',
      orange: '#d7827e',
      red: '#b4637a',
      purple: '#907aa9',
      accent: '#907aa9',
      accent2: '#ea9d34'
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
  accent: '--accent',
  accent2: '--accent-2'
}

function channels(hex: string): [number, number, number] {
  const value = hex.replace('#', '')
  const full =
    value.length === 3
      ? value
          .split('')
          .map((c) => c + c)
          .join('')
      : value
  const int = parseInt(full, 16)
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255]
}

function rgba(hex: string, alpha: number): string {
  const [r, g, b] = channels(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** WCAG relative luminance, used to decide what text can sit on a colour. */
function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/**
 * Text that reads on a filled swatch. A badge is small and often bold, so
 * guessing this from the theme's brightness is not good enough -- a light theme
 * can still have a dark accent, and a dark one a near-white accent. 0.179 is
 * where black and white draw level on the WCAG contrast formula.
 */
export function readableOn(hex: string): string {
  return luminance(hex) > 0.179 ? '#0e1013' : '#ffffff'
}

/** Write the theme onto :root as custom properties. */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement
  const c = theme.colors
  const set = (name: string, value: string): void => root.style.setProperty(name, value)

  for (const [key, name] of Object.entries(VAR_NAMES)) {
    set(name, c[key as keyof ThemeColors])
  }

  // Tints. Every one is derived from the theme rather than frozen to whichever
  // palette happened to be on screen when the rule was written -- that is what
  // used to make every theme look like Tokyo Night wearing a different coat.
  const soft = theme.dark ? 0.14 : 0.11
  const wash = theme.dark ? 0.09 : 0.08
  const tint: [string, string][] = [
    ['accent', c.accent],
    ['accent-2', c.accent2],
    ['blue', c.blue],
    ['cyan', c.cyan],
    ['green', c.green],
    ['yellow', c.yellow],
    ['orange', c.orange],
    ['red', c.red],
    ['purple', c.purple]
  ]
  for (const [name, value] of tint) {
    set(`--${name}-wash`, rgba(value, wash))
    set(`--${name}-soft`, rgba(value, soft))
    set(`--${name}-line`, rgba(value, theme.dark ? 0.38 : 0.34))
    set(`--${name}-glow`, rgba(value, theme.dark ? 0.4 : 0.28))
  }

  set('--on-accent', readableOn(c.accent))
  set('--on-accent-2', readableOn(c.accent2))
  set('--bg-overlay', rgba(c.bgSunken, theme.dark ? 0.66 : 0.5))

  // Light surfaces need a much lighter hand: the same shadow that reads as
  // depth on #1a1b26 reads as dirt on #faf4ed.
  const shadow = (y: number, blur: number, alpha: number): string =>
    `0 ${y}px ${blur}px rgba(${theme.dark ? '0, 0, 0' : '90, 78, 66'}, ${alpha})`
  set('--shadow-sm', shadow(1, 2, theme.dark ? 0.22 : 0.08))
  set('--shadow-md', shadow(10, 30, theme.dark ? 0.3 : 0.12))
  set('--shadow-lg', shadow(24, 64, theme.dark ? 0.42 : 0.18))

  root.style.colorScheme = theme.dark ? 'dark' : 'light'
  root.dataset.theme = theme.id
  root.dataset.scheme = theme.dark ? 'dark' : 'light'
}
