import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { lightTheme as t, radius, space } from '@together/ui/tokens';
import { signOut } from '../lib/auth';

// Түр placeholder: Home модуль (Dashboard, Daily Goals) дараагийн алхамд.
export default function Home() {
  const { t: tr } = useTranslation();
  return (
    <View style={[styles.screen, { backgroundColor: t.background }]}>
      <Text style={[styles.title, { color: t.text }]}>{tr('home.placeholder')}</Text>
      <Pressable
        style={[styles.secondary, { borderColor: t.border }]}
        onPress={() => signOut().catch(() => {})}
        accessibilityRole="button"
      >
        <Text style={[styles.secondaryText, { color: t.text }]}>{tr('home.logout')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: space.lg, justifyContent: 'center', alignItems: 'center', gap: space.lg },
  title: { fontSize: 22, fontWeight: '600', textAlign: 'center' },
  secondary: { borderRadius: radius.pill, borderWidth: 1, paddingVertical: 14, paddingHorizontal: space.xl },
  secondaryText: { fontSize: 15, fontWeight: '600' },
});
