// All colors live here. Components must use these tokens, never hex literals.
// Warm, appetite-friendly palette; no blue/purple in the main UI.

export const palette = {
  tomato: '#E4572E',
  tomatoStrong: '#C8431F', // darker tomato: passes AA (4.5:1) with white normal-size text
  saffron: '#F29E4C',
  mustard: '#F6C85F',
  herb: '#6A994E',
  cream: '#FFF8F0',
  white: '#FFFFFF',
  espresso: '#2B2118',
  espressoMuted: '#6B5A4B',
  sand: '#EFE3D3',
  black: '#000000',
} as const;

export const colors = {
  primary: palette.tomato, // like button, icons, large bold text
  primaryStrong: palette.tomatoStrong, // CTA button backgrounds with normal-size labels
  onPrimary: palette.white,
  secondary: palette.saffron,
  onSecondary: palette.espresso,
  accent: palette.mustard, // highlights, match celebration
  onAccent: palette.espresso,
  success: palette.herb, // success + match confirmations only
  onSuccess: palette.espresso,
  background: palette.cream,
  surface: palette.white,
  text: palette.espresso,
  textMuted: palette.espressoMuted,
  border: palette.sand,
  overlay: palette.black, // photo gradients (used with opacity)
  onPhoto: palette.white,
} as const;

/**
 * Text/background pairs used in the UI, checked by the contrast test.
 * `large` = only used for >= 18.66px bold or >= 24px text, or icons.
 */
export const textPairs: { fg: string; bg: string; large?: boolean; name: string }[] = [
  { name: 'text on background', fg: colors.text, bg: colors.background },
  { name: 'text on surface', fg: colors.text, bg: colors.surface },
  { name: 'muted text on background', fg: colors.textMuted, bg: colors.background },
  { name: 'muted text on surface', fg: colors.textMuted, bg: colors.surface },
  { name: 'label on primaryStrong', fg: colors.onPrimary, bg: colors.primaryStrong },
  { name: 'large label/icon on primary', fg: colors.onPrimary, bg: colors.primary, large: true },
  { name: 'primary icon on surface', fg: colors.primary, bg: colors.surface, large: true },
  { name: 'primaryStrong text on background', fg: colors.primaryStrong, bg: colors.background },
  { name: 'primaryStrong text on surface', fg: colors.primaryStrong, bg: colors.surface },
  { name: 'text on secondary', fg: colors.onSecondary, bg: colors.secondary },
  { name: 'text on accent', fg: colors.onAccent, bg: colors.accent },
  { name: 'text on success', fg: colors.onSuccess, bg: colors.success },
  { name: 'white on photo gradient (black 70%)', fg: colors.onPhoto, bg: '#4D4D4D' },
];

/** Bottom gradient on food photos; its darkest stop backs the white text (see textPairs). */
export const gradients = {
  photo: ['rgba(0,0,0,0)', 'rgba(0,0,0,0.35)', 'rgba(0,0,0,0.8)'] as const,
};

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const;
export const radius = { sm: 8, md: 16, lg: 24, pill: 999 } as const;
export const font = {
  body: 16,
  small: 14,
  title: 22,
  hero: 30,
  // >= 18.66 bold counts as WCAG "large text"
  largeBold: 19,
} as const;
