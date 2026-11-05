import { Image, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { font, gradients, lightTheme as t } from '@together/ui/tokens';

// Профайлын зураг эсвэл нэрийн эхний үсэг (нил ягаан градиент дээр).
// ring=true үед улбар шар → нил ягаан градиент хүрээтэй.
export function Avatar({
  name,
  url,
  size = 40,
  ring = false,
  style,
}: {
  name?: string | null;
  url?: string | null;
  size?: number;
  ring?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const r = size / 2;
  const inner = url ? (
    <Image
      source={{ uri: url }}
      style={{ width: size, height: size, borderRadius: r, backgroundColor: t.surfaceSolid }}
      accessibilityLabel={name ?? undefined}
    />
  ) : (
    <LinearGradient
      colors={gradients.violet}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ width: size, height: size, borderRadius: r, alignItems: 'center', justifyContent: 'center' }}
      accessibilityLabel={name ?? undefined}
    >
      <Text style={{ fontFamily: font.extrabold, fontSize: size * 0.4, color: '#FFFFFF' }}>
        {(name || '?').trim().slice(0, 1).toUpperCase()}
      </Text>
    </LinearGradient>
  );
  if (!ring) return <View style={style}>{inner}</View>;
  const pad = Math.max(2, Math.round(size * 0.05));
  return (
    <LinearGradient
      colors={gradients.ring}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[{ padding: pad, borderRadius: r + pad * 2 }, style]}
    >
      <View style={{ padding: pad, borderRadius: r + pad, backgroundColor: t.background }}>{inner}</View>
    </LinearGradient>
  );
}

// Гишүүдийн жижиг аватарууд давхарлаж + "+N".
export function AvatarStack({
  people,
  total,
  size = 26,
}: {
  people: { name?: string | null; url?: string | null }[];
  total?: number;
  size?: number;
}) {
  const shown = people.slice(0, 3);
  const extra = (total ?? people.length) - shown.length;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {shown.map((p, i) => (
        <View
          key={i}
          style={{ marginLeft: i === 0 ? 0 : -size * 0.32, borderRadius: size, borderWidth: 2, borderColor: t.background }}
        >
          <Avatar name={p.name} url={p.url} size={size} />
        </View>
      ))}
      {extra > 0 && (
        <View
          style={{
            marginLeft: shown.length ? -size * 0.32 : 0,
            minWidth: size + 4,
            height: size + 4,
            borderRadius: size,
            borderWidth: 2,
            borderColor: t.background,
            backgroundColor: '#2A2350',
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 5,
          }}
        >
          <Text style={{ fontFamily: font.bold, fontSize: 10, color: '#FFFFFF' }}>+{extra > 99 ? '99' : extra}</Text>
        </View>
      )}
    </View>
  );
}
