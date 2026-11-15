import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { font, gradients, lightTheme as t, radius, shadow, space } from '@together/ui/tokens';
import { Backdrop } from '../../components/Backdrop';
import { PostCard } from '../../components/PostCard';
import { useSession } from '../../lib/session';
import { fetchBlockedIds } from '../../lib/account';
import { fetchGroup, fetchMyMembership } from '../../lib/groups';
import { promptContentActions } from '../../lib/moderation';
import { usePostActions } from '../../lib/usePostActions';
import { deletePost, fetchFeed, signedUrls, type Post } from '../../lib/feed';

const PAGE = 20;

// Group feed: шинэ пост дээрээ, доош гүйлгэхэд өмнөхийг ачаална.
export default function Feed() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const gid = String(groupId);
  const { t: tr } = useTranslation();
  const router = useRouter();
  const { session } = useSession();
  const myId = session?.user.id;

  const [posts, setPosts] = useState<Post[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  const [isOwner, setIsOwner] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [end, setEnd] = useState(false);

  const replace = (p: Post) => setPosts((prev) => prev.map((x) => (x.id === p.id ? p : x)));
  const { busyId, toggleHelpful, vote, isSaved, toggleSave } = usePostActions(myId, replace);

  const addUrls = async (list: Post[]) => {
    const paths = list.flatMap((p) => p.attachments.map((a) => a.storage_path));
    const u = await signedUrls(paths).catch(() => ({}));
    setUrls((prev) => ({ ...prev, ...u }));
  };

  const load = useCallback(async () => {
    try {
      const [list, b, m] = await Promise.all([
        fetchFeed(gid),
        fetchBlockedIds().catch(() => new Set<string>()),
        fetchMyMembership(gid),
      ]);
      setPosts(list);
      setBlocked(b);
      setIsOwner(m?.role === 'owner' && m?.status === 'active');
      fetchGroup(gid)
        .then((g) => setGroupName(g?.name ?? ''))
        .catch(() => {});
      setEnd(list.length < PAGE);
      await addUrls(list);
    } catch (e: any) {
      Alert.alert(tr('common.error'), String(e.message ?? e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [gid, tr]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const loadMore = async () => {
    if (end || loadingMore || posts.length === 0) return;
    setLoadingMore(true);
    try {
      const more = await fetchFeed(gid, posts[posts.length - 1].created_at);
      setPosts((prev) => [...prev, ...more]);
      setEnd(more.length < PAGE);
      await addUrls(more);
    } catch {
      // дараагийн гүйлгэлтэд дахин оролдоно
    } finally {
      setLoadingMore(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: t.background }]}>
        <ActivityIndicator color={t.accent} />
      </View>
    );
  }

  const visible = posts.filter((p) => !blocked.has(p.author_id));

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <Stack.Screen options={{ title: groupName || tr('feed.title') }} />
      <Backdrop />
      <FlatList
        data={visible}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.list}
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
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={<Text style={[styles.empty, { color: t.textMuted }]}>{tr('feed.empty')}</Text>}
        ListFooterComponent={loadingMore ? <ActivityIndicator color={t.accent} /> : null}
        renderItem={({ item }) => (
          <PostCard
            post={item}
            myId={myId}
            urls={urls}
            busy={busyId === item.id}
            onOpen={() => router.push(`/post/${item.id}` as never)}
            onLongPress={() =>
              promptContentActions({
                type: 'post',
                id: item.id,
                isMine: item.author_id === myId,
                canDelete: item.author_id === myId || isOwner,
                onDelete: async () => {
                  await deletePost(item);
                  setPosts((prev) => prev.filter((p) => p.id !== item.id));
                },
              })
            }
            onHelpful={() => toggleHelpful(item)}
            onVote={(v) => vote(item, v)}
            saved={isSaved(item.id)}
            onSave={() => toggleSave(item)}
          />
        )}
      />

      <Pressable
        style={({ pressed }) => [styles.fab, shadow.glow, { opacity: pressed ? 0.85 : 1 }]}
        onPress={() => router.push(`/post/new?groupId=${gid}` as never)}
        accessibilityRole="button"
        accessibilityLabel={tr('feed.newPost')}
      >
        <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.fabInner}>
          <Ionicons name="create-outline" size={18} color="#FFFFFF" />
          <Text style={styles.fabText}>{tr('feed.newPost')}</Text>
        </LinearGradient>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: space.lg, gap: space.md, paddingBottom: 100 },
  empty: { textAlign: 'center', marginTop: space.xl },
  fab: { position: 'absolute', right: 20, bottom: 34 },
  fabInner: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingVertical: 14, paddingHorizontal: 20 },
  fabText: { fontSize: 15, fontFamily: font.bold, color: '#FFFFFF' },
});
