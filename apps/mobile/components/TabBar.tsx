import { useEffect, useRef, useState } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { font, lightTheme as t, palette, shadow } from '@together/ui/tokens';
import { fetchUnreadCount } from '../lib/notifications';

const ICONS: Record<string, [keyof typeof Ionicons.glyphMap, keyof typeof Ionicons.glyphMap]> = {
  home: ['home-outline', 'home'],
  groups: ['people-outline', 'people'],
  notifications: ['notifications-outline', 'notifications'],
  profile: ['person-outline', 'person'],
};

const BAR = 68;
const PLUS = 56;

// Доод цэс: Нүүр · Групп · (+) · Мэдэгдэл · Профайл. Голын + товч "үүсгэх" цэс нээнэ.
export function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const [sheet, setSheet] = useState(false);
  const [unread, setUnread] = useState(0);

  // Таб солих бүрт уншаагүй мэдэгдлийн тоог шинэчилнэ.
  useEffect(() => {
    fetchUnreadCount()
      .then(setUnread)
      .catch(() => setUnread(0));
  }, [state.index]);

  const items = state.routes.map((route, i) => {
    const focused = state.index === i;
    const { options } = descriptors[route.key];
    const label = typeof options.title === 'string' ? options.title : route.name;
    return (
      <TabItem
        key={route.key}
        label={label}
        icons={ICONS[route.name] ?? ['ellipse-outline', 'ellipse']}
        focused={focused}
        badge={route.name === 'notifications' && !focused ? unread : 0}
        onPress={() => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
        }}
      />
    );
  });
  const mid = Math.ceil(items.length / 2);

  return (
    <>
      <View pointerEvents="box-none" style={[styles.wrap, { bottom: Math.max(insets.bottom, 10) }]}>
        <View style={[styles.bar, shadow.card]}>
          {items.slice(0, mid)}
          <View style={styles.plusSlot}>
            <PlusButton onPress={() => setSheet(true)} />
          </View>
          {items.slice(mid)}
        </View>
      </View>
      <CreateSheet visible={sheet} onClose={() => setSheet(false)} />
    </>
  );
}

function TabItem({
  label,
  icons,
  focused,
  badge,
  onPress,
}: {
  label: string;
  icons: [keyof typeof Ionicons.glyphMap, keyof typeof Ionicons.glyphMap];
  focused: boolean;
  badge: number;
  onPress: () => void;
}) {
  const v = useRef(new Animated.Value(focused ? 1 : 0)).current;
  useEffect(() => {
    Animated.spring(v, { toValue: focused ? 1 : 0, useNativeDriver: true, speed: 16, bounciness: 10 }).start();
  }, [focused, v]);
  const scale = v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] });
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={label}
      onPress={onPress}
      style={styles.item}
    >
      <Animated.View style={[styles.glow, { opacity: v, transform: [{ scale: v }] }]} />
      <Animated.View style={{ transform: [{ scale }] }}>
        <Ionicons name={focused ? icons[1] : icons[0]} size={23} color={focused ? palette.lilac : t.textFaint} />
        {badge > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge > 9 ? '9+' : badge}</Text>
          </View>
        )}
      </Animated.View>
      <Text style={[styles.label, focused && styles.labelActive]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function PlusButton({ onPress }: { onPress: () => void }) {
  const { t: tr } = useTranslation();
  const s = useRef(new Animated.Value(1)).current;
  const spin = useRef(new Animated.Value(0)).current;
  return (
    <Pressable
      onPress={() => {
        Animated.sequence([
          Animated.timing(spin, { toValue: 1, duration: 220, useNativeDriver: true }),
          Animated.timing(spin, { toValue: 0, duration: 0, useNativeDriver: true }),
        ]).start();
        onPress();
      }}
      onPressIn={() => Animated.spring(s, { toValue: 0.9, useNativeDriver: true, speed: 40, bounciness: 0 }).start()}
      onPressOut={() => Animated.spring(s, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 12 }).start()}
      accessibilityRole="button"
      accessibilityLabel={tr('create.title')}
      hitSlop={6}
    >
      <Animated.View
        style={[
          shadow.glow,
          {
            transform: [
              { scale: s },
              { rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '90deg'] }) },
            ],
          },
        ]}
      >
        <LinearGradient colors={['#A855F7', '#EC4899']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.plus}>
          <Ionicons name="add" size={30} color="#FFFFFF" />
        </LinearGradient>
      </Animated.View>
    </Pressable>
  );
}

const ACTIONS: { key: string; icon: keyof typeof Ionicons.glyphMap; colors: readonly [string, string]; to: string }[] = [
  { key: 'goal', icon: 'flag', colors: ['#FF8A3D', '#F0568C'], to: '/goal/new' },
  { key: 'group', icon: 'people', colors: ['#A855F7', '#7C3AED'], to: '/group/new' },
  { key: 'join', icon: 'key', colors: ['#EC4899', '#8B5CF6'], to: '/join' },
  { key: 'people', icon: 'search', colors: ['#34D399', '#0EA5E9'], to: '/search' },
];

// "Үүсгэх" доороос гарч ирэх цэс.
function CreateSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t: tr } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const y = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (visible) {
      y.setValue(0);
      Animated.spring(y, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 6 }).start();
    }
  }, [visible, y]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityRole="button" accessibilityLabel={tr('common.cancel')} />
      <Animated.View
        style={[
          styles.sheet,
          {
            paddingBottom: Math.max(insets.bottom, 16) + 8,
            transform: [{ translateY: y.interpolate({ inputRange: [0, 1], outputRange: [320, 0] }) }],
          },
        ]}
      >
        <View style={styles.handle} />
        <Text style={styles.sheetTitle}>{tr('create.title')}</Text>
        <View style={styles.grid}>
          {ACTIONS.map((a, i) => (
            <SheetAction
              key={a.key}
              index={i}
              visible={visible}
              icon={a.icon}
              colors={a.colors}
              title={tr(`create.${a.key}`)}
              subtitle={tr(`create.${a.key}Sub`)}
              onPress={() => {
                onClose();
                router.push(a.to as never);
              }}
            />
          ))}
        </View>
      </Animated.View>
    </Modal>
  );
}

function SheetAction({
  index,
  visible,
  icon,
  colors,
  title,
  subtitle,
  onPress,
}: {
  index: number;
  visible: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  colors: readonly [string, string];
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!visible) return;
    v.setValue(0);
    Animated.timing(v, { toValue: 1, duration: 320, delay: 80 + index * 60, useNativeDriver: true }).start();
  }, [visible, index, v]);
  return (
    <Animated.View
      style={{
        width: '48%',
        opacity: v,
        transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
      }}
    >
      <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.action, pressed && { opacity: 0.8 }]}>
        <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.actionIcon}>
          <Ionicons name={icon} size={20} color="#FFFFFF" />
        </LinearGradient>
        <Text style={styles.actionTitle}>{title}</Text>
        <Text style={styles.actionSub} numberOfLines={2}>
          {subtitle}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

// Доод цэсний ард агуулга нуугдахгүйн тулд дэлгэцийн доод зай.
export const TAB_BAR_SPACE = BAR + 44;

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 12, right: 12 },
  bar: {
    height: BAR,
    borderRadius: 26,
    backgroundColor: 'rgba(23,19,46,0.97)',
    borderWidth: 1,
    borderColor: t.border,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, height: BAR },
  glow: {
    position: 'absolute',
    top: 8,
    width: 46,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(139,92,246,0.22)',
  },
  label: { fontFamily: font.semibold, fontSize: 11, color: t.textFaint },
  labelActive: { fontFamily: font.bold, color: '#FFFFFF' },
  badge: {
    position: 'absolute',
    top: -5,
    right: -9,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: palette.pink,
    borderWidth: 2,
    borderColor: palette.night,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontFamily: font.bold, fontSize: 9, color: '#FFFFFF' },
  plusSlot: { width: PLUS + 16, alignItems: 'center' },
  plus: {
    width: PLUS,
    height: PLUS,
    borderRadius: PLUS / 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -26,
    borderWidth: 4,
    borderColor: t.background,
  },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,4,14,0.65)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: palette.night,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderWidth: 1,
    borderColor: t.border,
    paddingHorizontal: 20,
    paddingTop: 10,
    gap: 14,
  },
  handle: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.18)' },
  sheetTitle: { fontFamily: font.extrabold, fontSize: 20, color: '#FFFFFF' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 },
  action: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 20, padding: 14, gap: 8, minHeight: 122 },
  actionIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  actionTitle: { fontFamily: font.bold, fontSize: 15, color: '#FFFFFF' },
  actionSub: { fontFamily: font.medium, fontSize: 12, color: t.textMuted, lineHeight: 16 },
});
