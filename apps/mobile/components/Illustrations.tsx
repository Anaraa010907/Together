import { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, Line, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg';

// "Хамтдаа хөгжие" баннерын зураг: жаргах нар, толгод, гараа өргөсөн хүмүүсийн дүрс.
export function TogetherArt({ width = 170, height = 124 }: { width?: number; height?: number }) {
  const figures = [
    { x: 30, h: 50 },
    { x: 58, h: 62 },
    { x: 88, h: 70 },
    { x: 118, h: 60 },
    { x: 145, h: 52 },
  ];
  return (
    <Svg width={width} height={height} viewBox="0 0 170 124">
      <Defs>
        <RadialGradient id="sun" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#FFE3B3" stopOpacity="1" />
          <Stop offset="0.6" stopColor="#FFB36B" stopOpacity="0.85" />
          <Stop offset="1" stopColor="#FF8A3D" stopOpacity="0" />
        </RadialGradient>
        <LinearGradient id="hill" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#2A1450" stopOpacity="0.9" />
          <Stop offset="1" stopColor="#140A2A" stopOpacity="1" />
        </LinearGradient>
      </Defs>
      <Circle cx="96" cy="70" r="44" fill="url(#sun)" />
      <Path d="M0 104 Q 42 88 86 100 T 170 96 L170 124 L0 124 Z" fill="url(#hill)" />
      <G fill="#160B2C" stroke="#160B2C" strokeLinecap="round">
        {figures.map(({ x, h }, i) => {
          const top = 124 - h;
          const shoulder = top + 14;
          return (
            <G key={i}>
              <Circle cx={x} cy={top + 6} r={6.5} strokeWidth={0} />
              <Path d={`M${x - 8} 124 L${x - 7} ${shoulder} Q${x} ${shoulder - 5} ${x + 7} ${shoulder} L${x + 8} 124 Z`} strokeWidth={0} />
              <Line x1={x - 5} y1={shoulder + 2} x2={x - 15 + (i % 2) * 2} y2={top - 14} strokeWidth={4.5} />
              <Line x1={x + 5} y1={shoulder + 2} x2={x + 15 - (i % 2) * 2} y2={top - 14} strokeWidth={4.5} />
            </G>
          );
        })}
      </G>
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
