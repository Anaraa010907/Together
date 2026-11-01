import { useState } from 'react';
import { Alert } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Body, Button, Field, H1, Screen } from '../components/ui';
import { verifyPhoneOtp } from '../lib/auth';

// 6 оронтой SMS код. Амжилттай бол AuthGate өөрөө чиглүүлнэ.
export default function Otp() {
  const { t: tr } = useTranslation();
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onVerify = async () => {
    if (!/^\d{6}$/.test(code)) return setError(tr('otp.invalid'));
    setError(null);
    setBusy(true);
    try {
      await verifyPhoneOtp(String(phone), code);
    } catch (e: any) {
      Alert.alert(tr('common.error'), String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <H1>{tr('otp.title')}</H1>
      <Body muted>{tr('otp.sentTo', { phone })}</Body>
      <Field
        label={tr('otp.title')}
        value={code}
        onChangeText={(v) => setCode(v.replace(/\D/g, ''))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={6}
        placeholder="000000"
        style={{ fontSize: 24, letterSpacing: 8, textAlign: 'center' }}
        error={error}
      />
      <Button label={tr('otp.verify')} onPress={onVerify} loading={busy} />
    </Screen>
  );
}
