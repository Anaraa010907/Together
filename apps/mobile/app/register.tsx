import { useState } from 'react';
import { Alert, Platform, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { font, lightTheme as t } from '@together/ui/tokens';
import { Body, Button, Divider, Field, H1, Screen, TextLink } from '../components/ui';
import { EMAIL_PATTERN, passwordStrength, signUpWithEmail } from '../lib/auth';

// Бүртгүүлэх: имэйл, нууц үг, нууц үгээ давтах.
export default function Register() {
  const { t: tr } = useTranslation();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string; confirm?: string }>({});
  const [busy, setBusy] = useState(false);

  const strength = passwordStrength(password);
  const strengthLabel = [tr('register.weak'), tr('register.ok'), tr('register.strong')][strength];
  const strengthColor = [t.warning, t.accent, t.success][strength];

  const onSubmit = async () => {
    const e = email.trim().toLowerCase();
    const next: typeof errors = {};
    if (!EMAIL_PATTERN.test(e)) next.email = tr('register.emailInvalid');
    if (passwordStrength(password) === 0) next.password = tr('register.passwordRule');
    if (confirm !== password) next.confirm = tr('register.mismatch');
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    try {
      const needsConfirm = await signUpWithEmail(e, password);
      if (needsConfirm) {
        Alert.alert(tr('login.checkEmailTitle'), tr('login.checkEmail'));
        router.replace({ pathname: '/login', params: { email: e } } as never);
      }
      // Баталгаажуулалт шаардахгүй бол сесс шууд үүсч, AuthGate профайл руу чиглүүлнэ.
    } catch (err: any) {
      const msg = String(err?.message ?? err);
      Alert.alert(tr('common.error'), /already registered/i.test(msg) ? tr('register.exists') : msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <H1>{tr('register.title')}</H1>
      <Body muted>{tr('register.subtitle')}</Body>

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
          error={errors.email}
        />
        <View style={{ gap: 6 }}>
          <Field
            label={tr('register.password')}
            value={password}
            onChangeText={setPassword}
            secureToggle
            autoCapitalize="none"
            autoComplete={Platform.OS === 'android' ? 'password-new' : 'new-password'}
            textContentType="newPassword"
            placeholder="••••••••"
            error={errors.password}
            hint={tr('register.passwordRule')}
          />
          {password.length > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ flex: 1, flexDirection: 'row', gap: 4 }}>
                {[0, 1, 2].map((i) => (
                  <View
                    key={i}
                    style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= strength ? strengthColor : '#E3DDCF' }}
                  />
                ))}
              </View>
              <Text style={{ fontFamily: font.semibold, fontSize: 12, color: strengthColor }}>{strengthLabel}</Text>
            </View>
          )}
        </View>
        <Field
          label={tr('register.confirm')}
          value={confirm}
          onChangeText={setConfirm}
          secureToggle
          autoCapitalize="none"
          textContentType="newPassword"
          placeholder="••••••••"
          error={errors.confirm}
        />
      </View>

      <Text style={styles.terms}>
        {tr('register.agree1')}
        <Text style={styles.termsLink} onPress={() => router.push('/legal/terms' as never)}>
          {tr('legal.terms.title')}
        </Text>
        {tr('register.agree2')}
        <Text style={styles.termsLink} onPress={() => router.push('/legal/privacy' as never)}>
          {tr('legal.privacy.title')}
        </Text>
        {tr('register.agree3')}
      </Text>

      <View style={{ marginTop: 4 }}>
        <Button label={tr('register.submit')} onPress={onSubmit} loading={busy} />
      </View>

      <Divider label={tr('login.or')} />
      <Button label={tr('login.withPhone')} variant="secondary" icon="call-outline" onPress={() => router.push('/phone' as never)} />

      <TextLink label={tr('register.haveAccount')} strong={tr('welcome.login')} onPress={() => router.replace('/login' as never)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  terms: { fontFamily: font.medium, fontSize: 13, lineHeight: 19, color: '#5B6573' },
  termsLink: { fontFamily: font.bold, color: t.text, textDecorationLine: 'underline' },
});
