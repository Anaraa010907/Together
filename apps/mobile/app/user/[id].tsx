import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { font, lightTheme as t, palette } from '@together/ui/tokens';
import { Avatar } from '../../components/Avatar';
import { Backdrop } from '../../components/Backdrop';
import { FollowButton } from '../../components/FollowButton';
import { FadeIn, PressableScale } from '../../components/motion';
import { useSession } from '../../lib/session';
import { promptMemberActions } from '../../lib/moderation';
import { compact, fetchProfileStats, fetchPublicProfile, follow, unfollow, type ProfileStats } from '../../lib/social';

// Бусдын профайл: зураг, статистик, дагах, мэдээлэх/блоклох.
export default function UserProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const userId = String(id);
  const { t: tr } = useTranslation();
  const router = useRouter();
  const { session } = useSession();
  const [profile, setProfile] = useState<Awaited<ReturnType<typeof fetchPublicProfile>>>(null);
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, s] = await Promise.all([fetchPublicProfile(userId), fetchProfileStats(userId)]);
      setProfile(p);
      setStats(s);
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
          {!!profile.bio && <Text style={styles.bio}>{profile.bio}</Text>}
        </FadeIn>

        <FadeIn index={1}>
          <View style={styles.stats}>
            <Stat label={tr('me.posts')} value={stats.posts} />
            <View style={styles.divider} />
            <Stat label={tr('me.followers')} value={stats.followers} />
            <View style={styles.divider} />
            <Stat label={tr('me.following')} value={stats.following} />
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
              <PressableScale
                onPress={() => promptMemberActions(profile.display_name, userId, () => router.back())}
                accessibilityRole="button"
                accessibilityLabel={tr('common.more')}
                style={styles.more}
              >
                <Ionicons name="ellipsis-horizontal" size={20} color={t.text} />
              </PressableScale>
            </View>
          )}
        </FadeIn>
      </ScrollView>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
      <Text style={styles.statValue}>{compact(value)}</Text>
      <Text style={styles.statLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.background },
  screen: { padding: 20, paddingTop: 110, gap: 20, paddingBottom: 48 },
  name: { fontFamily: font.extrabold, fontSize: 26, color: t.text },
  username: { fontFamily: font.medium, fontSize: 14, color: t.textMuted },
  bio: { fontFamily: font.medium, fontSize: 14, color: 'rgba(255,255,255,0.85)', textAlign: 'center', marginTop: 6, lineHeight: 20 },
  stats: { flexDirection: 'row', alignItems: 'center' },
  divider: { width: 1, height: 32, backgroundColor: t.border },
  statValue: { fontFamily: font.extrabold, fontSize: 20, color: t.text },
  statLabel: { fontFamily: font.medium, fontSize: 12, color: t.textMuted },
  more: {
    width: 46, height: 46, borderRadius: 23, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border,
    alignItems: 'center', justifyContent: 'center',
  },
  muted: { fontFamily: font.medium, fontSize: 14, color: t.textMuted },
});
