import { useEffect, useRef, useState } from 'react';
import { Alert, Platform, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { useTranslation } from 'react-i18next';
import { font, lightTheme as t, palette } from '@together/ui/tokens';
import { Body, Button, Divider, Field, H1, Screen, TextLink } from '../components/ui';
import { EMAIL_PATTERN, resetPassword, signInWithApple, signInWithEmail, signInWithGoogle } from '../lib/auth';
import {
  authenticate,
  biometricEmail,
  biometricSupport,
  disableBiometric,
  enableBiometric,
  getLastEmail,
  getRemember,
  markBiometricOffered,
  setRemember as saveRemember,
  unlockCredentials,
  wasBiometricOffered,
  type BiometricKind,
} from '../lib/biometric';

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
  const [remember, setRemember] = useState(true);
  const [bioKind, setBioKind] = useState<BiometricKind | null>(null);
  const [bioEmail, setBioEmail] = useState<string | null>(null);
  const autoPrompted = useRef(false);

  const fail = (e: any) => {
    const msg = String(e?.message ?? e);
    const key = /invalid login credentials/i.test(msg)
      ? 'login.wrongCredentials'
      : /email not confirmed/i.test(msg)
        ? 'login.notConfirmed'
        : null;
    Alert.alert(tr('common.error'), key ? tr(key) : msg);
  };

  // Хадгалсан имэйл, "Намайг сана", хурууны хээний төлөвийг ачаална.
  useEffect(() => {
    (async () => {
      const [r, last, kind, bio] = await Promise.all([getRemember(), getLastEmail(), biometricSupport(), biometricEmail()]);
      setRemember(r);
      if (!params.email && last) setEmail((cur) => cur || last);
      setBioKind(kind);
      setBioEmail(kind ? bio : null);
      // Хурууны хээ холбогдсон бол дэлгэц нээгдэхэд шууд асууна (нэг удаа).
      if (kind && bio && !params.email && !autoPrompted.current) {
        autoPrompted.current = true;
        setTimeout(() => onBiometric(), 350);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bioLabel = bioKind === 'face' ? tr('bio.face') : tr('bio.fingerprint');

  const onBiometric = async () => {
    if (busy) return;
    const creds = await unlockCredentials(tr('bio.prompt'));
    if (!creds) return;
    setBusy(true);
    try {
      await signInWithEmail(creds.email, creds.password);
      await saveRemember(true, creds.email);
    } catch (err: any) {
      if (/invalid login credentials/i.test(String(err?.message ?? err))) {
        // Нууц үг солигдсон: хадгалсныг устгаж, нууц үгээр нэвтрэхийг хүснэ.
        await disableBiometric();
        setBioEmail(null);
        setEmail(creds.email);
        Alert.alert(tr('bio.expiredTitle'), tr('bio.expired'));
      } else {
        fail(err);
      }
    } finally {
      setBusy(false);
    }
  };

  // Нууц үгээр амжилттай нэвтэрсний дараа хурууны хээг санал болгоно.
  const afterPasswordLogin = async (e: string, pw: string) => {
    await saveRemember(remember, e);
    if (!bioKind) return;
    if (bioEmail === e) {
      await enableBiometric(e, pw).catch(() => {}); // нууц үг солигдсон байж магадгүй — шинэчилнэ
      return;
    }
    if (!remember || (await wasBiometricOffered())) return;
    Alert.alert(tr('bio.offerTitle', { method: bioLabel }), tr('bio.offerBody', { method: bioLabel }), [
      { text: tr('bio.later'), style: 'cancel', onPress: () => markBiometricOffered() },
      {
        text: tr('bio.enable'),
        onPress: async () => {
          await markBiometricOffered();
          if (await authenticate(tr('bio.confirmPrompt'))) await enableBiometric(e, pw).catch(() => {});
        },
      },
    ]);
  };

  const onLogin = async () => {
    const e = email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(e) || !password) return Alert.alert(tr('common.error'), tr('login.emailInvalid'));
    setBusy(true);
    let ok = false;
    try {
      await signInWithEmail(e, password);
      ok = true;
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
    if (ok) await afterPasswordLogin(e, password);
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
    <Screen underHeader>
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
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Pressable
            onPress={() => setRemember((v) => !v)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: remember }}
            hitSlop={8}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
          >
            <View
              style={{
                width: 22,
                height: 22,
                borderRadius: 7,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1.5,
                borderColor: remember ? palette.violet : t.border,
                backgroundColor: remember ? palette.violet : 'transparent',
              }}
            >
              {remember && <Ionicons name="checkmark" size={15} color="#FFFFFF" />}
            </View>
            <Text style={{ fontFamily: font.semibold, color: t.text, fontSize: 14 }}>{tr('login.remember')}</Text>
          </Pressable>
          <Pressable onPress={onForgot} accessibilityRole="button" hitSlop={8}>
            <Text style={{ fontFamily: font.semibold, color: t.text, fontSize: 14 }}>{tr('login.forgot')}</Text>
          </Pressable>
        </View>
      </View>

      <Button label={tr('login.title')} onPress={onLogin} loading={busy} />
      {bioKind && bioEmail ? (
        <Button
          label={bioLabel}
          variant="secondary"
          icon={bioKind === 'face' ? 'scan-outline' : 'finger-print'}
          onPress={onBiometric}
          disabled={busy}
        />
      ) : null}

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
