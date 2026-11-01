import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { font, lightTheme as t, palette, radius, shadow } from '@together/ui/tokens';
import { signOut } from '../../lib/auth';
import { Avatar } from '../../components/Avatar';
import { Button, Card, Field, ListRow, Segmented } from '../../components/ui';
import { fetchProgress, type Progress } from '../../lib/goals';
import {
  deleteMyAccount,
  fetchBlocked,
  fetchMyProfile,
  pickAndUploadAvatar,
  setLanguage,
  unblockUser,
  updateMyProfile,
  type BlockedUser,
  type Locale,
  type MyProfile,
} from '../../lib/account';

// Профайл + тохиргоо: зураг, засах, хэл, сонирхол, багш, блок, хууль эрх зүй, гарах, бүртгэл устгах.
export default function Profile() {
  const { t: tr, i18n } = useTranslation();
  const router = useRouter();
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [blocked, setBlocked] = useState<BlockedUser[]>([]);
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, pr, b] = await Promise.all([fetchMyProfile(), fetchProgress(), fetchBlocked()]);
      setProfile(p);
      setProgress(pr);
      setBlocked(b);
      setDisplayName(p?.display_name ?? '');
      setBio(p?.bio ?? '');
    } catch (e: any) {
      Alert.alert(tr('common.error'), String(e.message ?? e));
    } finally {
      setLoading(false);
    }
  }, [tr]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onAvatar = async () => {
    setUploading(true);
    try {
      const url = await pickAndUploadAvatar();
      if (url) setProfile((p) => (p ? { ...p, avatar_url: url } : p));
    } catch (e: any) {
      Alert.alert(tr('common.error'), String(e.message ?? e));
    } finally {
      setUploading(false);
    }
  };

  const onSave = async () => {
    const name = displayName.trim();
    if (name.length < 1 || name.length > 40) return Alert.alert(tr('common.error'), tr('profile.nameInvalid'));
    if (bio.length > 300) return Alert.alert(tr('common.error'), tr('settings.bioInvalid'));
    setBusy(true);
    try {
      await updateMyProfile({ display_name: name, bio: bio.trim() || null });
      setProfile((p) => (p ? { ...p, display_name: name, bio: bio.trim() || null } : p));
      setEditing(false);
    } catch (e: any) {
      Alert.alert(tr('common.error'), String(e.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const onLanguage = async (locale: Locale) => {
    try {
      await setLanguage(locale);
    } catch (e: any) {
      Alert.alert(tr('common.error'), String(e.message ?? e));
    }
  };

  const onUnblock = async (userId: string) => {
    try {
      await unblockUser(userId);
      setBlocked((prev) => prev.filter((b) => b.blocked_id !== userId));
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

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={t.accent} />
      </View>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: t.background }} contentContainerStyle={styles.screen}>
      {/* Толгой хэсэг */}
      <View style={[styles.hero, shadow.card]}>
        <Pressable onPress={onAvatar} disabled={uploading} accessibilityRole="button" accessibilityLabel={tr('settings.changePhoto')}>
          <Avatar name={profile?.display_name} url={profile?.avatar_url} size={84} />
          <View style={styles.camera}>
            {uploading ? <ActivityIndicator size="small" color={t.onAccent} /> : <Ionicons name="camera" size={14} color={t.onAccent} />}
          </View>
        </Pressable>
        <Text style={styles.name}>{profile?.display_name}</Text>
        <Text style={styles.username}>@{profile?.username}</Text>
        {!!profile?.bio && <Text style={styles.bio}>{profile.bio}</Text>}

        {progress && (
          <View style={styles.stats}>
            <Stat label={tr('xp.label')} value={progress.total_xp} />
            <View style={styles.statDivider} />
            <Stat label={tr('home.level')} value={progress.current_level} />
            <View style={styles.statDivider} />
            <Stat label={tr('settings.longest')} value={progress.longest_streak} />
          </View>
        )}
      </View>

      {editing ? (
        <Card style={{ gap: 14 }}>
          <Field label={tr('profile.displayName')} value={displayName} onChangeText={setDisplayName} maxLength={40} />
          <Field
            label={tr('settings.bio')}
            value={bio}
            onChangeText={setBio}
            multiline
            maxLength={300}
            style={{ minHeight: 80, textAlignVertical: 'top' }}
          />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Button label={tr('common.cancel')} variant="secondary" onPress={() => setEditing(false)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label={tr('settings.save')} onPress={onSave} loading={busy} />
            </View>
          </View>
        </Card>
      ) : (
        <Button label={tr('settings.edit')} variant="secondary" icon="create-outline" onPress={() => setEditing(true)} />
      )}

      <Text style={styles.section}>{tr('settings.language')}</Text>
      <Segmented
        options={[
          { value: 'mn' as Locale, label: tr('settings.mn') },
          { value: 'en' as Locale, label: tr('settings.en') },
        ]}
        value={(i18n.language === 'en' ? 'en' : 'mn') as Locale}
        onChange={onLanguage}
      />

      <Card style={{ paddingVertical: 4 }}>
        <ListRow icon="sparkles-outline" label={tr('interests.edit')} onPress={() => router.push('/interests?edit=1' as never)} />
        <ListRow icon="school-outline" label={tr('teach.title')} onPress={() => router.push('/teach/edit' as never)} />
        <ListRow icon="notifications-outline" label={tr('notifications.title')} onPress={() => router.push('/notifications' as never)} />
      </Card>

      <Text style={styles.section}>{tr('settings.blockedUsers')}</Text>
      <Card style={{ paddingVertical: blocked.length ? 4 : 16 }}>
        {blocked.length === 0 ? (
          <Text style={styles.muted}>{tr('settings.noBlocked')}</Text>
        ) : (
          blocked.map((b) => (
            <View key={b.blocked_id} style={styles.blockedRow}>
              <Avatar name={b.display_name} size={32} />
              <Text style={[styles.rowText, { flex: 1 }]} numberOfLines={1}>
                {b.display_name}
              </Text>
              <Pressable onPress={() => onUnblock(b.blocked_id)} accessibilityRole="button" hitSlop={8}>
                <Text style={styles.link}>{tr('settings.unblock')}</Text>
              </Pressable>
            </View>
          ))
        )}
      </Card>

      <Text style={styles.section}>{tr('legal.section')}</Text>
      <Card style={{ paddingVertical: 4 }}>
        <ListRow icon="document-text-outline" label={tr('legal.terms.title')} onPress={() => router.push('/legal/terms' as never)} />
        <ListRow icon="shield-checkmark-outline" label={tr('legal.privacy.title')} onPress={() => router.push('/legal/privacy' as never)} />
      </Card>

      <View style={{ marginTop: 8 }}>
        <Button label={tr('settings.logout')} variant="secondary" icon="log-out-outline" onPress={() => signOut().catch(() => {})} />
      </View>
      <Pressable onPress={onDelete} disabled={busy} accessibilityRole="button" style={styles.danger}>
        <Text style={styles.dangerText}>{tr('settings.deleteAccount')}</Text>
      </Pressable>
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.background },
  screen: { padding: 20, paddingTop: 60, gap: 14, paddingBottom: 40 },
  hero: { backgroundColor: palette.midnightNavy, borderRadius: radius.lg, padding: 20, alignItems: 'center', gap: 4 },
  camera: {
    position: 'absolute', right: -2, bottom: -2, width: 28, height: 28, borderRadius: 14,
    backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: palette.midnightNavy,
  },
  name: { fontFamily: font.extrabold, fontSize: 22, color: palette.warmIvory, marginTop: 10 },
  username: { fontFamily: font.medium, fontSize: 14, color: 'rgba(244,240,231,0.7)' },
  bio: { fontFamily: font.medium, fontSize: 14, color: palette.warmIvory, textAlign: 'center', marginTop: 6, lineHeight: 20 },
  stats: { flexDirection: 'row', alignItems: 'center', marginTop: 16, alignSelf: 'stretch' },
  statDivider: { width: 1, height: 28, backgroundColor: 'rgba(244,240,231,0.15)' },
  statValue: { fontFamily: font.extrabold, fontSize: 20, color: palette.warmIvory },
  statLabel: { fontFamily: font.medium, fontSize: 12, color: 'rgba(244,240,231,0.7)' },
  section: { fontFamily: font.bold, fontSize: 16, color: t.text, marginTop: 6 },
  muted: { fontFamily: font.medium, fontSize: 14, color: '#5B6573' },
  blockedRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  rowText: { fontFamily: font.semibold, fontSize: 15, color: t.text },
  link: { fontFamily: font.bold, fontSize: 14, color: t.text },
  danger: { alignItems: 'center', paddingVertical: 12 },
  dangerText: { fontFamily: font.semibold, fontSize: 14, color: t.warning },
});
