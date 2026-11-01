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
import Svg, { Circle } from 'react-native-svg';
import { font, lightTheme as t, radius, shadow, space } from '@together/ui/tokens';

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
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: v.bg, borderColor: v.border, opacity: off ? 0.55 : pressed ? 0.85 : 1 },
        variant === 'primary' && shadow.card,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.fg} />
      ) : (
        <View style={styles.buttonRow}>
          {icon && <Ionicons name={icon} size={18} color={v.fg} />}
          <Text style={[styles.buttonText, { color: v.fg }]}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

const BUTTON = {
  primary: { bg: t.accent, fg: t.onAccent, border: t.accent },
  secondary: { bg: t.surface, fg: t.text, border: t.border },
  dark: { bg: t.text, fg: t.background, border: t.text },
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
  const borderColor = error ? t.warning : focused ? t.accent : '#E3DDCF';
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
          placeholderTextColor="#9AA2AD"
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
    <View style={[styles.card, dark ? { backgroundColor: t.text, borderColor: t.text } : null, shadow.card, style]}>
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
            style={[styles.segment, active && { backgroundColor: t.surface, ...shadow.card }]}
          >
            <Text style={[styles.segmentText, active && { color: t.text, fontFamily: font.bold }]}>{o.label}</Text>
          </Pressable>
        );
      })}
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
            backgroundColor: i < current ? t.accent : '#E3DDCF',
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
  trackColor = 'rgba(244,240,231,0.15)',
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
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={trackColor} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={t.accent}
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
  caption: { fontFamily: font.medium, fontSize: 13, lineHeight: 18, color: '#5B6573' },
  label: { fontFamily: font.semibold, fontSize: 14, color: t.text },
  link: { fontFamily: font.medium, fontSize: 15, color: '#5B6573' },
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
  prefix: { fontFamily: font.semibold, fontSize: 16, color: '#5B6573' },
  input: { flex: 1, fontFamily: font.medium, fontSize: 16, color: t.text, paddingVertical: 12 },
  card: { backgroundColor: t.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: '#EFEAE0', padding: 18 },
  segmented: { flexDirection: 'row', backgroundColor: '#ECE6DA', borderRadius: radius.pill, padding: 4, gap: 4 },
  segment: { flex: 1, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  segmentText: { fontFamily: font.semibold, fontSize: 15, color: '#5B6573' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginVertical: 4 },
  line: { flex: 1, height: 1, backgroundColor: '#E3DDCF' },
});
