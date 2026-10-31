import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { lightTheme as t, radius, space } from '@together/ui/tokens';

// Welcome дэлгэц (Authentication модуль). Бодит auth-ыг дараагийн алхамд холбоно.
export default function Welcome() {
  const { t: tr } = useTranslation();
  return (
    <View style={[styles.screen, { backgroundColor: t.background }]}>
      <Text style={[styles.title, { color: t.text }]}>{tr('welcome.title')}</Text>
      <Text style={[styles.subtitle, { color: t.textMuted }]}>{tr('welcome.subtitle')}</Text>

      <Pressable style={[styles.primary, { backgroundColor: t.accent }]} accessibilityRole="button">
        <Text style={[styles.primaryText, { color: t.onAccent }]}>{tr('welcome.login')}</Text>
      </Pressable>
      <Pressable style={[styles.secondary, { borderColor: t.border }]} accessibilityRole="button">
        <Text style={[styles.secondaryText, { color: t.text }]}>{tr('welcome.register')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', padding: space.lg, gap: space.md },
  title: { fontSize: 32, fontWeight: '700' },
  subtitle: { fontSize: 16, lineHeight: 22, marginBottom: space.lg },
  primary: { borderRadius: radius.pill, paddingVertical: 16, alignItems: 'center' },
  primaryText: { fontSize: 16, fontWeight: '600' },
  secondary: { borderRadius: radius.pill, paddingVertical: 16, alignItems: 'center', borderWidth: 1 },
  secondaryText: { fontSize: 16, fontWeight: '600' },
});
