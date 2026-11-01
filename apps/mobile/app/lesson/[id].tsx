import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useTranslation } from 'react-i18next';
import { lightTheme as t, radius, space } from '@together/ui/tokens';
import { useSession } from '../../lib/session';
import { fetchMyMembership } from '../../lib/groups';
import {
  completeLesson,
  courseErrorKey,
  deleteLesson,
  fetchCompletions,
  fetchLesson,
  type Lesson,
} from '../../lib/teaching';

// Хичээл: агуулга, видео, "Дуусгасан" (+30 XP), гэрийн даалгаврыг feed-д; багшид хэдэн хүн дуусгасан.
export default function LessonPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const lessonId = String(id);
  const { t: tr } = useTranslation();
  const router = useRouter();
  const { session } = useSession();
  const myId = session?.user.id;

  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [doneBy, setDoneBy] = useState<string[]>([]);
  const [role, setRole] = useState<{ owner: boolean; member: boolean }>({ owner: false, member: false });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const l = await fetchLesson(lessonId);
      setLesson(l);
      if (l) {
        const [m, c] = await Promise.all([fetchMyMembership(l.group_id), fetchCompletions([l.id]).catch(() => new Map())]);
        const active = m?.status === 'active';
        setRole({ owner: active && m?.role === 'owner', member: active });
        setDoneBy(c.get(l.id) ?? []);
      }
    } catch (e: any) {
      Alert.alert(tr('common.error'), String(e.message ?? e));
    } finally {
      setLoading(false);
    }
  }, [lessonId, tr]);

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
  if (!lesson) {
    return (
      <View style={[styles.center, { backgroundColor: t.background }]}>
        <Text style={{ color: t.textMuted }}>{tr('courses.errors.lesson_not_found')}</Text>
      </View>
    );
  }

  const done = !!myId && doneBy.includes(myId);

  const onComplete = async () => {
    setBusy(true);
    try {
      const res = await completeLesson(lesson.id);
      setDoneBy((prev) => [...prev, myId!]);
      Alert.alert(
        res.done >= res.total ? tr('lessons.courseDone') : tr('lessons.doneTitle'),
        tr('lessons.doneBody', { xp: res.xp_gained, done: res.done, total: res.total }),
      );
    } catch (e: any) {
      const key = courseErrorKey(e);
      Alert.alert(tr('common.error'), key ? tr(key) : String(e.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const onDelete = () =>
    Alert.alert(tr('lessons.deleteTitle'), tr('lessons.deleteConfirm'), [
      { text: tr('common.cancel'), style: 'cancel' },
      {
        text: tr('feed.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteLesson(lesson.id);
            router.back();
          } catch (e: any) {
            Alert.alert(tr('common.error'), String(e.message ?? e));
          }
        },
      },
    ]);

  const homework = `${tr('lessons.homeworkPrefix', { n: lesson.position, title: lesson.title })}\n\n`;

  return (
    <ScrollView style={{ backgroundColor: t.background }} contentContainerStyle={styles.screen}>
      <Text style={{ color: t.textMuted, fontWeight: '600' }}>{tr('lessons.number', { n: lesson.position })}</Text>
      <Text style={[styles.title, { color: t.text }]}>{lesson.title}</Text>

      {!!lesson.video_url && (
        <Pressable
          onPress={() => WebBrowser.openBrowserAsync(lesson.video_url!)}
          accessibilityRole="link"
          style={[styles.secondary, { borderColor: t.border, backgroundColor: t.surface }]}
        >
          <Text style={{ color: t.text, fontWeight: '600' }}>▶ {tr('lessons.watch')}</Text>
        </Pressable>
      )}

      {!!lesson.content && <Text style={{ color: t.text, fontSize: 16, lineHeight: 24 }}>{lesson.content}</Text>}

      {role.member && !role.owner && (
        <Pressable
          style={[styles.primary, { backgroundColor: done ? t.success : t.accent, opacity: busy ? 0.6 : 1 }]}
          disabled={busy || done}
          onPress={onComplete}
          accessibilityRole="button"
        >
          <Text style={[styles.primaryText, { color: t.onAccent }]}>
            {done ? tr('lessons.completed') : tr('lessons.complete')}
          </Text>
        </Pressable>
      )}

      {role.member && (
        <Pressable
          style={[styles.secondary, { borderColor: t.border }]}
          onPress={() =>
            router.push(`/post/new?groupId=${lesson.group_id}&body=${encodeURIComponent(homework)}` as never)
          }
          accessibilityRole="button"
        >
          <Text style={{ color: t.text, fontWeight: '600' }}>
            {role.owner ? tr('lessons.postAssignment') : tr('lessons.shareHomework')}
          </Text>
        </Pressable>
      )}

      {role.owner && (
        <>
          <Text style={[styles.section, { color: t.text }]}>{tr('lessons.completedBy', { n: doneBy.length })}</Text>
          <Pressable onPress={onDelete} accessibilityRole="button" style={styles.textBtn}>
            <Text style={{ color: t.warning }}>{tr('lessons.delete')}</Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  screen: { padding: space.lg, gap: space.sm, paddingBottom: space.xl },
  title: { fontSize: 26, fontWeight: '700', marginBottom: space.sm },
  section: { fontSize: 15, fontWeight: '600', marginTop: space.lg },
  primary: { borderRadius: radius.pill, paddingVertical: 16, alignItems: 'center', marginTop: space.lg },
  primaryText: { fontSize: 16, fontWeight: '600' },
  secondary: { borderWidth: 1, borderRadius: radius.pill, paddingVertical: 12, alignItems: 'center', marginTop: space.sm },
  textBtn: { alignItems: 'center', paddingVertical: space.md },
});
