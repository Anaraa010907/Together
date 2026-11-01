import { Image, Text, View } from 'react-native';
import { font, lightTheme as t } from '@together/ui/tokens';

// Профайлын зураг эсвэл нэрийн эхний үсэг (алтан дэвсгэр дээр navy).
export function Avatar({ name, url, size = 40 }: { name?: string | null; url?: string | null; size?: number }) {
  const r = size / 2;
  if (url) {
    return (
      <Image
        source={{ uri: url }}
        style={{ width: size, height: size, borderRadius: r, backgroundColor: '#ECE6DA' }}
        accessibilityLabel={name ?? undefined}
      />
    );
  }
  return (
    <View
      style={{ width: size, height: size, borderRadius: r, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center' }}
      accessibilityLabel={name ?? undefined}
    >
      <Text style={{ fontFamily: font.extrabold, fontSize: size * 0.4, color: t.onAccent }}>
        {(name || '?').trim().slice(0, 1).toUpperCase()}
      </Text>
    </View>
  );
}
