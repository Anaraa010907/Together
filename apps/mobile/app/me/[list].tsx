import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { font, gradients, lightTheme as t, palette } from '@together/ui/tokens';
import { Backdrop } from '../../components/Backdrop';
import { FadeIn, PressableScale } from '../../components/motion';
import { Avatar } from '../../components/Avatar';
import { fetchProgress, type Progress } from '../../lib/goals';
import { fetchMyProfile } from '../../lib/account';
import { timeAgo } from '../../lib/time';
import { fetchUserPosts, type Post } from '../../lib/feed';
import {
  computeAchievements,
  fetchLikedPosts,
  fetchProfileStats,
  fetchSavedPosts,
  fetchXpHistory,
  xpSourceLabel,
  type Achievement,
  type XpEntry,
} from '../../lib/social';

type List = 'achievements' | 'xp' | 'liked' | 'saved' | 'posts';

// Профайлын "Миний үйл ажиллагаа" жагсаалтууд.
export default function MyList() {
  const { list } = useLocalSearchParams<{ list: string }>();
  const kind = (['achievements', 'xp', 'liked', 'saved', 'posts'].includes(String(list)) ? list : 'xp') as List;
  const { t: tr } = useTranslation();
  const router = useRouter();
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [xp, setXp] = useState<XpEntry[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      if (kind === 'achievements' || kind === 'xp') {
        const pr = await fetchProgress();
        setProgress(pr);
        if (kind === 'achievements') {
          const me = await fetchMyProfile();
          const s = me ? await fetchProfileStats(me.id) : null;
          setAchievements(s ? computeAchievements(s, pr) : []);
        } else {
          setXp(await fetchXpHistory());
        }
      } else {
        if (kind === 'posts') {
          const me = await fetchMyProfile();
          setPosts(me ? await fetchUserPosts(me.id, 100) : []);
        } else {
          setPosts(kind === 'liked' ? await fetchLikedPosts() : await fetchSavedPosts());
        }
      }
    } catch (e: any) {
      Alert.alert(tr('common.error'), String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }, [kind, tr]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const title = tr(`me.${kind}`);

  if (loading) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title }} />
        <ActivityIndicator color={t.accent} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <Stack.Screen options={{ title }} />
      <Backdrop />

      {kind === 'achievements' && (
        <FlatList
          data={achievements}
          keyExtractor={(a) => a.key}
          numColumns={2}
          columnWrapperStyle={{ gap: 12 }}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <Text style={styles.summary}>
              {tr('me.achievedOf', { n: achievements.filter((a) => a.done).length, total: achievements.length })}
            </Text>
          }
          renderItem={({ item, index }) => (
            <FadeIn index={index} style={{ flex: 1 }}>
              <View style={[styles.badge, item.done && styles.badgeDone]}>
                {item.done ? (
                  <LinearGradient colors={gradients.brand} style={styles.badgeIcon}>
                    <Text style={{ fontSize: 26 }}>{item.icon}</Text>
                  </LinearGradient>
                ) : (
                  <View style={[styles.badgeIcon, { backgroundColor: 'rgba(255,255,255,0.06)' }]}>
                    <Text style={{ fontSize: 26, opacity: 0.35 }}>{item.icon}</Text>
                  </View>
                )}
                <Text style={styles.badgeTitle}>{tr(`achievements.${item.key}`)}</Text>
                <View style={styles.track}>
                  <LinearGradient
                    colors={item.done ? ['#34D399', '#10B981'] : gradients.violet}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    style={{ height: 5, borderRadius: 3, width: `${(item.progress / item.goal) * 100}%` }}
                  />
                </View>
                <Text style={styles.meta}>
                  {item.progress}/{item.goal}
                </Text>
              </View>
            </FadeIn>
          )}
        />
      )}

      {kind === 'xp' && (
        <FlatList
          data={xp}
          keyExtractor={(x) => x.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <LinearGradient colors={gradients.card} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.xpHero}>
              <Text style={styles.meta}>{tr('me.totalXp')}</Text>
              <Text style={styles.xpBig}>⭐ {progress?.total_xp ?? 0} XP</Text>
              <Text style={styles.meta}>
                {tr('home.level')} {progress?.current_level ?? 1} · 🔥 {progress?.current_streak ?? 0} · {tr('settings.longest')}{' '}
                {progress?.longest_streak ?? 0}
              </Text>
            </LinearGradient>
          }
          ListEmptyComponent={<Text style={styles.empty}>{tr('me.noXp')}</Text>}
          renderItem={({ item, index }) => (
            <FadeIn index={index + 1}>
              <View style={styles.row}>
                <View style={styles.xpIcon}>
                  <Text style={{ fontSize: 18 }}>⚡</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{xpSourceLabel(item.source_type)}</Text>
                  <Text style={styles.meta}>{timeAgo(item.created_at)}</Text>
                </View>
                <Text style={styles.xpAmount}>+{item.amount}</Text>
              </View>
            </FadeIn>
          )}
        />
      )}

      {(kind === 'liked' || kind === 'saved' || kind === 'posts') && (
        <FlatList
          data={posts}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>{kind === 'liked' ? tr('me.noLiked') : kind === 'posts' ? tr('me.noPosts') : tr('me.noSaved')}</Text>}
          renderItem={({ item, index }) => (
            <FadeIn index={index}>
              <PressableScale onPress={() => router.push(`/post/${item.id}` as never)} accessibilityRole="button" style={styles.post}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Avatar name={item.author_name} url={item.author_avatar} size={34} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{item.author_name}</Text>
                    <Text style={styles.meta}>
                      {tr(`feed.kind.${item.kind}`)} · {timeAgo(item.created_at)}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 16 }}>{kind === 'liked' ? '❤️' : kind === 'saved' ? '🔖' : '✍️'}</Text>
                </View>
                <Text style={styles.body} numberOfLines={4}>
                  {item.body}
                </Text>
              </PressableScale>
            </FadeIn>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.background },
  list: { padding: 20, gap: 12, paddingBottom: 48 },
  summary: { fontFamily: font.bold, fontSize: 15, color: t.textMuted, marginBottom: 4 },
  badge: {
    flex: 1, alignItems: 'center', gap: 8, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border,
    borderRadius: 22, padding: 14,
  },
  badgeDone: { borderColor: 'rgba(251,191,36,0.4)', backgroundColor: 'rgba(251,191,36,0.06)' },
  badgeIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  badgeTitle: { fontFamily: font.bold, fontSize: 13, color: t.text, textAlign: 'center', minHeight: 34 },
  track: { alignSelf: 'stretch', height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  meta: { fontFamily: font.medium, fontSize: 12, color: t.textMuted },
  xpHero: { borderRadius: 24, padding: 18, gap: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', marginBottom: 4 },
  xpBig: { fontFamily: font.extrabold, fontSize: 30, color: '#FFFFFF' },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border,
    borderRadius: 18, padding: 12,
  },
  xpIcon: { width: 40, height: 40, borderRadius: 14, backgroundColor: 'rgba(251,191,36,0.15)', alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontFamily: font.bold, fontSize: 15, color: t.text },
  xpAmount: { fontFamily: font.extrabold, fontSize: 16, color: palette.amber },
  empty: { fontFamily: font.medium, fontSize: 14, color: t.textMuted, textAlign: 'center', marginTop: 40 },
  post: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 20, padding: 14, gap: 10 },
  body: { fontFamily: font.medium, fontSize: 14, color: 'rgba(255,255,255,0.86)', lineHeight: 20 },
});
