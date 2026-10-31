import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { useTranslation } from 'react-i18next';
import { lightTheme as t, radius, space } from '@together/ui/tokens';
import { signInWithApple, signInWithGoogle, sendPhoneOtp, toMongolianE164, isValidMongolianMobile } from '../lib/auth';

WebBrowser.maybeCompleteAuthSession();

export default function Login() {
  const { t: tr } = useTranslation();
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);

  const [, googleResponse, promptGoogle] = Google.useIdTokenAuthRequest({
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID,
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB,
  });

  useEffect(() => {
    if (googleResponse?.type !== 'success') return;
    const idToken = googleResponse.params.id_token;
    if (!idToken) return;
    setBusy(true);
    signInWithGoogle(idToken)
      .catch((e) => Alert.alert(tr('common.error'), String(e.message ?? e)))
      .finally(() => setBusy(false));
  }, [googleResponse, tr]);

  const onApple = async () => {
    setBusy(true);
    try {
      await signInWithApple();
    } catch (e: any) {
      if (e?.code !== 'ERR_REQUEST_CANCELED') Alert.alert(tr('common.error'), String(e.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const onPhone = async () => {
    if (!isValidMongolianMobile(phone)) {
      Alert.alert(tr('common.error'), tr('login.phoneInvalid'));
      return;
    }
    const e164 = toMongolianE164(phone);
    setBusy(true);
    try {
      await sendPhoneOtp(e164);
      router.push({ pathname: '/otp', params: { phone: e164 } } as never);
    } catch (e: any) {
      Alert.alert(tr('common.error'), String(e.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: t.background }]}>
      <Text style={[styles.title, { color: t.text }]}>{tr('login.title')}</Text>

      <Pressable
        style={[styles.social, { borderColor: t.border, backgroundColor: t.surface }]}
        disabled={busy}
        onPress={() => promptGoogle()}
        accessibilityRole="button"
      >
        <Text style={[styles.socialText, { color: t.text }]}>{tr('login.google')}</Text>
      </Pressable>

      {Platform.OS === 'ios' && (
        <Pressable
          style={[styles.social, { borderColor: t.border, backgroundColor: t.text }]}
          disabled={busy}
          onPress={onApple}
          accessibilityRole="button"
        >
          <Text style={[styles.socialText, { color: t.background }]}>{tr('login.apple')}</Text>
        </Pressable>
      )}

      <View style={styles.divider}>
        <View style={[styles.line, { backgroundColor: t.border }]} />
        <Text style={[styles.or, { color: t.textMuted }]}>{tr('login.or')}</Text>
        <View style={[styles.line, { backgroundColor: t.border }]} />
      </View>

      <Text style={[styles.label, { color: t.textMuted }]}>{tr('login.phoneLabel')}</Text>
      <View style={styles.phoneRow}>
        <View style={[styles.prefix, { borderColor: t.border, backgroundColor: t.surface }]}>
          <Text style={{ color: t.text }}>+976</Text>
        </View>
        <TextInput
          style={[styles.input, { borderColor: t.border, backgroundColor: t.surface, color: t.text }]}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          maxLength={12}
          placeholder="9900 0000"
          placeholderTextColor={t.textMuted}
          accessibilityLabel={tr('login.phoneLabel')}
        />
      </View>

      <Pressable
        style={[styles.primary, { backgroundColor: t.accent, opacity: busy ? 0.6 : 1 }]}
        disabled={busy}
        onPress={onPhone}
        accessibilityRole="button"
      >
        {busy ? (
          <ActivityIndicator color={t.onAccent} />
        ) : (
          <Text style={[styles.primaryText, { color: t.onAccent }]}>{tr('login.sendCode')}</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: space.lg, gap: space.md, justifyContent: 'center' },
  title: { fontSize: 28, fontWeight: '700', marginBottom: space.md },
  social: { borderRadius: radius.pill, borderWidth: 1, paddingVertical: 14, alignItems: 'center' },
  socialText: { fontSize: 16, fontWeight: '600' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginVertical: space.sm },
  line: { flex: 1, height: 1 },
  or: { fontSize: 13 },
  label: { fontSize: 13 },
  phoneRow: { flexDirection: 'row', gap: space.sm },
  prefix: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md, justifyContent: 'center' },
  input: { flex: 1, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: 12, fontSize: 16 },
  primary: { borderRadius: radius.pill, paddingVertical: 16, alignItems: 'center', marginTop: space.sm },
  primaryText: { fontSize: 16, fontWeight: '600' },
});
