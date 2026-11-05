import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { font, gradients, lightTheme as t, palette, radius, shadow } from '@together/ui/tokens';
import { Avatar } from '../../components/Avatar';
import { Backdrop } from '../../components/Backdrop';
import { Ghost } from '../../components/Illustrations';
import { TAB_BAR_SPACE } from '../../components/TabBar';
import { FadeIn, PressableScale } from '../../components/motion';
import { Button, Segmented } from '../../components/ui';
import { fetchProgress, type Progress } from '../../lib/goals';
import { fetchMyGroups, type GroupSummary } from '../../lib/groups';
import { categoryColor } from '../../lib/interests';
import { compact, computeAchievements, fetchProfileStats, type ProfileStats } from '../../lib/social';
import {
  fetchBlocked,
  fetchMyProfile,
  pickAndUploadAvatar,
  unblockUser,
  updateMyProfile,
  type BlockedUser,
  type MyProfile,
} from '../../lib/account';

type Seg = 'activity' | 'groups';

// Профайл: зураг, статистик, засах, миний үйл ажиллагаа / группууд, блоклосон хэрэглэгчид.
export default function Profile() {
  const { t: tr } = useTranslation();
  const router = useRouter();
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [blocked, setBlocked] = useState<BlockedUser[]>([]);
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [editing, setEditing] = useState(false);
  const [seg, setSeg] = useState<Seg>('activity');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, pr, b, g] = await Promise.all([
        fetchMyProfile(),
        fetchProgress(),
        fetchBlocked().catch(() => [] as BlockedUser[]),
        fetchMyGroups().catch(() => [] as GroupSummary[]),
      ]);
      setProfile(p);
      setProgress(pr);
      setBlocked(b);
      setGroups(g);
      setDisplayName(p?.display_name ?? '');
      setBio(p?.bio ?? '');
      if (p) setStats(await fetchProfileStats(p.id).catch(() => null));
    } catch (e: any) {
      Alert.alert(tr('common.error'), String(e.message ?? e));
    } finally {
      setLoading(false);
      setRefreshing(false);
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

  const onUnblock = async (userId: string) => {
    try {
      await unblockUser(userId);
      setBlocked((prev) => prev.filter((b) => b.blocked_id !== userId));
    } catch (e: any) {
      Alert.alert(tr('common.error'), String(e.message ?? e));
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={t.accent} />
      </View>
    );
  }

  const achievements = stats && progress ? computeAchievements(stats, progress) : [];
  const achieved = achievements.filter((a) => a.done).length;
  const rows: { key: string; icon: string; label: string; value: string; to: string }[] = [
    { key: 'achievements', icon: '🏆', label: tr('me.achievements'), value: `${achieved}/${achievements.length || 12}`, to: '/me/achievements' },
    { key: 'xp', icon: '⭐', label: tr('me.xp'), value: compact(progress?.total_xp ?? 0), to: '/me/xp' },
    { key: 'liked', icon: '❤️', label: tr('me.liked'), value: compact(stats?.liked ?? 0), to: '/me/liked' },
    { key: 'saved', icon: '🔖', label: tr('me.saved'), value: compact(stats?.saved ?? 0), to: '/me/saved' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <Backdrop />
      <ScrollView
        contentContainerStyle={styles.screen}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            tintColor={t.accent}
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
          />
        }
      >
        <View style={styles.topBar}>
          <View style={{ width: 44 }} />
          <PressableScale onPress={() => router.push('/settings' as never)} accessibilityRole="button" accessibilityLabel={tr('settings.title')} style={styles.gear}>
            <Ionicons name="settings-outline" size={21} color={t.text} />
          </PressableScale>
        </View>

        {/* Толгой хэсэг */}
        <FadeIn index={0} style={{ alignItems: 'center', gap: 4 }}>
          <PressableScale onPress={onAvatar} disabled={uploading} accessibilityRole="button" accessibilityLabel={tr('settings.changePhoto')}>
            <Avatar name={profile?.display_name} url={profile?.avatar_url} size={112} ring />
            <LinearGradient colors={gradients.violet} style={styles.camera}>
              {uploading ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name="camera" size={15} color="#FFFFFF" />}
            </LinearGradient>
          </PressableScale>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 }}>
            <Text style={styles.name}>{profile?.display_name}</Text>
            {stats?.verified && <Ionicons name="checkmark-circle" size={22} color={palette.violet} />}
          </View>
          <Text style={styles.username}>@{profile?.username}</Text>
          {!!profile?.bio && <Text style={styles.bio}>{profile.bio}</Text>}
        </FadeIn>

        <FadeIn index={1}>
          <View style={styles.stats}>
            <Stat label={tr('me.posts')} value={stats?.posts ?? 0} />
            <View style={styles.statDivider} />
            <Stat label={tr('me.followers')} value={stats?.followers ?? 0} />
            <View style={styles.statDivider} />
            <Stat label={tr('me.groups')} value={stats?.groups ?? groups.length} />
          </View>
        </FadeIn>

        <FadeIn index={2}>
          {editing ? (
            <View style={styles.editCard}>
              <Text style={styles.label}>{tr('profile.displayName')}</Text>
              <TextInput
                style={styles.input}
                value={displayName}
                onChangeText={setDisplayName}
                maxLength={40}
                placeholderTextColor={t.textFaint}
                accessibilityLabel={tr('profile.displayName')}
              />
              <Text style={styles.label}>{tr('settings.bio')}</Text>
              <TextInput
                style={[styles.input, { minHeight: 84, textAlignVertical: 'top' }]}
                value={bio}
                onChangeText={setBio}
                multiline
                maxLength={300}
                placeholderTextColor={t.textFaint}
                accessibilityLabel={tr('settings.bio')}
              />
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                <View style={{ flex: 1 }}>
                  <Button label={tr('common.cancel')} variant="secondary" onPress={() => setEditing(false)} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button label={tr('settings.save')} onPress={onSave} loading={busy} />
                </View>
              </View>
            </View>
          ) : (
            <PressableScale onPress={() => setEditing(true)} accessibilityRole="button" style={shadow.glow}>
              <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.editBtn}>
                <Ionicons name="create-outline" size={19} color="#FFFFFF" />
                <Text style={styles.editText}>{tr('settings.edit')}</Text>
              </LinearGradient>
            </PressableScale>
          )}
        </FadeIn>

        <FadeIn index={3}>
          <Segmented<Seg>
            options={[
              { value: 'activity', label: tr('me.activity') },
              { value: 'groups', label: tr('me.myGroups') },
            ]}
            value={seg}
            onChange={setSeg}
          />
        </FadeIn>

        {seg === 'activity' ? (
          <FadeIn index={4}>
            <View style={styles.list}>
              {rows.map((r, i) => (
                <PressableScale
                  key={r.key}
                  onPress={() => router.push(r.to as never)}
                  accessibilityRole="button"
                  style={[styles.listRow, i > 0 && styles.listBorder]}
                >
                  <Text style={styles.rowIcon}>{r.icon}</Text>
                  <Text style={styles.rowLabel}>{r.label}</Text>
                  <Text style={styles.rowValue}>{r.value}</Text>
                  <View style={styles.rowChev}>
                    <Ionicons name="chevron-forward" size={14} color={t.text} />
                  </View>
                </PressableScale>
              ))}
            </View>
          </FadeIn>
        ) : (
          <FadeIn index={4}>
            <View style={styles.list}>
              {groups.length === 0 && <Text style={[styles.muted, { padding: 16 }]}>{tr('groups.noMine')}</Text>}
              {groups.map((g, i) => (
                <PressableScale
                  key={g.id}
                  onPress={() => router.push(`/group/${g.id}` as never)}
                  accessibilityRole="button"
                  style={[styles.listRow, i > 0 && styles.listBorder]}
                >
                  <LinearGradient colors={categoryColor(g.category_id)} style={styles.groupIcon}>
                    <Text style={{ fontSize: 16 }}>{g.kind === 'course' ? '📚' : '👥'}</Text>
                  </LinearGradient>
                  <Text style={styles.rowLabel} numberOfLines={1}>
                    {g.name}
                  </Text>
                  {g.owner_id === profile?.id && <Text style={styles.ownerTag}>{tr('groups.owner')}</Text>}
                  <View style={styles.rowChev}>
                    <Ionicons name="chevron-forward" size={14} color={t.text} />
                  </View>
                </PressableScale>
              ))}
            </View>
          </FadeIn>
        )}

        {/* Блоклосон хэрэглэгчид */}
        <FadeIn index={5}>
          <View style={styles.blockedCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Ionicons name="ban-outline" size={20} color={palette.rose} />
              <Text style={styles.blockedTitle}>{tr('settings.blockedUsers')}</Text>
            </View>
            {blocked.length === 0 ? (
              <View style={styles.blockedEmpty}>
                <Text style={styles.muted}>{tr('settings.noBlockedShort')}</Text>
                <Ghost size={58} />
              </View>
            ) : (
              blocked.map((b) => (
                <View key={b.blocked_id} style={styles.blockedRow}>
                  <Avatar name={b.display_name} size={34} />
                  <Text style={[styles.rowLabel, { fontSize: 14 }]} numberOfLines={1}>
                    {b.display_name}
                  </Text>
                  <Pressable onPress={() => onUnblock(b.blocked_id)} accessibilityRole="button" hitSlop={8} style={styles.unblock}>
                    <Text style={styles.unblockText}>{tr('settings.unblock')}</Text>
                  </Pressable>
                </View>
              ))
            )}
          </View>
        </FadeIn>
      </ScrollView>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
      <Text style={styles.statValue}>{compact(value)}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.background },
  screen: { padding: 20, paddingTop: 52, gap: 16, paddingBottom: TAB_BAR_SPACE },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  gear: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border,
    alignItems: 'center', justifyContent: 'center',
  },
  camera: {
    position: 'absolute', right: 4, bottom: 4, width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: t.background,
  },
  name: { fontFamily: font.extrabold, fontSize: 26, color: t.text },
  username: { fontFamily: font.medium, fontSize: 14, color: t.textMuted },
  bio: { fontFamily: font.medium, fontSize: 14, color: 'rgba(255,255,255,0.85)', textAlign: 'center', marginTop: 6, lineHeight: 20, paddingHorizontal: 12 },
  stats: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  statDivider: { width: 1, height: 34, backgroundColor: t.border },
  statValue: { fontFamily: font.extrabold, fontSize: 22, color: t.text },
  statLabel: { fontFamily: font.medium, fontSize: 13, color: t.textMuted },
  editBtn: { height: 54, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  editText: { fontFamily: font.bold, fontSize: 16, color: '#FFFFFF' },
  editCard: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 22, padding: 16, gap: 8 },
  label: { fontFamily: font.semibold, fontSize: 13, color: t.textMuted },
  input: {
    backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: t.border, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 12, fontFamily: font.medium, fontSize: 15, color: t.text,
  },
  list: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 22, paddingHorizontal: 14 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  listBorder: { borderTopWidth: 1, borderTopColor: t.borderSoft },
  rowIcon: { fontSize: 20, width: 28, textAlign: 'center' },
  rowLabel: { flex: 1, fontFamily: font.semibold, fontSize: 15, color: t.text },
  rowValue: { fontFamily: font.bold, fontSize: 14, color: t.textMuted },
  rowChev: {
    width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  groupIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  ownerTag: { fontFamily: font.bold, fontSize: 11, color: palette.lilac },
  blockedCard: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 22, padding: 16, gap: 10 },
  blockedTitle: { fontFamily: font.bold, fontSize: 15, color: t.text },
  blockedEmpty: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 30 },
  blockedRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  unblock: { borderWidth: 1, borderColor: t.border, borderRadius: radius.pill, paddingVertical: 6, paddingHorizontal: 12 },
  unblockText: { fontFamily: font.bold, fontSize: 12, color: t.text },
  muted: { fontFamily: font.medium, fontSize: 14, color: t.textMuted },
});
