import { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg';

// "Хамтдаа хөгжие" баннерын зураг: жаргах нар, толгод, гараа өргөж баярласан хүмүүсийн дүрс, оддын гялбаа.
export function TogetherArt({ width = 170, height = 124 }: { width?: number; height?: number }) {
  // x: байрлал, h: өндөр, arms: 'both' | 'left' | 'right' — аль гараа өргөсөн.
  const figures: { x: number; h: number; arms: 'both' | 'left' | 'right' }[] = [
    { x: 28, h: 50, arms: 'right' },
    { x: 56, h: 60, arms: 'both' },
    { x: 86, h: 68, arms: 'both' },
    { x: 116, h: 58, arms: 'both' },
    { x: 144, h: 48, arms: 'left' },
  ];
  const ink = '#1A0E33';
  return (
    <Svg width={width} height={height} viewBox="0 0 170 124">
      <Defs>
        <RadialGradient id="sun" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#FFE9C2" stopOpacity="1" />
          <Stop offset="0.55" stopColor="#FFB36B" stopOpacity="0.9" />
          <Stop offset="1" stopColor="#FF8A3D" stopOpacity="0" />
        </RadialGradient>
        <LinearGradient id="hill" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#2A1450" stopOpacity="0.95" />
          <Stop offset="1" stopColor="#140A2A" stopOpacity="1" />
        </LinearGradient>
      </Defs>
      <Circle cx="92" cy="74" r="46" fill="url(#sun)" />
      {[
        [20, 22, 3],
        [150, 16, 2.5],
        [128, 40, 2],
        [40, 46, 2],
      ].map(([cx, cy, r], i) => (
        <Path
          key={i}
          d={`M${cx} ${cy - r * 2} L${cx + r * 0.5} ${cy - r * 0.5} L${cx + r * 2} ${cy} L${cx + r * 0.5} ${cy + r * 0.5} L${cx} ${cy + r * 2} L${cx - r * 0.5} ${cy + r * 0.5} L${cx - r * 2} ${cy} L${cx - r * 0.5} ${cy - r * 0.5} Z`}
          fill="#FFFFFF"
          opacity={0.85}
        />
      ))}
      <Path d="M0 106 Q 44 92 88 103 T 170 99 L170 124 L0 124 Z" fill="url(#hill)" />
      {figures.map(({ x, h, arms }, i) => {
        const top = 124 - h;
        const sh = top + 15; // мөрний түвшин
        const arm = (dir: -1 | 1, up: boolean) =>
          up ? (
            <G key={dir}>
              <Path d={`M${x + dir * 7} ${sh + 2} Q${x + dir * 14} ${sh - 6} ${x + dir * 12} ${top - 8}`} stroke={ink} strokeWidth={4.2} strokeLinecap="round" fill="none" />
              <Circle cx={x + dir * 12} cy={top - 9} r={2.6} fill={ink} />
            </G>
          ) : (
            <Path key={dir} d={`M${x + dir * 8} ${sh + 3} Q${x + dir * 12} ${sh + 14} ${x + dir * 11} ${sh + 24}`} stroke={ink} strokeWidth={4.2} strokeLinecap="round" fill="none" />
          );
        return (
          <G key={i}>
            {arm(-1, arms !== 'right')}
            {arm(1, arms !== 'left')}
            <Path d={`M${x - 10} 124 L${x - 10} ${sh + 7} Q${x - 10} ${sh} ${x - 3} ${sh} L${x + 3} ${sh} Q${x + 10} ${sh} ${x + 10} ${sh + 7} L${x + 10} 124 Z`} fill={ink} />
            <Circle cx={x} cy={top + 6} r={7} fill={ink} />
          </G>
        );
      })}
    </Svg>
  );
}

// Хоосон төлөвийн "сүнс" — дээш доош хөвнө.
export function Ghost({ size = 64 }: { size?: number }) {
  const y = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(y, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(y, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [y]);
  return (
    <Animated.View style={{ transform: [{ translateY: y.interpolate({ inputRange: [0, 1], outputRange: [0, -6] }) }] }}>
      <Svg width={size} height={size * 1.15} viewBox="0 0 64 74">
        <Defs>
          <LinearGradient id="ghost" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.95" />
            <Stop offset="1" stopColor="#C4B5FD" stopOpacity="0.75" />
          </LinearGradient>
        </Defs>
        <Ellipse cx="32" cy="70" rx="18" ry="3.5" fill="#000000" opacity={0.25} />
        <Path
          d="M10 34 C10 18 20 6 32 6 C44 6 54 18 54 34 L54 60 L47 54 L40 61 L32 54 L24 61 L17 54 L10 60 Z"
          fill="url(#ghost)"
        />
        <Ellipse cx="25" cy="31" rx="3.2" ry="4.2" fill="#2A2350" />
        <Ellipse cx="39" cy="31" rx="3.2" ry="4.2" fill="#2A2350" />
        <Ellipse cx="32" cy="41" rx="3" ry="2.2" fill="#2A2350" />
      </Svg>
    </Animated.View>
  );
}

// Удаан хөвөх гэрлийн бөмбөлөг (карт дотор амьд мэдрэмж өгнө).
export function DriftingOrb({
  size = 140,
  color = '#FF8A3D',
  opacity = 0.35,
  style,
}: {
  size?: number;
  color?: string;
  opacity?: number;
  style?: object;
}) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 4200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 4200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  const id = `orb${color.replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        { position: 'absolute', width: size, height: size },
        style,
        {
          transform: [
            { translateX: v.interpolate({ inputRange: [0, 1], outputRange: [0, -24] }) },
            { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, 14] }) },
            { scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.15] }) },
          ],
        },
      ]}
    >
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={color} stopOpacity={opacity} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
}
