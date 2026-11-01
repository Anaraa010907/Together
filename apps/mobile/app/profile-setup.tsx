import { useState } from 'react';
import { Alert, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Body, Button, Caption, Field, H1, Screen, Segmented, Steps } from '../components/ui';
import { useSession } from '../lib/session';
import { isUsernameTaken, saveProfile, USERNAME_PATTERN } from '../lib/profile';
import { declareAge } from '../lib/teaching';

// Нэвтэрсний дараа нэг удаа: нэр, хэрэглэгчийн нэр, насны бүлэг (18+ эсэх). Төрсөн огноо хадгалахгүй.
// Өмнөх оролдлого хагас дууссан бол (профайл үүссэн, нас хадгалагдаагүй) дахин дарахад үргэлжилнэ.
export default function ProfileSetup() {
  const { t: tr, i18n } = useTranslation();
  const router = useRouter();
  const { refreshProfile } = useSession();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [adult, setAdult] = useState<boolean | null>(null);
  const [errors, setErrors] = useState<{ name?: string; username?: string; age?: string }>({});
  const [busy, setBusy] = useState(false);

  const onSave = async () => {
    const u = username.trim().toLowerCase();
    const name = displayName.trim();
    const next: typeof errors = {};
    if (name.length < 1 || name.length > 40) next.name = tr('profile.nameInvalid');
    if (!USERNAME_PATTERN.test(u)) next.username = tr('profile.usernameInvalid');
    if (adult === null) next.age = tr('age.required');
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    try {
      if (await isUsernameTaken(u)) {
        setErrors({ username: tr('profile.usernameTaken') });
        return;
      }
      await saveProfile({ username: u, displayName: name, locale: i18n.language === 'en' ? 'en' : 'mn' });

      // Нас нэг удаа л хадгалагдана. Аль хэдийн хадгалсан бол алгасна; бусад алдаа
      // профайлын үүсгэлтийг зогсоохгүй (сургалтад нэгдэх үед дахин асууна).
      try {
        await declareAge(adult!);
      } catch (e: any) {
        if (!String(e?.message ?? e).includes('age_already_declared')) console.warn('declare_age failed', e);
      }

      await refreshProfile();
      router.replace('/home' as never);
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (msg.includes('username_taken')) setErrors({ username: tr('profile.usernameTaken') });
      else Alert.alert(tr('common.error'), msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Steps total={2} current={2} />
      <H1>{tr('profile.title')}</H1>
      <Body muted>{tr('profile.subtitle')}</Body>

      <View style={{ gap: 16, marginTop: 8 }}>
        <Field
          label={tr('profile.displayName')}
          value={displayName}
          onChangeText={setDisplayName}
          maxLength={40}
          autoComplete="name"
          error={errors.name}
        />
        <Field
          label={tr('profile.username')}
          prefix="@"
          value={username}
          onChangeText={(v) => setUsername(v.toLowerCase())}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={20}
          placeholder="your_name"
          error={errors.username}
          hint={tr('profile.usernameHint')}
        />
        <View style={{ gap: 8 }}>
          <Body>{tr('age.title')}</Body>
          <Segmented
            options={[
              { value: true, label: tr('age.adult') },
              { value: false, label: tr('age.minor') },
            ]}
            value={adult}
            onChange={setAdult}
          />
          <Caption>{errors.age ?? tr('age.hint')}</Caption>
        </View>
      </View>

      <View style={{ marginTop: 8 }}>
        <Button label={tr('profile.save')} onPress={onSave} loading={busy} />
      </View>
    </Screen>
  );
}
