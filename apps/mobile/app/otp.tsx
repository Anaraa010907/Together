import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { lightTheme as t, radius, space } from '@together/ui/tokens';
import { verifyPhoneOtp } from '../lib/auth';

// 6 оронтой SMS код. Амжилттай бол AuthGate өөрөө чиглүүлнэ.
export default function Otp() {
  const { t: tr } = useTranslation();
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const onVerify = async () => {
    if (!/^\d{6}$/.test(code)) {
      Alert.alert(tr('common.error'), tr('otp.invalid'));
      return;
    }
    setBusy(true);
    try {
      await verifyPhoneOtp(String(phone), code);
    } catch (e: any) {
      Alert.alert(tr('common.error'), String(e.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: t.background }]}>
      <Text style={[styles.title, { color: t.text }]}>{tr('otp.title')}</Text>
      <Text style={[styles.subtitle, { color: t.textMuted }]}>
        {tr('otp.sentTo', { phone })}
      </Text>

      <TextInput
        style={[styles.input, { borderColor: t.border, backgroundColor: t.surface, color: t.text }]}
        value={code}
        onChangeText={(v) => setCode(v.replace(/\D/g, ''))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={6}
        placeholder="000000"
        placeholderTextColor={t.textMuted}
        accessibilityLabel={tr('otp.title')}
      />

      <Pressable
        style={[styles.primary, { backgroundColor: t.accent, opacity: busy ? 0.6 : 1 }]}
        disabled={busy}
        onPress={onVerify}
        accessibilityRole="button"
      >
        {busy ? (
          <ActivityIndicator color={t.onAccent} />
        ) : (
          <Text style={[styles.primaryText, { color: t.onAccent }]}>{tr('otp.verify')}</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: space.lg, gap: space.md, justifyContent: 'center' },
  title: { fontSize: 28, fontWeight: '700' },
  subtitle: { fontSize: 15, lineHeight: 21, marginBottom: space.md },
  input: {
    borderWidth: 1, borderRadius: radius.md, paddingVertical: 14,
    fontSize: 24, textAlign: 'center', letterSpacing: 8,
  },
  primary: { borderRadius: radius.pill, paddingVertical: 16, alignItems: 'center', marginTop: space.sm },
  primaryText: { fontSize: 16, fontWeight: '600' },
});
