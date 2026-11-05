import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { font, lightTheme as t, palette } from '@together/ui/tokens';
import { Avatar } from '../../components/Avatar';
import { Backdrop } from '../../components/Backdrop';
import { FollowButton } from '../../components/FollowButton';
import { FadeIn, PressableScale } from '../../components/motion';
import { Segmented } from '../../components/ui';
import { useSession } from '../../lib/session';
import { fetchFollowList, follow, unfollow, type FollowPerson } from '../../lib/social';

type Kind = 'followers' | 'following';

// Дагагч / дагаж буй хүмүүсийн жагсаалт (?kind=followers|following).
export default function Follows() {
  const params = useLocalSearchParams<{ id: string; kind?: string; name?: string }>();
  const userId = String(params.id);
  const { t: tr } = useTranslation();
  const router = useRouter();
  const { session } = useSession();
  const myId = session?.user.id;
  const [kind, setKind] = useState<Kind>(params.kind === 'following' ? 'following' : 'followers');
  const [items, setItems] = useState<FollowPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await fetchFollowList(userId, kind));
    } catch (e: any) {
      Alert.alert(tr('common.error'), String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }, [userId, kind, tr]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onFollow = async (p: FollowPerson) => {
    setBusyId(p.id);
    try {
      if (p.i_follow) await unfollow(p.id);
      else await follow(p.id);
      setItems((prev) => prev.map((x) => (x.id === p.id ? { ...x, i_follow: !p.i_follow } : x)));
    } catch (e: any) {
      Alert.alert(tr('common.error'), String(e?.message ?? e));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <Stack.Screen options={{ title: params.name ? String(params.name) : tr('me.followers') }} />
      <Backdrop />
      <View style={{ paddingHorizontal: 20, paddingTop: 12 }}>
        <Segmented<Kind>
          options={[
            { value: 'followers', label: tr('me.followers') },
            { value: 'following', label: tr('me.following') },
          ]}
          value={kind}
          onChange={setKind}
        />
      </View>
      {loading ? (
        <ActivityIndicator color={t.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={34} color={t.textFaint} />
              <Text style={styles.emptyText}>{kind === 'followers' ? tr('social.noFollowers') : tr('social.noFollowing')}</Text>
            </View>
          }
          renderItem={({ item, index }) => (
            <FadeIn index={index}>
              <PressableScale
                onPress={() => router.push((item.id === myId ? '/profile' : `/user/${item.id}`) as never)}
                accessibilityRole="button"
                style={styles.row}
              >
                <Avatar name={item.display_name} url={item.avatar_url} size={48} />
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={styles.name} numberOfLines={1}>
                      {item.display_name}
                    </Text>
                    {item.verified && <Ionicons name="checkmark-circle" size={14} color={palette.violet} />}
                  </View>
                  <Text style={styles.meta}>@{item.username}</Text>
                </View>
                {item.id !== myId && (
                  <FollowButton following={item.i_follow} busy={busyId === item.id} onPress={() => onFollow(item)} small />
                )}
              </PressableScale>
            </FadeIn>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { padding: 20, gap: 8, paddingBottom: 40 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border,
    borderRadius: 20, padding: 12,
  },
  name: { fontFamily: font.bold, fontSize: 15, color: t.text, flexShrink: 1 },
  meta: { fontFamily: font.medium, fontSize: 12, color: t.textMuted },
  empty: { alignItems: 'center', gap: 10, marginTop: 60 },
  emptyText: { fontFamily: font.medium, fontSize: 14, color: t.textMuted },
});
