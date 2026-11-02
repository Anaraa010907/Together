import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { font, palette, shadow } from '@together/ui/tokens';

const ICONS: Record<string, [keyof typeof Ionicons.glyphMap, keyof typeof Ionicons.glyphMap]> = {
  home: ['sunny-outline', 'sunny'],
  groups: ['people-outline', 'people'],
  profile: ['person-outline', 'person'],
};

const PILL = 64;
const BUBBLE = 52;

// Хөвөгч navy "pill" доод цэс: идэвхтэй табын алтан дугуй пүршээр гулсаж шилжинэ.
export function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const [width, setWidth] = useState(0);
  const x = useRef(new Animated.Value(0)).current;
  const slot = width / state.routes.length;

  useEffect(() => {
    if (!slot) return;
    Animated.spring(x, {
      toValue: state.index * slot + (slot - BUBBLE) / 2,
      useNativeDriver: true,
      speed: 18,
      bounciness: 9,
    }).start();
  }, [state.index, slot, x]);

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: Math.max(insets.bottom, 12) }]}>
      <View style={[styles.pill, shadow.card]} onLayout={(e) => setWidth(e.nativeEvent.layout.width - 16)}>
        {width > 0 && <Animated.View style={[styles.bubble, { transform: [{ translateX: x }] }]} />}
        {state.routes.map((route, i) => {
          const focused = state.index === i;
          const { options } = descriptors[route.key];
          const label = typeof options.title === 'string' ? options.title : route.name;
          const [outline, filled] = ICONS[route.name] ?? ['ellipse-outline', 'ellipse'];
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={label}
              onPress={() => {
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
              }}
              style={styles.item}
            >
              <Ionicons name={focused ? filled : outline} size={22} color={focused ? palette.midnightNavy : palette.warmIvory} />
              {!focused && <Text style={styles.label}>{label}</Text>}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// Хөвөгч цэсний ард агуулга нуугдахгүйн тулд дэлгэцийн доод зай.
export const TAB_BAR_SPACE = PILL + 40;

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 20, right: 20 },
  pill: {
    height: PILL,
    borderRadius: PILL / 2,
    backgroundColor: palette.midnightNavy,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  bubble: {
    position: 'absolute',
    left: 8,
    width: BUBBLE,
    height: BUBBLE,
    borderRadius: BUBBLE / 2,
    backgroundColor: palette.champagneGold,
  },
  item: { flex: 1, height: PILL, alignItems: 'center', justifyContent: 'center', gap: 2 },
  label: { fontFamily: font.semibold, fontSize: 10, color: 'rgba(244,240,231,0.75)' },
});
