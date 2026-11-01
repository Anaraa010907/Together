import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { useTranslation } from 'react-i18next';
import { font, lightTheme as t } from '@together/ui/tokens';
import { Body, Button, Divider, Field, H1, Screen, TextLink } from '../components/ui';
import { EMAIL_PATTERN, resetPassword, signInWithApple, signInWithEmail, signInWithGoogle } from '../lib/auth';

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

// Нэвтрэх: имэйл + нууц үг; эсвэл утас, Google, Apple.
export default function Login() {
  const { t: tr } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(params.email ? String(params.email) : '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const fail = (e: any) => {
    const msg = String(e?.message ?? e);
    const key = /invalid login credentials/i.test(msg)
      ? 'login.wrongCredentials'
      : /email not confirmed/i.test(msg)
        ? 'login.notConfirmed'
        : null;
    Alert.alert(tr('common.error'), key ? tr(key) : msg);
  };

  const onLogin = async () => {
    const e = email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(e) || !password) return Alert.alert(tr('common.error'), tr('login.emailInvalid'));
    setBusy(true);
    try {
      await signInWithEmail(e, password);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const onForgot = async () => {
    const e = email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(e)) return Alert.alert(tr('common.error'), tr('register.emailInvalid'));
    try {
      await resetPassword(e);
      Alert.alert(tr('login.resetSentTitle'), tr('login.resetSent'));
    } catch (err) {
      fail(err);
    }
  };

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

  return (
    <Screen>
      <H1>{tr('login.title')}</H1>
      <Body muted>{tr('login.subtitle')}</Body>

      <View style={{ gap: 16, marginTop: 8 }}>
        <Field
          label={tr('register.email')}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          autoComplete="email"
          textContentType="emailAddress"
          placeholder="name@example.com"
        />
        <Field
          label={tr('register.password')}
          value={password}
          onChangeText={setPassword}
          secureToggle
          autoCapitalize="none"
          autoComplete="password"
          textContentType="password"
          placeholder="••••••••"
        />
        <Pressable onPress={onForgot} accessibilityRole="button" hitSlop={8} style={{ alignSelf: 'flex-end' }}>
          <Text style={{ fontFamily: font.semibold, color: t.text, fontSize: 14 }}>{tr('login.forgot')}</Text>
        </Pressable>
      </View>

      <Button label={tr('login.title')} onPress={onLogin} loading={busy} />

      <Divider label={tr('login.or')} />
      <Button label={tr('login.withPhone')} variant="secondary" icon="call-outline" onPress={() => router.push('/phone' as never)} />
      {googleConfigured && <GoogleButton busy={busy} setBusy={setBusy} onError={fail} />}
      {Platform.OS === 'ios' && <Button label={tr('login.apple')} variant="dark" icon="logo-apple" onPress={onApple} disabled={busy} />}

      <TextLink label={tr('login.noAccount')} strong={tr('welcome.register')} onPress={() => router.replace('/register' as never)} />
    </Screen>
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

  return <Button label={tr('login.google')} variant="secondary" icon="logo-google" onPress={() => prompt()} disabled={busy} />;
}
