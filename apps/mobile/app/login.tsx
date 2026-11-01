import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { useTranslation } from 'react-i18next';
import { lightTheme as t, radius, space } from '@together/ui/tokens';
import {
  isValidMongolianMobile,
  sendPhoneOtp,
  signInWithApple,
  signInWithEmail,
  signInWithGoogle,
  signUpWithEmail,
  toMongolianE164,
} from '../lib/auth';

WebBrowser.maybeCompleteAuthSession();

// Тухайн платформын Google client ID байгаа үед л Google товч гарна
// (байхгүй үед expo-auth-session hook алдаа шиддэг).
const GOOGLE_IDS = {
  iosClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS,
  androidClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID,
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB,
};
const googleConfigured = !!(Platform.OS === 'ios'
  ? GOOGLE_IDS.iosClientId
  : Platform.OS === 'android'
    ? GOOGLE_IDS.androidClientId
    : GOOGLE_IDS.webClientId);

// Туршилтын build-д л (EXPO_PUBLIC_ENABLE_EMAIL_LOGIN=1) имэйл + нууц үгээр нэвтрэнэ.
const emailLoginEnabled = process.env.EXPO_PUBLIC_ENABLE_EMAIL_LOGIN === '1';

export default function Login() {
  const { t: tr } = useTranslation();
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);

  const fail = (e: any) => Alert.alert(tr('common.error'), String(e?.message ?? e));

  const onApple = async () => {
    setBusy(true);
    try {
      await signInWithApple();
    } catch (e: any) {
      if (e?.code !== 'ERR_REQUEST_CANCELED') fail(e);
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
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={{ backgroundColor: t.background }} contentContainerStyle={styles.screen}>
      <Text style={[styles.title, { color: t.text }]}>{tr('login.title')}</Text>

      {googleConfigured && <GoogleButton busy={busy} setBusy={setBusy} onError={fail} />}

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

      {(googleConfigured || Platform.OS === 'ios') && <Divider label={tr('login.or')} />}

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

      {emailLoginEnabled && <EmailLogin busy={busy} setBusy={setBusy} onError={fail} />}
    </ScrollView>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <View style={styles.divider}>
      <View style={[styles.line, { backgroundColor: t.border }]} />
      <Text style={[styles.or, { color: t.textMuted }]}>{label}</Text>
      <View style={[styles.line, { backgroundColor: t.border }]} />
    </View>
  );
}

type PartProps = { busy: boolean; setBusy: (b: boolean) => void; onError: (e: any) => void };

function GoogleButton({ busy, setBusy, onError }: PartProps) {
  const { t: tr } = useTranslation();
  const [, response, prompt] = Google.useIdTokenAuthRequest(GOOGLE_IDS);

  useEffect(() => {
    if (response?.type !== 'success') return;
    const idToken = response.params.id_token;
    if (!idToken) return;
    setBusy(true);
    signInWithGoogle(idToken)
      .catch(onError)
      .finally(() => setBusy(false));
  }, [response]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Pressable
      style={[styles.social, { borderColor: t.border, backgroundColor: t.surface }]}
      disabled={busy}
      onPress={() => prompt()}
      accessibilityRole="button"
    >
      <Text style={[styles.socialText, { color: t.text }]}>{tr('login.google')}</Text>
    </Pressable>
  );
}

function EmailLogin({ busy, setBusy, onError }: PartProps) {
  const { t: tr } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const run = async (signUp: boolean) => {
    const e = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(e) || password.length < 6) {
      Alert.alert(tr('common.error'), tr('login.emailInvalid'));
      return;
    }
    setBusy(true);
    try {
      if (signUp) {
        const needsConfirm = await signUpWithEmail(e, password);
        if (needsConfirm) Alert.alert(tr('login.checkEmailTitle'), tr('login.checkEmail'));
      } else {
        await signInWithEmail(e, password);
      }
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: space.sm, marginTop: space.lg }}>
      <Divider label={tr('login.emailTest')} />
      <TextInput
        style={[styles.input, { flex: 0, borderColor: t.border, backgroundColor: t.surface, color: t.text }]}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        placeholder="email@example.com"
        placeholderTextColor={t.textMuted}
        accessibilityLabel="Email"
      />
      <TextInput
        style={[styles.input, { flex: 0, borderColor: t.border, backgroundColor: t.surface, color: t.text }]}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        placeholder={tr('login.password')}
        placeholderTextColor={t.textMuted}
        accessibilityLabel={tr('login.password')}
      />
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Pressable
          style={[styles.half, { backgroundColor: t.text, opacity: busy ? 0.6 : 1 }]}
          disabled={busy}
          onPress={() => run(false)}
          accessibilityRole="button"
        >
          <Text style={{ color: t.background, fontWeight: '600' }}>{tr('login.emailSignIn')}</Text>
        </Pressable>
        <Pressable
          style={[styles.half, { borderWidth: 1, borderColor: t.border, opacity: busy ? 0.6 : 1 }]}
          disabled={busy}
          onPress={() => run(true)}
          accessibilityRole="button"
        >
          <Text style={{ color: t.text, fontWeight: '600' }}>{tr('login.emailSignUp')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flexGrow: 1, padding: space.lg, gap: space.md, justifyContent: 'center', paddingTop: 80 },
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
  half: { flex: 1, borderRadius: radius.pill, paddingVertical: 14, alignItems: 'center' },
});
