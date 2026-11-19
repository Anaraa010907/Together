import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { font, lightTheme as t } from '@together/ui/tokens';
import { Button, Card, Field, ListRow, Screen, Segmented } from '../components/ui';
import { signInWithEmail, signOut } from '../lib/auth';
import { useSession } from '../lib/session';
import { authenticate, biometricEmail, biometricSupport, disableBiometric, enableBiometric, type BiometricKind } from '../lib/biometric';
import { deleteMyAccount, setLanguage, type Locale } from '../lib/account';
import { isAdmin } from '../lib/social';

// Тохиргоо: хэл, сонирхол, багш, мэдэгдэл, хууль эрх зүй, гарах, бүртгэл устгах.
export default function Settings() {
  const { t: tr, i18n } = useTranslation();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [admin, setAdmin] = useState(false);
  const { session } = useSession();
  const email = session?.user.email ?? null;
  const [bioKind, setBioKind] = useState<BiometricKind | null>(null);
  const [bioOn, setBioOn] = useState(false);
  const [askPw, setAskPw] = useState(false);
  const [pw, setPw] = useState('');
  const [pwBusy, setPwBusy] = useState(false);

  useEffect(() => {
    isAdmin().then(setAdmin).catch(() => setAdmin(false));
    (async () => {
      const [kind, bio] = await Promise.all([biometricSupport(), biometricEmail()]);
      setBioKind(kind);
      setBioOn(!!kind && !!bio && bio === email);
    })();
  }, [email]);

  const bioLabel = bioKind === 'face' ? tr('bio.face') : tr('bio.fingerprint');

  const onBiometric = () => {
    if (bioOn) {
      Alert.alert(tr('bio.disableTitle', { method: bioLabel }), tr('bio.disableBody'), [
        { text: tr('common.cancel'), style: 'cancel' },
        {
          text: tr('bio.disable'),
          style: 'destructive',
          onPress: async () => {
            await disableBiometric();
            setBioOn(false);
          },
        },
      ]);
    } else {
      setPw('');
      setAskPw(true);
    }
  };

  // Нууц үгийг шалгаад (дахин нэвтэрч), хурууны хээгээр баталгаажуулсны дараа хадгална.
  const confirmEnable = async () => {
    if (!email || !pw) return;
    setPwBusy(true);
    try {
      await signInWithEmail(email, pw);
      setAskPw(false);
      if (await authenticate(tr('bio.confirmPrompt'))) {
        await enableBiometric(email, pw);
        setBioOn(true);
      }
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      Alert.alert(tr('common.error'), /invalid login credentials/i.test(msg) ? tr('bio.wrongPassword') : msg);
    } finally {
      setPw('');
      setPwBusy(false);
    }
  };

  const onLanguage = async (locale: Locale) => {
    try {
      await setLanguage(locale);
    } catch (e: any) {
      Alert.alert(tr('common.error'), String(e.message ?? e));
    }
  };

  // Хоёр шатлалт баталгаажуулалт: буцаах боломжгүй үйлдэл.
  const onDelete = () => {
    Alert.alert(tr('settings.deleteTitle'), tr('settings.deleteConfirm'), [
      { text: tr('common.cancel'), style: 'cancel' },
      {
        text: tr('settings.delete'),
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await deleteMyAccount();
          } catch (e: any) {
            Alert.alert(tr('common.error'), String(e.message ?? e));
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  return (
    <Screen style={{ paddingTop: 24 }}>
      <Stack.Screen options={{ title: tr('settings.title') }} />

      <Text style={styles.section}>{tr('settings.language')}</Text>
      <Segmented
        options={[
          { value: 'mn' as Locale, label: tr('settings.mn') },
          { value: 'en' as Locale, label: tr('settings.en') },
        ]}
        value={(i18n.language === 'en' ? 'en' : 'mn') as Locale}
        onChange={onLanguage}
      />

      <Text style={styles.section}>{tr('settings.general')}</Text>
      <Card style={{ paddingVertical: 4 }}>
        <ListRow icon="sparkles-outline" label={tr('interests.edit')} onPress={() => router.push('/interests?edit=1' as never)} />
        <ListRow icon="school-outline" label={tr('teach.title')} onPress={() => router.push('/teach/edit' as never)} />
        <ListRow icon="search-outline" label={tr('search.title')} onPress={() => router.push('/search' as never)} />
        <ListRow icon="key-outline" label={tr('groups.joinByCode')} onPress={() => router.push('/join' as never)} />
        <ListRow icon="chatbubbles-outline" label={tr('chat.title')} onPress={() => router.push('/chats' as never)} />
        {admin && <ListRow icon="shield-checkmark-outline" label={tr('admin.title')} onPress={() => router.push('/admin' as never)} />}
      </Card>

      {bioKind && email ? (
        <>
          <Text style={styles.section}>{tr('bio.section')}</Text>
          <Card style={{ paddingVertical: 4 }}>
            <ListRow
              icon={bioKind === 'face' ? 'scan-outline' : 'finger-print'}
              label={bioLabel}
              value={bioOn ? tr('bio.on') : tr('bio.off')}
              onPress={onBiometric}
            />
          </Card>
        </>
      ) : null}

      <Text style={styles.section}>{tr('legal.section')}</Text>
      <Card style={{ paddingVertical: 4 }}>
        <ListRow icon="document-text-outline" label={tr('legal.terms.title')} onPress={() => router.push('/legal/terms' as never)} />
        <ListRow icon="shield-checkmark-outline" label={tr('legal.privacy.title')} onPress={() => router.push('/legal/privacy' as never)} />
      </Card>

      <Button label={tr('settings.logout')} variant="secondary" icon="log-out-outline" onPress={() => signOut().catch(() => {})} />
      <Pressable onPress={onDelete} disabled={busy} accessibilityRole="button" style={styles.danger}>
        <Text style={styles.dangerText}>{tr('settings.deleteAccount')}</Text>
      </Pressable>

      <Modal visible={askPw} transparent animationType="fade" onRequestClose={() => setAskPw(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{tr('bio.enableTitle', { method: bioLabel })}</Text>
            <Text style={styles.sheetBody}>{tr('bio.enableBody')}</Text>
            <Field
              label={tr('register.password')}
              value={pw}
              onChangeText={setPw}
              secureToggle
              autoCapitalize="none"
              autoComplete="password"
              textContentType="password"
              autoFocus
              onSubmitEditing={confirmEnable}
            />
            <Button label={tr('bio.enable')} icon="finger-print" onPress={confirmEnable} loading={pwBusy} disabled={!pw} />
            <Button label={tr('common.cancel')} variant="ghost" onPress={() => setAskPw(false)} />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { fontFamily: font.bold, fontSize: 15, color: t.textMuted, marginTop: 6 },
  danger: { alignItems: 'center', paddingVertical: 14 },
  dangerText: { fontFamily: font.semibold, fontSize: 14, color: t.warning },
  backdrop: { flex: 1, backgroundColor: 'rgba(5,4,15,0.7)', justifyContent: 'center', padding: 20 },
  sheet: { backgroundColor: '#17142B', borderRadius: 26, padding: 20, gap: 12, borderWidth: 1, borderColor: t.border },
  sheetTitle: { fontFamily: font.extrabold, fontSize: 19, color: t.text },
  sheetBody: { fontFamily: font.medium, fontSize: 14, lineHeight: 20, color: t.textMuted },
});
