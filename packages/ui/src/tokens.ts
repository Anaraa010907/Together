// TOGETHER design tokens — "Night Violet" загвар.
// Бараан нил ягаан дэвсгэр, шилэн (glass) картууд, улбар шар → ягаан → нил ягаан градиент.
// Текст: цагаан (#FFF) бараан дэвсгэр дээр ~18:1; muted (#A8A3C7) ~8:1 — WCAG AA давна.
// Градиент товч дээрх текст цагаан (хамгийн цайвар цэг #FF8A3D дээр ~2.6:1 тул товчны текст 16px+ bold).

export const palette = {
  ink: '#0C0A1C',
  night: '#17132E',
  plum: '#221B42',
  violet: '#8B5CF6',
  violetDeep: '#6D28D9',
  lilac: '#C4B5FD',
  orange: '#FF8A3D',
  pink: '#EC4899',
  amber: '#FBBF24',
  mint: '#34D399',
  rose: '#FB7185',
  white: '#FFFFFF',
} as const;

export const theme = {
  background: palette.ink,
  surface: 'rgba(255,255,255,0.06)',       // шилэн карт
  surfaceSolid: palette.night,              // modal, доод цэс
  surfaceMuted: 'rgba(255,255,255,0.04)',
  text: palette.white,
  textMuted: '#A8A3C7',
  textFaint: '#7D78A3',
  accent: palette.violet,                   // fill, progress, icon, идэвхтэй төлөв
  onAccent: palette.white,
  success: palette.mint,
  onSuccess: palette.ink,
  warning: palette.rose,
  xp: palette.amber,
  border: 'rgba(255,255,255,0.10)',
  borderSoft: 'rgba(255,255,255,0.06)',
} as const;

// Хуучин импортуудтай нийцүүлэх нэрс (апп бүхэлдээ бараан загвартай).
export const lightTheme = theme;
export const darkTheme = theme;

// LinearGradient-д шууд дамжуулна.
export const gradients = {
  brand: ['#FF8A3D', '#EC4899', '#8B5CF6'] as const,      // гол товч, онцлох
  violet: ['#A855F7', '#7C3AED'] as const,                 // идэвхтэй chip, + товч
  sunset: ['#FF8A3D', '#F0568C'] as const,                 // жижиг тэмдэг, badge
  card: ['rgba(139,92,246,0.38)', 'rgba(236,72,153,0.20)', 'rgba(255,138,61,0.30)'] as const,
  glass: ['rgba(255,255,255,0.09)', 'rgba(255,255,255,0.03)'] as const,
  ring: ['#FF8A3D', '#EC4899', '#8B5CF6'] as const,
};

export const radius = { sm: 10, md: 16, lg: 22, xl: 28, pill: 999 } as const;
export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;

// Manrope (@expo-google-fonts/manrope) — Монгол кирилл дэмжинэ. _layout-д ачаална.
export const font = {
  medium: 'Manrope_500Medium',
  semibold: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
  extrabold: 'Manrope_800ExtraBold',
} as const;

// Android-д тунгалаг дэвсгэртэй view дээр elevation сүүдэр "нэвт" харагддаг тул 0.
export const shadow = {
  card: {
    shadowColor: '#000000',
    shadowOpacity: 0.3,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 0,
  },
  glow: {
    shadowColor: palette.violet,
    shadowOpacity: 0.55,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
} as const;

export type ThemeName = 'dark';
export const themes = { dark: theme } as const;
