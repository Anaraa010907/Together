import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { font, lightTheme as t, palette, radius } from '@together/ui/tokens';
import { Avatar } from '../../components/Avatar';
import { Backdrop } from '../../components/Backdrop';
import { FollowButton } from '../../components/FollowButton';
import { FadeIn, PressableScale } from '../../components/motion';
import { useSession } from '../../lib/session';
import { promptMemberActions } from '../../lib/moderation';
import { fetchUserPosts, type Post } from '../../lib/feed';
import { timeAgo } from '../../lib/time';
import { chatErrorKey, startDirectChat } from '../../lib/chat';
import {
  adminErrorKey,
  adminSetBan,
  compact,
  fetchProfileStats,
  fetchPublicProfile,
  follow,
  unfollow,
  type ProfileStats,
} from '../../lib/social';

// Бусдын профайл: статистик (дарвал жагсаалт), дагах, мессеж, нийтлэлүүд, мэдээлэх/блоклох, админ хориг.
export default function UserProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const userId = String(id);
  const { t: tr } = useTranslation();
  const router = useRouter();
  const { session } = useSession();
  const [profile, setProfile] = useState<Awaited<ReturnType<typeof fetchPublicProfile>>>(null);
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, s, ps] = await Promise.all([
        fetchPublicProfile(userId),
        fetchProfileStats(userId),
        fetchUserPosts(userId).catch(() => [] as Post[]),
      ]);
      setProfile(p);
      setStats(s);
      setPosts(ps);
    } catch (e: any) {
      Alert.alert(tr('common.error'), String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }, [userId, tr]);

  useFocusEffect(
    useCallback(() => {
      if (session?.user.id === userId) {
        router.replace('/profile' as never);
        return;
      }
      load();
    }, [load, router, session?.user.id, userId]),
  );

  const onFollow = async () => {
    if (!stats) return;
    setBusy(true);
    try {
      if (stats.i_follow) {
        await unfollow(userId);
        setStats({ ...stats, i_follow: false, followers: Math.max(0, stats.followers - 1) });
      } else {
        await follow(userId);
        setStats({ ...stats, i_follow: true, followers: stats.followers + 1 });
      }
    } catch (e: any) {
      Alert.alert(tr('common.error'), String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const onMessage = async () => {
    setBusy(true);
    try {
      const cid = await startDirectChat(userId);
      router.push(`/chat/${cid}` as never);
    } catch (e) {
      const key = chatErrorKey(e);
      Alert.alert(tr('common.error'), key ? tr(key) : String((e as any)?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const onMore = () => {
    if (!profile || !stats) return;
    if (!stats.viewer_admin) {
      promptMemberActions(profile.display_name, userId, () => router.back());
      return;
    }
    // Админ: хориглох / хоригийг цуцлах.
    Alert.alert(profile.display_name, undefined, [
      {
        text: stats.banned ? tr('admin.unban') : tr('admin.ban'),
        style: stats.banned ? 'default' : 'destructive',
        onPress: () =>
          adminSetBan(userId, !stats.banned)
            .then(() => setStats({ ...stats, banned: !stats.banned }))
            .catch((e) => {
              const key = adminErrorKey(e);
              Alert.alert(tr('common.error'), key ? tr(key) : String(e?.message ?? e));
            }),
      },
      { text: tr('report.action'), onPress: () => promptMemberActions(profile.display_name, userId, () => router.back()) },
      { text: tr('common.cancel'), style: 'cancel' },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={t.accent} />
      </View>
    );
  }

  if (!profile || !stats) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>{tr('social.notFound')}</Text>
      </View>
    );
  }

  const openList = (kind: 'followers' | 'following') =>
    router.push({ pathname: '/follows/[id]', params: { id: userId, kind, name: profile.display_name } } as never);

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <Backdrop />
      <ScrollView contentContainerStyle={styles.screen}>
        <FadeIn index={0} style={{ alignItems: 'center', gap: 4 }}>
          <Avatar name={profile.display_name} url={profile.avatar_url} size={112} ring />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 }}>
            <Text style={styles.name}>{profile.display_name}</Text>
            {stats.verified && <Ionicons name="checkmark-circle" size={22} color={palette.violet} />}
          </View>
          <Text style={styles.username}>@{profile.username}</Text>
          {stats.banned && (
            <View style={styles.bannedTag}>
              <Text style={styles.bannedText}>{tr('admin.bannedLabel')}</Text>
            </View>
          )}
          {!!profile.bio && <Text style={styles.bio}>{profile.bio}</Text>}
        </FadeIn>

        <FadeIn index={1}>
          <View style={styles.stats}>
            <Stat label={tr('me.posts')} value={stats.posts} />
            <View style={styles.divider} />
            <Stat label={tr('me.followers')} value={stats.followers} onPress={() => openList('followers')} />
            <View style={styles.divider} />
            <Stat label={tr('me.following')} value={stats.following} onPress={() => openList('following')} />
            <View style={styles.divider} />
            <Stat label={tr('me.groups')} value={stats.groups} />
          </View>
        </FadeIn>

        <FadeIn index={2}>
          {stats.blocked ? (
            <Text style={[styles.muted, { textAlign: 'center' }]}>{tr('social.blocked')}</Text>
          ) : (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <FollowButton following={stats.i_follow} busy={busy} onPress={onFollow} />
              </View>
              <PressableScale onPress={onMessage} disabled={busy} accessibilityRole="button" style={styles.msgBtn}>
                <Ionicons name="chatbubble-ellipses-outline" size={18} color={t.text} />
                <Text style={styles.msgText}>{tr('chat.message')}</Text>
              </PressableScale>
              <PressableScale onPress={onMore} accessibilityRole="button" accessibilityLabel={tr('common.more')} style={styles.more}>
                <Ionicons name="ellipsis-horizontal" size={20} color={t.text} />
              </PressableScale>
            </View>
          )}
        </FadeIn>

        <FadeIn index={3} style={{ gap: 10 }}>
          <Text style={styles.section}>{tr('me.posts')}</Text>
          {posts.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.muted}>{tr('social.noVisiblePosts')}</Text>
            </View>
          ) : (
            posts.map((p) => (
              <PressableScale key={p.id} onPress={() => router.push(`/post/${p.id}` as never)} accessibilityRole="button" style={styles.post}>
                <Text style={styles.postMeta}>
                  {tr(`feed.kind.${p.kind}`)} · {timeAgo(p.created_at)}
                </Text>
                <Text style={styles.postBody} numberOfLines={4}>
                  {p.body}
                </Text>
                <View style={{ flexDirection: 'row', gap: 16 }}>
                  <Text style={styles.postMeta}>💡 {p.helpful_ids.length}</Text>
                  <Text style={styles.postMeta}>💬 {p.comment_count}</Text>
                  {p.attachments.length > 0 && <Text style={styles.postMeta}>📎 {p.attachments.length}</Text>}
                </View>
              </PressableScale>
            ))
          )}
        </FadeIn>
      </ScrollView>
    </View>
  );
}

function Stat({ label, value, onPress }: { label: string; value: number; onPress?: () => void }) {
  return (
    <PressableScale onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined} style={{ flex: 1, alignItems: 'center', gap: 2 }}>
      <Text style={styles.statValue}>{compact(value)}</Text>
      <Text style={styles.statLabel} numberOfLines={1}>
        {label}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.background },
  screen: { padding: 20, paddingTop: 110, gap: 20, paddingBottom: 48 },
  name: { fontFamily: font.extrabold, fontSize: 26, color: t.text },
  username: { fontFamily: font.medium, fontSize: 14, color: t.textMuted },
  bio: { fontFamily: font.medium, fontSize: 14, color: 'rgba(255,255,255,0.85)', textAlign: 'center', marginTop: 6, lineHeight: 20 },
  bannedTag: { backgroundColor: 'rgba(251,113,133,0.18)', borderRadius: radius.pill, paddingVertical: 4, paddingHorizontal: 12, marginTop: 6 },
  bannedText: { fontFamily: font.bold, fontSize: 12, color: palette.rose },
  stats: { flexDirection: 'row', alignItems: 'center' },
  divider: { width: 1, height: 32, backgroundColor: t.border },
  statValue: { fontFamily: font.extrabold, fontSize: 20, color: t.text },
  statLabel: { fontFamily: font.medium, fontSize: 12, color: t.textMuted },
  msgBtn: {
    height: 46, borderRadius: radius.pill, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: t.surface, borderWidth: 1, borderColor: t.border,
  },
  msgText: { fontFamily: font.bold, fontSize: 14, color: t.text },
  more: {
    width: 46, height: 46, borderRadius: 23, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border,
    alignItems: 'center', justifyContent: 'center',
  },
  section: { fontFamily: font.extrabold, fontSize: 18, color: t.text },
  emptyBox: { borderRadius: 18, borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.18)', padding: 16 },
  post: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 20, padding: 14, gap: 8 },
  postMeta: { fontFamily: font.medium, fontSize: 12, color: t.textMuted },
  postBody: { fontFamily: font.medium, fontSize: 14, color: 'rgba(255,255,255,0.88)', lineHeight: 20 },
  muted: { fontFamily: font.medium, fontSize: 14, color: t.textMuted },
});
