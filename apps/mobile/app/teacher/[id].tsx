import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { font, lightTheme as t, radius, space } from '@together/ui/tokens';
import { useSession } from '../../lib/session';
import { promptReport } from '../../lib/moderation';
import { fetchTeacher, stars, type TeacherProfile, type TeacherStats } from '../../lib/teaching';
import type { GroupSummary } from '../../lib/groups';

// Багшийн нийтийн профайл: танилцуулга, нэр хүнд (сургалт, суралцагч, Тустай), сургалтууд.
export default function TeacherPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const userId = String(id);
  const { t: tr } = useTranslation();
  const router = useRouter();
  const { session } = useSession();
  const [data, setData] = useState<{ profile: TeacherProfile; stats: TeacherStats; courses: GroupSummary[] } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setData(await fetchTeacher(userId));
    } catch (e: any) {
      Alert.alert(tr('common.error'), String(e.message ?? e));
    } finally {
      setLoading(false);
    }
  }, [userId, tr]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: t.background }]}>
        <ActivityIndicator color={t.accent} />
      </View>
    );
  }
  if (!data) {
    return (
      <View style={[styles.center, { backgroundColor: t.background }]}>
        <Text style={{ color: t.textMuted }}>{tr('teachers.notFound')}</Text>
      </View>
    );
  }

  const { profile, stats, courses } = data;

  return (
    <ScrollView style={{ backgroundColor: t.background }} contentContainerStyle={styles.screen}>
      <Text style={[styles.title, { color: t.text }]}>{profile.display_name}</Text>
      {profile.verified_at && <Text style={{ color: t.text, fontFamily: font.semibold }}>✓ {tr('teach.verified')}</Text>}
      {!!profile.headline && <Text style={{ color: t.text, fontSize: 16 }}>{profile.headline}</Text>}

      <View style={styles.tags}>
        {profile.subjects.map((s) => (
          <Text key={s} style={[styles.tag, { backgroundColor: t.surfaceMuted, color: t.text }]}>
            {s}
          </Text>
        ))}
      </View>

      <View style={[styles.stats, { backgroundColor: t.surface, borderColor: t.border }]}>
        <Stat label={tr('teachers.courses')} value={stats.courses} />
        <Stat label={tr('teachers.students')} value={stats.students} />
        <Stat label={tr('feed.helpful')} value={stats.helpful} />
      </View>
      <Text style={{ color: t.text, textAlign: 'center' }}>
        {stats.rating_count > 0
          ? `${stars(Number(stats.rating_avg ?? 0))} ${Number(stats.rating_avg ?? 0).toFixed(1)} · ${tr('reviews.count', { n: stats.rating_count })}`
          : tr('reviews.noneYet')}
      </Text>

      {!!profile.intro && <Text style={{ color: t.text, lineHeight: 21 }}>{profile.intro}</Text>}

      <Text style={[styles.section, { color: t.text }]}>{tr('teachers.courseList')}</Text>
      {courses.length === 0 && <Text style={{ color: t.textMuted }}>{tr('teachers.noCourses')}</Text>}
      {courses.map((c) => (
        <Pressable
          key={c.id}
          onPress={() => router.push(`/group/${c.id}` as never)}
          accessibilityRole="button"
          style={[styles.card, { borderColor: t.border, backgroundColor: t.surface }]}
        >
          <Text style={{ color: t.text, fontFamily: font.bold }}>📚 {c.name}</Text>
          {!!c.description && (
            <Text style={{ color: t.textMuted }} numberOfLines={2}>
              {c.description}
            </Text>
          )}
        </Pressable>
      ))}

      {session?.user.id !== userId && (
        <Pressable onPress={() => promptReport('profile', userId)} accessibilityRole="button" style={styles.textBtn}>
          <Text style={{ color: t.textMuted }}>{tr('teachers.report')}</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={{ color: t.text, fontSize: 22, fontFamily: font.bold }}>{value}</Text>
      <Text style={{ color: t.textMuted, fontSize: 12 }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  screen: { padding: space.lg, gap: space.sm, paddingBottom: space.xl },
  title: { fontSize: 26, fontFamily: font.bold },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  tag: { borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 2, fontSize: 12, overflow: 'hidden' },
  stats: { flexDirection: 'row', borderWidth: 1, borderRadius: radius.lg, padding: space.md, marginVertical: space.sm },
  section: { fontSize: 16, fontFamily: font.semibold, marginTop: space.md },
  card: { borderWidth: 1, borderRadius: radius.md, padding: space.md, gap: 4 },
  textBtn: { alignItems: 'center', paddingVertical: space.md },
});
