import { useEffect, useRef } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { font, lightTheme as t, palette } from '@together/ui/tokens';

export type SheetOption = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  destructive?: boolean;
};

// Доороос гарч ирэх сонголтын цэс (Android-ын цагаан Alert-ийн оронд, бараан загвартай).
export function ActionSheet({
  visible,
  title,
  options,
  onClose,
}: {
  visible: boolean;
  title?: string;
  options: SheetOption[];
  onClose: () => void;
}) {
  const { t: tr } = useTranslation();
  const insets = useSafeAreaInsets();
  const y = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (visible) {
      y.setValue(0);
      Animated.spring(y, { toValue: 1, useNativeDriver: true, speed: 16, bounciness: 5 }).start();
    }
  }, [visible, y]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityRole="button" accessibilityLabel={tr('common.cancel')} />
      <Animated.View
        style={[
          styles.sheet,
          {
            paddingBottom: Math.max(insets.bottom, 14) + 6,
            transform: [{ translateY: y.interpolate({ inputRange: [0, 1], outputRange: [300, 0] }) }],
          },
        ]}
      >
        <View style={styles.handle} />
        {!!title && (
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
        )}
        <View style={styles.list}>
          {options.map((o, i) => (
            <Pressable
              key={o.label}
              onPress={() => {
                onClose();
                // Modal хаагдсаны дараа дараагийн дэлгэц/цонх нээгдэнэ.
                setTimeout(o.onPress, 220);
              }}
              accessibilityRole="button"
              style={({ pressed }) => [styles.option, i > 0 && styles.divider, pressed && { backgroundColor: 'rgba(255,255,255,0.05)' }]}
            >
              <View style={[styles.icon, o.destructive && { backgroundColor: 'rgba(251,113,133,0.15)' }]}>
                <Ionicons name={o.icon} size={19} color={o.destructive ? palette.rose : palette.lilac} />
              </View>
              <Text style={[styles.label, o.destructive && { color: palette.rose }]}>{o.label}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable onPress={onClose} accessibilityRole="button" style={({ pressed }) => [styles.cancel, pressed && { opacity: 0.8 }]}>
          <Text style={styles.cancelText}>{tr('common.cancel')}</Text>
        </Pressable>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,4,14,0.65)' },
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: palette.night,
    borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, borderColor: t.border,
    paddingHorizontal: 16, paddingTop: 10, gap: 12,
  },
  handle: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.18)' },
  title: { fontFamily: font.bold, fontSize: 15, color: t.textMuted, paddingHorizontal: 6 },
  list: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 20, overflow: 'hidden' },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 14 },
  divider: { borderTopWidth: 1, borderTopColor: t.borderSoft },
  icon: { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(139,92,246,0.16)', alignItems: 'center', justifyContent: 'center' },
  label: { flex: 1, fontFamily: font.semibold, fontSize: 15, color: t.text },
  cancel: { alignItems: 'center', paddingVertical: 15, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.06)' },
  cancelText: { fontFamily: font.bold, fontSize: 15, color: t.text },
});
