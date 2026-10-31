// TOGETHER design tokens.
// Алтан өнгө (#C6A66B) дээр текст бичихгүй: Ivory дээр ~2:1 контраст, WCAG-д хүрэхгүй.
// Gold дээрх текст = Midnight Navy (~7.7:1). Sage дээрх жижиг текст = Navy.

export const palette = {
  midnightNavy: '#111923',
  champagneGold: '#C6A66B',
  warmIvory: '#F4F0E7',
  sageGreen: '#718A7A',
  mutedRose: '#B97870',
  softGray: '#E8E4DA',
} as const;

export const lightTheme = {
  background: palette.warmIvory,
  surface: '#FFFFFF',
  surfaceMuted: palette.softGray,
  text: palette.midnightNavy,
  textMuted: '#4A5563',
  accent: palette.champagneGold,     // fill, progress, icon, XP
  onAccent: palette.midnightNavy,    // Gold дээрх текст
  success: palette.sageGreen,        // амжилт, биелэлт (fill)
  onSuccess: palette.midnightNavy,
  warning: palette.mutedRose,        // анхааруулга (зөөлөн)
  border: '#D9D3C4',
} as const;

export const darkTheme = {
  background: palette.midnightNavy,
  surface: '#1B2633',
  surfaceMuted: '#243142',
  text: palette.warmIvory,
  textMuted: '#B8BFC9',
  accent: palette.champagneGold,
  onAccent: palette.midnightNavy,
  success: palette.sageGreen,
  onSuccess: palette.midnightNavy,
  warning: palette.mutedRose,
  border: '#2E3B4E',
} as const;

export const radius = { sm: 8, md: 14, lg: 20, pill: 999 } as const;
export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;

export type ThemeName = 'light' | 'dark';
export const themes = { light: lightTheme, dark: darkTheme } as const;
