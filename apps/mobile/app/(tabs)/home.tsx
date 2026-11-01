import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { lightTheme as t, radius, space } from '@together/ui/tokens';
import {
  archiveGoal,
  completeGoal,
  createGoal,
  fetchActiveGoals,
  fetchCompletionsOn,
  fetchProgress,
  todayIso,
  type Goal,
  type Progress,
} from '../../lib/goals';
import {
  challengeErrorKey,
  checkInChallenge,
  dayNumber,
  fetchMyChallenges,
  fetchMyCheckinsOn,
  statusOf,
  totalDays,
  type Challenge,
} from '../../lib/challenges';

const EMPTY_PROGRESS: Progress = { total_xp: 0, current_level: 1, current_streak: 0, longest_streak: 0 };

// Өнөөдөр: XP/level/streak, идэвхтэй challenge-ийн check-in, өдрийн зорилгууд.
export default function Home() {
  const { t: tr } = useTranslation();
  const router = useRouter();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [doneToday, setDoneToday] = useState<Set<string>>(new Set());
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [checkedToday, setCheckedToday] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<Progress>(EMPTY_PROGRESS);
  const [newTitle, setNewTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const today = todayIso();

  const load = useCallback(async () => {
    try {
      const [g, d, p, c, ci] = await Promise.all([
        fetchActiveGoals(),
        fetchCompletionsOn(today),
        fetchProgress(),
        fetchMyChallenges().catch(() => [] as Challenge[]),
        fetchMyCheckinsOn(today).catch(() => new Set<string>()),
      ]);
      setGoals(g);
      setDoneToday(d);
      setProgress(p);
      setChallenges(c.filter((x) => statusOf(x, today) === 'active'));
      setCheckedToday(ci);
    } catch (e: any) {
      Alert.alert(tr('common.error'), String(e.message ?? e));
    } finally {
      setLoading(false);
    }
  }, [today, tr]);

  // Challenge-д өөр дэлгэцээс нэгдээд буцахад шинэчлэгдэнэ.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onComplete = async (goal: Goal) => {
    setBusyId(goal.id);
    try {
      const res = await completeGoal(goal.id, today);
      setDoneToday((prev) => new Set(prev).add(goal.id));
      setProgress((p) => ({
        ...p,
        total_xp: res.total_xp,
        current_level: res.level,
        current_streak: res.streak,
        longest_streak: Math.max(p.longest_streak, res.streak),
      }));
    } catch (e: any) {
      const msg = String(e.message ?? e);
      if (msg.includes('already_completed')) {
        setDoneToday((prev) => new Set(prev).add(goal.id));
      } else {
        Alert.alert(tr('common.error'), msg);
      }
    } finally {
      setBusyId(null);
    }
  };

  const onCheckIn = async (c: Challenge) => {
    setBusyId(c.id);
    try {
      const res = await checkInChallenge(c.id, today);
      setCheckedToday((prev) => new Set(prev).add(c.id));
      setProgress((p) => ({ ...p, total_xp: res.total_xp, current_level: res.level }));
      if (res.completed && res.xp_gained > 25) {
        Alert.alert(tr('challenges.completedTitle'), tr('challenges.completedBody', { xp: res.xp_gained }));
      }
    } catch (e: any) {
      const key = challengeErrorKey(e);
      if (key === 'challenges.errors.already_checked_in') {
        setCheckedToday((prev) => new Set(prev).add(c.id));
      } else {
        Alert.alert(tr('common.error'), key ? tr(key) : String(e.message ?? e));
      }
    } finally {
      setBusyId(null);
    }
  };

  // Удаан дарж архивлах: өмнөх биелэлт ба XP хэвээр үлдэнэ.
  const onArchive = (goal: Goal) => {
    Alert.alert(tr('goals.archiveTitle'), tr('goals.archiveConfirm'), [
      { text: tr('common.cancel'), style: 'cancel' },
      {
        text: tr('goals.archive'),
        style: 'destructive',
        onPress: async () => {
          try {
            await archiveGoal(goal.id);
            setGoals((prev) => prev.filter((g) => g.id !== goal.id));
          } catch (e: any) {
            Alert.alert(tr('common.error'), String(e.message ?? e));
          }
        },
      },
    ]);
  };

  const onAdd = async () => {
    const title = newTitle.trim();
    if (title.length < 1 || title.length > 120) {
      Alert.alert(tr('common.error'), tr('goals.titleInvalid'));
      return;
    }
    try {
      await createGoal(title);
      setNewTitle('');
      await load();
    } catch (e: any) {
      Alert.alert(tr('common.error'), String(e.message ?? e));
    }
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: t.background }]}>
        <ActivityIndicator color={t.accent} />
      </View>
    );
  }

  const header = (
    <View style={{ gap: space.sm, marginBottom: space.sm }}>
      {challenges.length > 0 && (
        <>
          <Text style={[styles.section, { color: t.text }]}>{tr('challenges.mine')}</Text>
          {challenges.map((c) => {
            const done = checkedToday.has(c.id);
            return (
              <Pressable
                key={c.id}
                onPress={() => router.push(`/challenge/${c.id}` as never)}
                accessibilityRole="button"
                style={[styles.goal, styles.challengeRow, { backgroundColor: t.surface, borderColor: t.border }]}
              >
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={[styles.goalTitle, { color: t.text }]}>{c.title}</Text>
                  <Text style={[styles.goalMeta, { color: t.textMuted }]}>
                    {tr('challenges.statusActive', { day: dayNumber(c, today), total: totalDays(c) })}
                  </Text>
                </View>
                <Pressable
                  onPress={() => !done && onCheckIn(c)}
                  disabled={done || busyId !== null}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: done }}
                  accessibilityLabel={tr('challenges.checkIn')}
                  style={[styles.checkBtn, { backgroundColor: done ? t.success : t.accent }]}
                >
                  <Text style={{ color: t.onAccent, fontWeight: '700' }}>{done ? '✓' : '+25'}</Text>
                </Pressable>
              </Pressable>
            );
          })}
        </>
      )}
      <Text style={[styles.section, { color: t.text }]}>{tr('home.todayGoals')}</Text>
    </View>
  );

  return (
    <View style={[styles.screen, { backgroundColor: t.background }]}>
      <View style={[styles.stats, { backgroundColor: t.surface, borderColor: t.border }]}>
        <Stat label={tr('xp.label')} value={String(progress.total_xp)} />
        <Stat label={tr('home.level')} value={String(progress.current_level)} />
        <Stat label={tr('home.streak')} value={String(progress.current_streak)} />
      </View>

      <FlatList
        data={goals}
        keyExtractor={(g) => g.id}
        ListHeaderComponent={header}
        contentContainerStyle={{ gap: space.sm, paddingBottom: space.md }}
        ListEmptyComponent={<Text style={{ color: t.textMuted }}>{tr('home.noGoals')}</Text>}
        renderItem={({ item }) => {
          const done = doneToday.has(item.id);
          return (
            <Pressable
              onPress={() => !done && busyId === null && onComplete(item)}
              onLongPress={() => onArchive(item)}
              disabled={busyId !== null}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: done }}
              style={[styles.goal, { backgroundColor: done ? t.success : t.surface, borderColor: t.border }]}
            >
              <Text style={[styles.goalTitle, { color: t.text }]}>{item.title}</Text>
              <Text style={[styles.goalMeta, { color: t.textMuted }]}>
                {done ? tr('home.doneLabel') : `+20 ${tr('xp.label')}`}
              </Text>
            </Pressable>
          );
        }}
      />

      <View style={styles.addRow}>
        <TextInput
          style={[styles.input, { borderColor: t.border, backgroundColor: t.surface, color: t.text }]}
          value={newTitle}
          onChangeText={setNewTitle}
          placeholder={tr('home.addPlaceholder')}
          placeholderTextColor={t.textMuted}
          maxLength={120}
          accessibilityLabel={tr('home.addPlaceholder')}
        />
        <Pressable style={[styles.addBtn, { backgroundColor: t.accent }]} onPress={onAdd} accessibilityRole="button">
          <Text style={[styles.addText, { color: t.onAccent }]}>+</Text>
        </Pressable>
      </View>

      {goals.length > 0 && <Text style={[styles.hint, { color: t.textMuted }]}>{tr('goals.hint')}</Text>}
    </View>
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
  screen: { flex: 1, padding: space.lg, gap: space.md, paddingTop: 64 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  stats: { flexDirection: 'row', borderWidth: 1, borderRadius: radius.lg, padding: space.md },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: '700' },
  section: { fontSize: 18, fontWeight: '600', marginTop: space.sm },
  goal: { borderWidth: 1, borderRadius: radius.md, padding: space.md, gap: 4 },
  challengeRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  checkBtn: { minWidth: 52, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  goalTitle: { fontSize: 16, fontWeight: '600' },
  goalMeta: { fontSize: 13 },
  addRow: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  input: { flex: 1, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: 12, fontSize: 16 },
  addBtn: { width: 48, height: 48, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  addText: { fontSize: 24, fontWeight: '700' },
  hint: { fontSize: 12, textAlign: 'center' },
});
