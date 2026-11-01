import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { font, lightTheme as t, palette, radius, shadow } from '@together/ui/tokens';
import { ProgressRing } from '../../components/ui';
import { fetchMyProfile } from '../../lib/account';
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
import { fetchMyUpcomingSessions, statusOf as sessionStatus, type Session } from '../../lib/sessions';
import { formatDateTime } from '../../lib/time';

const EMPTY_PROGRESS: Progress = { total_xp: 0, current_level: 1, current_streak: 0, longest_streak: 0 };

// Өнөөдөр: XP/level/streak, идэвхтэй challenge-ийн check-in, өдрийн зорилгууд.
export default function Home() {
  const { t: tr } = useTranslation();
  const router = useRouter();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [doneToday, setDoneToday] = useState<Set<string>>(new Set());
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [checkedToday, setCheckedToday] = useState<Set<string>>(new Set());
  const [sessions, setSessions] = useState<Session[]>([]);
  const [name, setName] = useState('');
  const [progress, setProgress] = useState<Progress>(EMPTY_PROGRESS);
  const [newTitle, setNewTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const today = todayIso();

  const load = useCallback(async () => {
    try {
      fetchMyProfile()
        .then((p) => setName(p?.display_name ?? ''))
        .catch(() => {});
      fetchMyUpcomingSessions()
        .then(setSessions)
        .catch(() => setSessions([]));
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

  // Түвшний томьёо: L түвшин 100·(L−1)² XP-ээс эхэлнэ (сервертэй ижил).
  const levelStart = 100 * (progress.current_level - 1) ** 2;
  const levelNext = 100 * progress.current_level ** 2;
  const levelProgress = (progress.total_xp - levelStart) / Math.max(1, levelNext - levelStart);
  const doneCount = goals.filter((g) => doneToday.has(g.id)).length;

  const header = (
    <View style={{ gap: 14, marginBottom: 6 }}>
      <View style={styles.greetRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.greetSmall}>{tr('home.greeting')}</Text>
          <Text style={styles.greetName} numberOfLines={1}>
            {name || 'TOGETHER'}
          </Text>
        </View>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{(name || 'T').slice(0, 1).toUpperCase()}</Text>
        </View>
      </View>

      {/* Hero: түвшин, XP, streak */}
      <View style={[styles.hero, shadow.card]}>
        <ProgressRing progress={levelProgress} size={104}>
          <Text style={styles.ringLevel}>{progress.current_level}</Text>
          <Text style={styles.ringCaption}>{tr('home.level')}</Text>
        </ProgressRing>
        <View style={{ flex: 1, gap: 10 }}>
          <View>
            <Text style={styles.heroValue}>
              {progress.total_xp} <Text style={styles.heroUnit}>XP</Text>
            </Text>
            <Text style={styles.heroMuted}>{tr('home.toNext', { n: Math.max(0, levelNext - progress.total_xp) })}</Text>
          </View>
          <View style={styles.heroRow}>
            <View style={styles.heroChip}>
              <Text style={styles.heroChipText}>🔥 {progress.current_streak}</Text>
            </View>
            <View style={styles.heroChip}>
              <Text style={styles.heroChipText}>
                ✓ {doneCount}/{goals.length}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {sessions.length > 0 && (
        <>
          <Text style={styles.section}>{tr('sessions.upcoming')}</Text>
          {sessions.map((se) => (
            <Pressable
              key={se.id}
              onPress={() => router.push(`/session/${se.id}` as never)}
              accessibilityRole="button"
              style={[styles.row, shadow.card]}
            >
              <View style={[styles.iconBubble, { backgroundColor: '#F1E9D8' }]}>
                <Ionicons name={sessionStatus(se) === 'live' ? 'radio' : 'calendar-outline'} size={18} color={t.text} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{se.title}</Text>
                <Text style={styles.rowMeta}>
                  {sessionStatus(se) === 'live' ? tr('sessions.status.live') : formatDateTime(se.starts_at)}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={t.textMuted} />
            </Pressable>
          ))}
        </>
      )}

      {challenges.length > 0 && (
        <>
          <Text style={styles.section}>{tr('challenges.mine')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: 4 }}>
            {challenges.map((c) => {
              const done = checkedToday.has(c.id);
              const day = dayNumber(c, today);
              const total = totalDays(c);
              return (
                <Pressable
                  key={c.id}
                  onPress={() => router.push(`/challenge/${c.id}` as never)}
                  accessibilityRole="button"
                  style={[styles.challengeCard, shadow.card]}
                >
                  <Text style={styles.rowTitle} numberOfLines={2}>
                    {c.title}
                  </Text>
                  <View style={styles.track}>
                    <View style={[styles.fill, { width: `${Math.min(100, (day / total) * 100)}%` }]} />
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={styles.rowMeta}>{tr('challenges.statusActive', { day, total })}</Text>
                    <Pressable
                      onPress={() => !done && onCheckIn(c)}
                      disabled={done || busyId !== null}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: done }}
                      accessibilityLabel={tr('challenges.checkIn')}
                      style={[styles.checkBtn, { backgroundColor: done ? t.success : t.accent }]}
                    >
                      <Text style={styles.checkText}>{done ? '✓' : '+25'}</Text>
                    </Pressable>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </>
      )}

      <Text style={styles.section}>{tr('home.todayGoals')}</Text>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <FlatList
        data={goals}
        keyExtractor={(g) => g.id}
        ListHeaderComponent={header}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={[styles.empty]}>
            <Text style={styles.rowMeta}>{tr('home.noGoals')}</Text>
          </View>
        }
        renderItem={({ item }) => {
          const done = doneToday.has(item.id);
          return (
            <Pressable
              onPress={() => !done && busyId === null && onComplete(item)}
              onLongPress={() => onArchive(item)}
              disabled={busyId !== null}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: done }}
              style={[styles.row, shadow.card]}
            >
              <View style={[styles.checkbox, done && { backgroundColor: t.success, borderColor: t.success }]}>
                {done && <Ionicons name="checkmark" size={16} color={t.background} />}
              </View>
              <Text style={[styles.rowTitle, { flex: 1 }, done && styles.doneText]}>{item.title}</Text>
              <Text style={[styles.xpTag, done && { opacity: 0.5 }]}>+20</Text>
            </Pressable>
          );
        }}
        ListFooterComponent={
          goals.length > 0 ? <Text style={[styles.rowMeta, { textAlign: 'center', marginTop: 4 }]}>{tr('goals.hint')}</Text> : null
        }
      />

      <View style={styles.addBar}>
        <TextInput
          style={styles.addInput}
          value={newTitle}
          onChangeText={setNewTitle}
          placeholder={tr('home.addPlaceholder')}
          placeholderTextColor="#9AA2AD"
          maxLength={120}
          returnKeyType="done"
          onSubmitEditing={onAdd}
          accessibilityLabel={tr('home.addPlaceholder')}
        />
        <Pressable style={styles.addBtn} onPress={onAdd} accessibilityRole="button" accessibilityLabel={tr('home.addPlaceholder')}>
          <Ionicons name="add" size={26} color={t.onAccent} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 20, paddingTop: 60, gap: 10, paddingBottom: 24 },
  greetRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  greetSmall: { fontFamily: font.medium, fontSize: 14, color: '#5B6573' },
  greetName: { fontFamily: font.extrabold, fontSize: 26, color: t.text, letterSpacing: -0.3 },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: font.extrabold, fontSize: 18, color: t.onAccent },
  hero: { backgroundColor: palette.midnightNavy, borderRadius: radius.lg, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 18 },
  ringLevel: { fontFamily: font.extrabold, fontSize: 30, color: palette.warmIvory, lineHeight: 34 },
  ringCaption: { fontFamily: font.medium, fontSize: 11, color: 'rgba(244,240,231,0.7)' },
  heroValue: { fontFamily: font.extrabold, fontSize: 28, color: palette.warmIvory },
  heroUnit: { fontFamily: font.bold, fontSize: 16, color: t.accent },
  heroMuted: { fontFamily: font.medium, fontSize: 13, color: 'rgba(244,240,231,0.7)' },
  heroRow: { flexDirection: 'row', gap: 8 },
  heroChip: { backgroundColor: 'rgba(244,240,231,0.1)', borderRadius: radius.pill, paddingVertical: 6, paddingHorizontal: 12 },
  heroChipText: { fontFamily: font.bold, fontSize: 14, color: palette.warmIvory },
  section: { fontFamily: font.bold, fontSize: 18, color: t.text, marginTop: 8 },
  row: {
    backgroundColor: t.surface, borderRadius: 16, borderWidth: 1, borderColor: '#EFEAE0',
    paddingVertical: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  rowTitle: { fontFamily: font.semibold, fontSize: 16, color: t.text },
  rowMeta: { fontFamily: font.medium, fontSize: 13, color: '#5B6573' },
  iconBubble: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  challengeCard: {
    width: 220, backgroundColor: t.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: '#EFEAE0', padding: 16, gap: 12,
  },
  track: { height: 6, borderRadius: 3, backgroundColor: '#EFEAE0', overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3, backgroundColor: t.accent },
  checkBtn: { minWidth: 56, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  checkText: { fontFamily: font.extrabold, color: t.onAccent, fontSize: 14 },
  checkbox: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: '#D5CDBD', alignItems: 'center', justifyContent: 'center' },
  doneText: { color: '#5B6573', textDecorationLine: 'line-through' },
  xpTag: { fontFamily: font.bold, fontSize: 13, color: '#8A6F3D', backgroundColor: '#F4ECDC', borderRadius: radius.pill, paddingVertical: 4, paddingHorizontal: 10, overflow: 'hidden' },
  empty: { backgroundColor: t.surface, borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: '#D5CDBD', padding: 20, alignItems: 'center' },
  addBar: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, backgroundColor: t.background, borderTopWidth: 1, borderTopColor: '#EFEAE0' },
  addInput: {
    flex: 1, height: 52, borderRadius: radius.md, borderWidth: 1, borderColor: '#E3DDCF', backgroundColor: t.surface,
    paddingHorizontal: 14, fontFamily: font.medium, fontSize: 16, color: t.text,
  },
  addBtn: { width: 52, height: 52, borderRadius: 26, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center' },
});
