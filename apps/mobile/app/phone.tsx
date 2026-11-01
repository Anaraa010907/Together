import { useState } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Body, Button, Field, H1, Screen } from '../components/ui';
import { isValidMongolianMobile, sendPhoneOtp, toMongolianE164 } from '../lib/auth';

// Утасны дугаараар нэвтрэх / бүртгүүлэх (SMS код). SMS provider тохируулсан байх ёстой.
export default function Phone() {
  const { t: tr } = useTranslation();
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSend = async () => {
    if (!isValidMongolianMobile(phone)) return setError(tr('login.phoneInvalid'));
    setError(null);
    const e164 = toMongolianE164(phone);
    setBusy(true);
    try {
      await sendPhoneOtp(e164);
      router.push({ pathname: '/otp', params: { phone: e164 } } as never);
    } catch (e: any) {
      Alert.alert(tr('common.error'), String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <H1>{tr('login.withPhone')}</H1>
      <Body muted>{tr('login.phoneSubtitle')}</Body>
      <Field
        label={tr('login.phoneLabel')}
        prefix="+976"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        maxLength={12}
        placeholder="9900 0000"
        error={error}
      />
      <Button label={tr('login.sendCode')} onPress={onSend} loading={busy} />
    </Screen>
  );
}
