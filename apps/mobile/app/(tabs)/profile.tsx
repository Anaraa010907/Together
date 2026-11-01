import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { lightTheme as t, radius, space } from '@together/ui/tokens';
import { signOut } from '../../lib/auth';
import { fetchProgress, type Progress } from '../../lib/goals';
import {
  deleteMyAccount,
  fetchBlocked,
  fetchMyProfile,
  setLanguage,
  unblockUser,
  updateMyProfile,
  type BlockedUser,
  type Locale,
  type MyProfile,
} from '../../lib/account';

// Профайл + тохиргоо: засах, хэл, блоклосон хэрэглэгчид, гарах, бүртгэл устгах.
export default function Profile() {
  const { t: tr, i18n } = useTranslation();
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [blocked, setBlocked] = useState<BlockedUser[]>([]);
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

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

  const onSave = async () => {
    const name = displayName.trim();
    if (name.length < 1 || name.length > 40) return Alert.alert(tr('common.error'), tr('profile.nameInvalid'));
    if (bio.length > 300) return Alert.alert(tr('common.error'), tr('settings.bioInvalid'));
    setBusy(true);
    try {
      await updateMyProfile({ display_name: name, bio: bio.trim() || null });
      Alert.alert(tr('settings.saved'));
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
      <View style={[styles.center, { backgroundColor: t.background }]}>
        <ActivityIndicator color={t.accent} />
      </View>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: t.background }} contentContainerStyle={styles.screen}>
      <Text style={[styles.title, { color: t.text }]}>{profile?.display_name}</Text>
      <Text style={{ color: t.textMuted }}>@{profile?.username}</Text>

      {progress && (
        <View style={[styles.stats, { backgroundColor: t.surface, borderColor: t.border }]}>
          <Stat label={tr('xp.label')} value={String(progress.total_xp)} />
          <Stat label={tr('home.level')} value={String(progress.current_level)} />
          <Stat label={tr('settings.longest')} value={String(progress.longest_streak)} />
        </View>
      )}

      <Text style={[styles.section, { color: t.text }]}>{tr('settings.edit')}</Text>
      <Text style={[styles.label, { color: t.textMuted }]}>{tr('profile.displayName')}</Text>
      <TextInput
        style={[styles.input, { borderColor: t.border, backgroundColor: t.surface, color: t.text }]}
        value={displayName}
        onChangeText={setDisplayName}
        maxLength={40}
        accessibilityLabel={tr('profile.displayName')}
      />
      <Text style={[styles.label, { color: t.textMuted }]}>{tr('settings.bio')}</Text>
      <TextInput
        style={[styles.input, styles.multiline, { borderColor: t.border, backgroundColor: t.surface, color: t.text }]}
        value={bio}
        onChangeText={setBio}
        maxLength={300}
        multiline
        accessibilityLabel={tr('settings.bio')}
      />
      <Pressable
        style={[styles.primary, { backgroundColor: t.accent, opacity: busy ? 0.6 : 1 }]}
        onPress={onSave}
        disabled={busy}
        accessibilityRole="button"
      >
        <Text style={[styles.primaryText, { color: t.onAccent }]}>{tr('settings.save')}</Text>
      </Pressable>

      <Text style={[styles.section, { color: t.text }]}>{tr('settings.language')}</Text>
      <View style={styles.langRow}>
        {(['mn', 'en'] as Locale[]).map((l) => {
          const active = i18n.language === l;
          return (
            <Pressable
              key={l}
              onPress={() => onLanguage(l)}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              style={[
                styles.langBtn,
                { borderColor: t.border, backgroundColor: active ? t.accent : t.surface },
              ]}
            >
              <Text style={{ color: active ? t.onAccent : t.text, fontWeight: '600' }}>{tr(`settings.${l}`)}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={[styles.section, { color: t.text }]}>{tr('settings.blockedUsers')}</Text>
      {blocked.length === 0 ? (
        <Text style={{ color: t.textMuted }}>{tr('settings.noBlocked')}</Text>
      ) : (
        blocked.map((b) => (
          <View key={b.blocked_id} style={[styles.row, { borderColor: t.border, backgroundColor: t.surface }]}>
            <Text style={{ color: t.text, flex: 1 }}>{b.display_name}</Text>
            <Pressable onPress={() => onUnblock(b.blocked_id)} accessibilityRole="button">
              <Text style={{ color: t.text, fontWeight: '600' }}>{tr('settings.unblock')}</Text>
            </Pressable>
          </View>
        ))
      )}

      <Pressable
        style={[styles.secondary, { borderColor: t.border }]}
        onPress={() => signOut().catch(() => {})}
        accessibilityRole="button"
      >
        <Text style={{ color: t.text, fontWeight: '600' }}>{tr('settings.logout')}</Text>
      </Pressable>

      <Pressable onPress={onDelete} disabled={busy} accessibilityRole="button" style={styles.danger}>
        <Text style={{ color: t.warning, fontWeight: '600' }}>{tr('settings.deleteAccount')}</Text>
      </Pressable>
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color: t.text }]}>{value}</Text>
      <Text style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { padding: space.lg, paddingTop: 64, gap: space.sm, paddingBottom: space.xl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 26, fontWeight: '700' },
  stats: { flexDirection: 'row', borderWidth: 1, borderRadius: radius.lg, padding: space.md, marginTop: space.md },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: '700' },
  section: { fontSize: 16, fontWeight: '600', marginTop: space.lg },
  label: { fontSize: 13, marginTop: space.sm },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: 12, fontSize: 16 },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  primary: { borderRadius: radius.pill, paddingVertical: 14, alignItems: 'center', marginTop: space.md },
  primaryText: { fontSize: 16, fontWeight: '600' },
  langRow: { flexDirection: 'row', gap: space.sm },
  langBtn: { flex: 1, borderWidth: 1, borderRadius: radius.pill, paddingVertical: 12, alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: radius.md, padding: space.md },
  secondary: { borderWidth: 1, borderRadius: radius.pill, paddingVertical: 14, alignItems: 'center', marginTop: space.xl },
  danger: { alignItems: 'center', paddingVertical: space.md },
});
