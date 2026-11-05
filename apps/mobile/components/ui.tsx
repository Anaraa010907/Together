import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { font, gradients, lightTheme as t, palette, radius, shadow, space } from '@together/ui/tokens';
import { Backdrop } from './Backdrop';

// ---------- Дэлгэцийн суурь ----------
export function Screen({
  children,
  scroll = true,
  center = false,
  style,
}: {
  children: ReactNode;
  scroll?: boolean;
  center?: boolean;
  style?: ViewStyle;
}) {
  const content = [styles.screen, center && { flexGrow: 1, justifyContent: 'center' as const }, style];
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Backdrop />
      {scroll ? (
        <ScrollView contentContainerStyle={content} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, ...content]}>{children}</View>
      )}
    </KeyboardAvoidingView>
  );
}

// ---------- Текст ----------
export function H1({ children }: { children: ReactNode }) {
  return <Text style={styles.h1}>{children}</Text>;
}
export function H2({ children }: { children: ReactNode }) {
  return <Text style={styles.h2}>{children}</Text>;
}
export function Body({ children, muted, center }: { children: ReactNode; muted?: boolean; center?: boolean }) {
  return (
    <Text style={[styles.body, muted && { color: t.textMuted }, center && { textAlign: 'center' }]}>{children}</Text>
  );
}
export function Caption({ children, center }: { children: ReactNode; center?: boolean }) {
  return <Text style={[styles.caption, center && { textAlign: 'center' }]}>{children}</Text>;
}

// ---------- Товч ----------
type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'dark' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
};

export function Button({ label, onPress, variant = 'primary', loading, disabled, icon }: ButtonProps) {
  const v = BUTTON[variant];
  const off = disabled || loading;
  const inner = loading ? (
    <ActivityIndicator color={v.fg} />
  ) : (
    <View style={styles.buttonRow}>
      {icon && <Ionicons name={icon} size={18} color={v.fg} />}
      <Text style={[styles.buttonText, { color: v.fg }]}>{label}</Text>
    </View>
  );
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      style={({ pressed }) => [
        { opacity: off ? 0.55 : pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
        variant === 'primary' && shadow.glow,
      ]}
    >
      {variant === 'primary' ? (
        <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={[styles.button, { borderWidth: 0 }]}>
          {inner}
        </LinearGradient>
      ) : (
        <View style={[styles.button, { backgroundColor: v.bg, borderColor: v.border }]}>{inner}</View>
      )}
    </Pressable>
  );
}

const BUTTON = {
  primary: { bg: t.accent, fg: t.onAccent, border: t.accent },
  secondary: { bg: t.surface, fg: t.text, border: t.border },
  dark: { bg: t.surfaceSolid, fg: t.text, border: t.border },
  ghost: { bg: 'transparent', fg: t.text, border: 'transparent' },
} as const;

export function TextLink({ label, onPress, strong }: { label: string; onPress: () => void; strong?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="link" hitSlop={8} style={{ alignSelf: 'center', paddingVertical: space.sm }}>
      <Text style={styles.link}>
        {label} {!!strong && <Text style={{ fontFamily: font.bold, color: t.text }}>{strong}</Text>}
      </Text>
    </Pressable>
  );
}

// ---------- Input ----------
type FieldProps = TextInputProps & {
  label: string;
  error?: string | null;
  hint?: string;
  prefix?: string;
  secureToggle?: boolean;
};

export function Field({ label, error, hint, prefix, secureToggle, style, ...input }: FieldProps) {
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(true);
  const borderColor = error ? t.warning : focused ? t.accent : t.border;
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.field, { borderColor, borderWidth: focused || error ? 1.5 : 1 }]}>
        {!!prefix && <Text style={styles.prefix}>{prefix}</Text>}
        <TextInput
          {...input}
          secureTextEntry={secureToggle ? hidden : input.secureTextEntry}
          onFocus={(e) => {
            setFocused(true);
            input.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            input.onBlur?.(e);
          }}
          placeholderTextColor={t.textFaint}
          accessibilityLabel={label}
          style={[styles.input, style]}
        />
        {secureToggle && (
          <Pressable
            onPress={() => setHidden((h) => !h)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Show password' : 'Hide password'}
          >
            <Ionicons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={20} color={t.textMuted} />
          </Pressable>
        )}
      </View>
      {!!error && <Text style={[styles.caption, { color: t.warning }]}>{error}</Text>}
      {!error && !!hint && <Text style={styles.caption}>{hint}</Text>}
    </View>
  );
}

// ---------- Карт, сонголт, хуваагч ----------
export function Card({ children, dark, style }: { children: ReactNode; dark?: boolean; style?: ViewStyle }) {
  return (
    <View style={[styles.card, dark ? { backgroundColor: t.surfaceSolid } : null, shadow.card, style]}>
      {children}
    </View>
  );
}

export function Segmented<T extends string | number | boolean>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            onPress={() => onChange(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            style={[styles.segment, active && { backgroundColor: '#FFFFFF' }]}
          >
            <Text style={[styles.segmentText, active && { color: t.background, fontFamily: font.bold }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// Сонголтын chip (олон сонголт, шүүлтүүр).
export function Chip({
  label,
  icon,
  selected,
  onPress,
}: {
  label: string;
  icon?: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
    >
      {selected ? (
        <LinearGradient colors={gradients.violet} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.chip, { borderColor: 'rgba(196,181,253,0.5)' }]}>
          {!!icon && <Text style={{ fontSize: 16 }}>{icon}</Text>}
          <Text style={[styles.chipText, { fontFamily: font.bold }]}>{label}</Text>
        </LinearGradient>
      ) : (
        <View style={styles.chip}>
          {!!icon && <Text style={{ fontSize: 16 }}>{icon}</Text>}
          <Text style={styles.chipText}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

// Жагсаалтын мөр (тохиргоо, холбоос).
export function ListRow({
  icon,
  label,
  value,
  onPress,
  danger,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.listRow, { opacity: pressed ? 0.7 : 1 }]}
    >
      <View style={styles.listIcon}>
        <Ionicons name={icon} size={18} color={danger ? t.warning : palette.lilac} />
      </View>
      <Text style={[styles.listLabel, danger && { color: t.warning }]} numberOfLines={1}>
        {label}
      </Text>
      {!!value && (
        <Text style={styles.caption} numberOfLines={1}>
          {value}
        </Text>
      )}
      <Ionicons name="chevron-forward" size={18} color={t.textFaint} />
    </Pressable>
  );
}

// Хэсгийн гарчиг + баруун талд "Бүгд ›" холбоос.
export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {!!action && (
        <Pressable onPress={onAction} hitSlop={8} accessibilityRole="link" style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <Text style={styles.sectionAction}>{action}</Text>
          <Ionicons name="chevron-forward" size={14} color={palette.lilac} />
        </Pressable>
      )}
    </View>
  );
}

export function Divider({ label }: { label: string }) {
  return (
    <View style={styles.divider}>
      <View style={styles.line} />
      <Text style={styles.caption}>{label}</Text>
      <View style={styles.line} />
    </View>
  );
}

export function Steps({ total, current }: { total: number; current: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={{
            height: 6,
            flex: 1,
            borderRadius: 3,
            backgroundColor: i < current ? t.accent : 'rgba(255,255,255,0.12)',
          }}
        />
      ))}
    </View>
  );
}

// ---------- Дугуй progress (дараагийн түвшин хүртэл) ----------
export function ProgressRing({
  progress,
  size = 96,
  stroke = 9,
  trackColor = 'rgba(255,255,255,0.12)',
  children,
}: {
  progress: number;
  size?: number;
  stroke?: number;
  trackColor?: string;
  children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, progress));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Defs>
          <SvgGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={gradients.ring[0]} />
            <Stop offset="0.5" stopColor={gradients.ring[1]} />
            <Stop offset="1" stopColor={gradients.ring[2]} />
          </SvgGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={trackColor} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="url(#ringGrad)"
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${c} ${c}`}
          strokeDashoffset={c * (1 - p)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 20, paddingTop: 64, gap: space.md, paddingBottom: space.xl },
  h1: { fontFamily: font.extrabold, fontSize: 30, lineHeight: 36, color: t.text, letterSpacing: -0.5 },
  h2: { fontFamily: font.bold, fontSize: 20, lineHeight: 26, color: t.text },
  body: { fontFamily: font.medium, fontSize: 16, lineHeight: 23, color: t.text },
  caption: { fontFamily: font.medium, fontSize: 13, lineHeight: 18, color: t.textMuted },
  label: { fontFamily: font.semibold, fontSize: 14, color: t.text },
  link: { fontFamily: font.medium, fontSize: 15, color: t.textMuted },
  button: { height: 54, borderRadius: radius.pill, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  buttonRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  buttonText: { fontFamily: font.bold, fontSize: 16 },
  field: {
    minHeight: 52,
    borderRadius: radius.md,
    backgroundColor: t.surface,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 8,
  },
  prefix: { fontFamily: font.semibold, fontSize: 16, color: t.textMuted },
  input: { flex: 1, fontFamily: font.medium, fontSize: 16, color: t.text, paddingVertical: 12 },
  card: { backgroundColor: t.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: t.border, padding: 18 },
  segmented: { flexDirection: 'row', backgroundColor: t.surface, borderWidth: 1, borderColor: t.borderSoft, borderRadius: radius.pill, padding: 4, gap: 4 },
  segment: { flex: 1, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  segmentText: { fontFamily: font.semibold, fontSize: 14, color: t.textMuted },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: t.border,
    backgroundColor: t.surface, borderRadius: radius.pill, paddingVertical: 9, paddingHorizontal: 15,
  },
  chipText: { fontFamily: font.semibold, fontSize: 14, color: t.text },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 4 },
  listIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(139,92,246,0.16)', alignItems: 'center', justifyContent: 'center' },
  listLabel: { flex: 1, fontFamily: font.semibold, fontSize: 15, color: t.text },
  divider: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginVertical: 4 },
  line: { flex: 1, height: 1, backgroundColor: t.border },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontFamily: font.extrabold, fontSize: 19, color: t.text },
  sectionAction: { fontFamily: font.bold, fontSize: 14, color: palette.lilac },
});
