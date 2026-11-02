import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, Pressable, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { lightTheme as t } from '@together/ui/tokens';

// Хөдөлгөөний туслахууд — RN-ийн суурь Animated API (нэмэлт сан шаардахгүй, native driver).

// Дэлгэц нээгдэхэд доороос зөөлөн гарч ирнэ. index-ээр дараалуулна (stagger).
export function FadeIn({
  children,
  index = 0,
  delay = 60,
  distance = 18,
  style,
}: {
  children: ReactNode;
  index?: number;
  delay?: number;
  distance?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, {
      toValue: 1,
      duration: 420,
      delay: Math.min(index, 10) * delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [v, index, delay]);
  return (
    <Animated.View
      style={[
        style,
        { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] }) }] },
      ]}
    >
      {children}
    </Animated.View>
  );
}

// Дарахад бага зэрэг агшиж, пүршин буцна.
export function PressableScale({
  children,
  style,
  scaleTo = 0.97,
  ...props
}: PressableProps & { children: ReactNode; style?: StyleProp<ViewStyle>; scaleTo?: number }) {
  const s = useRef(new Animated.Value(1)).current;
  const to = (value: number) =>
    Animated.spring(s, { toValue: value, useNativeDriver: true, speed: 40, bounciness: value === 1 ? 8 : 0 }).start();
  return (
    <Pressable
      {...props}
      onPressIn={(e) => {
        to(scaleTo);
        props.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        to(1);
        props.onPressOut?.(e);
      }}
    >
      <Animated.View style={[style, { transform: [{ scale: s }] }]}>{children}</Animated.View>
    </Pressable>
  );
}

// value өөрчлөгдөхөд "pop" хийнэ (жишээ нь чек тэмдэглэхэд).
export function Pop({ children, trigger, style }: { children: ReactNode; trigger: unknown; style?: StyleProp<ViewStyle> }) {
  const s = useRef(new Animated.Value(1)).current;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    s.setValue(0.6);
    Animated.spring(s, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 14 }).start();
  }, [trigger, s]);
  return <Animated.View style={[style, { transform: [{ scale: s }] }]}>{children}</Animated.View>;
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// Дугуй progress — 0-ээс утга руугаа хөдөлгөөнтэй дүүрнэ.
export function AnimatedRing({
  progress,
  size = 96,
  stroke = 9,
  color = t.accent,
  trackColor = 'rgba(244,240,231,0.15)',
  children,
}: {
  progress: number;
  size?: number;
  stroke?: number;
  color?: string;
  trackColor?: string;
  children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, {
      toValue: Math.max(0, Math.min(1, progress)),
      duration: 900,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // SVG шинж чанар
    }).start();
  }, [progress, v]);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={trackColor} strokeWidth={stroke} fill="none" />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${c} ${c}`}
          strokeDashoffset={v.interpolate({ inputRange: [0, 1], outputRange: [c, 0] })}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {children}
    </View>
  );
}

// Хэвтээ carousel-ийн цэгүүд: идэвхтэй нь урт болж шилжинэ.
export function Dots({ scrollX, count, pageWidth }: { scrollX: Animated.Value; count: number; pageWidth: number }) {
  if (count < 2) return null;
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 10 }}>
      {Array.from({ length: count }, (_, i) => {
        const range = [(i - 1) * pageWidth, i * pageWidth, (i + 1) * pageWidth];
        return (
          <Animated.View
            key={i}
            style={{
              height: 7,
              borderRadius: 4,
              width: scrollX.interpolate({ inputRange: range, outputRange: [7, 22, 7], extrapolate: 'clamp' }),
              backgroundColor: scrollX.interpolate({
                inputRange: range,
                outputRange: ['#D5CDBD', t.accent, '#D5CDBD'],
                extrapolate: 'clamp',
              }),
            }}
          />
        );
      })}
    </View>
  );
}
