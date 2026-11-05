import { ActivityIndicator, StyleSheet, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { font, gradients, lightTheme as t, radius } from '@together/ui/tokens';
import { PressableScale } from './motion';

// Дагах / Дагаж байна товч.
export function FollowButton({ following, busy, onPress, small }: { following: boolean; busy?: boolean; onPress: () => void; small?: boolean }) {
  const { t: tr } = useTranslation();
  const h = small ? 32 : 46;
  if (following) {
    return (
      <PressableScale onPress={onPress} disabled={busy} accessibilityRole="button" style={[styles.followOff, { height: h }]}>
        {busy ? <ActivityIndicator size="small" color={t.text} /> : <Text style={[styles.followText, small && { fontSize: 12 }]}>{tr('social.following')}</Text>}
      </PressableScale>
    );
  }
  return (
    <PressableScale onPress={onPress} disabled={busy} accessibilityRole="button">
      <LinearGradient colors={gradients.violet} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.followOn, { height: h }]}>
        {busy ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={[styles.followText, small && { fontSize: 12 }]}>{tr('social.follow')}</Text>}
      </LinearGradient>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  followOn: { borderRadius: radius.pill, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', minWidth: 84 },
  followOff: {
    borderRadius: radius.pill, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', minWidth: 84,
    borderWidth: 1, borderColor: t.border, backgroundColor: 'rgba(255,255,255,0.06)',
  },
  followText: { fontFamily: font.bold, fontSize: 14, color: '#FFFFFF' },
});
