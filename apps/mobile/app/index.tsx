import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { font, lightTheme as t, palette } from '@together/ui/tokens';
import { Body, Button, Screen } from '../components/ui';

// Welcome: хамтдаа өсөхийг илэрхийлсэн давхцсан тойргууд + үйлдлүүд.
export default function Welcome() {
  const { t: tr } = useTranslation();
  const router = useRouter();

  return (
    <Screen center>
      <View style={styles.art} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={[styles.circle, { backgroundColor: palette.midnightNavy, left: 40, top: 40 }]} />
        <View style={[styles.circle, { backgroundColor: palette.champagneGold, left: 110, top: 10, opacity: 0.92 }]} />
        <View style={[styles.circle, { backgroundColor: palette.sageGreen, left: 80, top: 95, opacity: 0.85 }]} />
        <View style={[styles.dot, { left: 168, top: 76 }]} />
      </View>

      <Text style={styles.wordmark}>TOGETHER</Text>
      <Text style={styles.tagline}>{tr('welcome.title')}</Text>
      <Body muted>{tr('welcome.subtitle')}</Body>

      <View style={{ gap: 12, marginTop: 28 }}>
        <Button label={tr('welcome.register')} onPress={() => router.push('/register' as never)} />
        <Button label={tr('welcome.login')} variant="secondary" onPress={() => router.push('/login' as never)} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  art: { height: 210, width: 280, alignSelf: 'center', marginBottom: 24 },
  circle: { position: 'absolute', width: 120, height: 120, borderRadius: 60 },
  dot: { position: 'absolute', width: 18, height: 18, borderRadius: 9, backgroundColor: palette.warmIvory },
  wordmark: { fontFamily: font.extrabold, fontSize: 36, letterSpacing: 4, color: t.text },
  tagline: { fontFamily: font.bold, fontSize: 22, color: t.text, marginTop: 4 },
});
