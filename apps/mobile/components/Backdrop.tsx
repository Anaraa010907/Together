import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

// Дэлгэцийн арын зөөлөн гэрэл: баруун дээд буланд улбар шар/ягаан, зүүн доод буланд нил ягаан.
export function Backdrop() {
  const { width, height } = useWindowDimensions();
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width={width} height={height}>
        <Defs>
          <RadialGradient id="glowTop" cx="100%" cy="0%" rx="75%" ry="40%">
            <Stop offset="0" stopColor="#FF8A3D" stopOpacity="0.28" />
            <Stop offset="0.45" stopColor="#EC4899" stopOpacity="0.12" />
            <Stop offset="1" stopColor="#0C0A1C" stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="glowBottom" cx="0%" cy="85%" rx="80%" ry="45%">
            <Stop offset="0" stopColor="#7C3AED" stopOpacity="0.30" />
            <Stop offset="1" stopColor="#0C0A1C" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width={width} height={height} fill="url(#glowTop)" />
        <Rect x="0" y="0" width={width} height={height} fill="url(#glowBottom)" />
      </Svg>
    </View>
  );
}
