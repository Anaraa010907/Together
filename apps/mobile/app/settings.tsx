import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { font, lightTheme as t } from '@together/ui/tokens';
import { Button, Card, ListRow, Screen, Segmented } from '../components/ui';
import { signOut } from '../lib/auth';
import { deleteMyAccount, setLanguage, type Locale } from '../lib/account';
import { isAdmin } from '../lib/social';

// Тохиргоо: хэл, сонирхол, багш, мэдэгдэл, хууль эрх зүй, гарах, бүртгэл устгах.
export default function Settings() {
  const { t: tr, i18n } = useTranslation();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [admin, setAdmin] = useState(false);

  useEffect(() => {
    isAdmin().then(setAdmin).catch(() => setAdmin(false));
  }, []);

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

      <Text style={styles.section}>{tr('legal.section')}</Text>
      <Card style={{ paddingVertical: 4 }}>
        <ListRow icon="document-text-outline" label={tr('legal.terms.title')} onPress={() => router.push('/legal/terms' as never)} />
        <ListRow icon="shield-checkmark-outline" label={tr('legal.privacy.title')} onPress={() => router.push('/legal/privacy' as never)} />
      </Card>

      <Button label={tr('settings.logout')} variant="secondary" icon="log-out-outline" onPress={() => signOut().catch(() => {})} />
      <Pressable onPress={onDelete} disabled={busy} accessibilityRole="button" style={styles.danger}>
        <Text style={styles.dangerText}>{tr('settings.deleteAccount')}</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { fontFamily: font.bold, fontSize: 15, color: t.textMuted, marginTop: 6 },
  danger: { alignItems: 'center', paddingVertical: 14 },
  dangerText: { fontFamily: font.semibold, fontSize: 14, color: t.warning },
});
