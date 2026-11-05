import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { font, gradients, lightTheme as t, palette, radius, shadow } from '@together/ui/tokens';
import { AnimatedRing, FadeIn, Pop, PressableScale } from '../../components/motion';
import { TAB_BAR_SPACE } from '../../components/TabBar';
import { Backdrop } from '../../components/Backdrop';
import { DriftingOrb, TogetherArt } from '../../components/Illustrations';
import { Avatar } from '../../components/Avatar';
import { SectionHeader } from '../../components/ui';
import { categoryName, fetchCategories, fetchMyInterests, type Category } from '../../lib/interests';
import { fetchMyProfile } from '../../lib/account';
import { fetchUnreadCount } from '../../lib/notifications';
import { fetchProfileStats } from '../../lib/social';
import {
  archiveGoal,
  completeGoal,
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

// Нүүр: мэндчилгээ, хайлт, түвшний карт, сонирхол, өнөөдрийн зорилтууд, сешн, "Хамтдаа хөгжие" баннер.
export default function Home() {
  const { t: tr } = useTranslation();
  const router = useRouter();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [doneToday, setDoneToday] = useState<Set<string>>(new Set());
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [checkedToday, setCheckedToday] = useState<Set<string>>(new Set());
  const [sessions, setSessions] = useState<Session[]>([]);
  const [name, setName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const [unread, setUnread] = useState(0);
  const [progress, setProgress] = useState<Progress>(EMPTY_PROGRESS);
  const [categories, setCategories] = useState<Category[]>([]);
  const [myInterests, setMyInterests] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const today = todayIso();

  const load = useCallback(async () => {
    try {
      fetchMyProfile()
        .then((p) => {
          setName(p?.display_name ?? '');
          setAvatarUrl(p?.avatar_url ?? null);
          if (p) fetchProfileStats(p.id).then((s) => setVerified(!!s?.verified)).catch(() => {});
        })
        .catch(() => {});
      fetchUnreadCount().then(setUnread).catch(() => setUnread(0));
      // Миний сонирхол эхэнд.
      Promise.all([fetchCategories(), fetchMyInterests().catch(() => [] as string[])])
        .then(([cats, mine]) => {
          const set = new Set(mine);
          setMyInterests(set);
          setCategories([...cats].sort((a, b) => Number(set.has(b.id)) - Number(set.has(a.id))));
        })
        .catch(() => setCategories([]));
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
      setRefreshing(false);
    }
  }, [today, tr]);

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
  const doneCount = goals.filter((g) => doneToday.has(g.id)).length + challenges.filter((c) => checkedToday.has(c.id)).length;
  const taskCount = goals.length + challenges.length;
  const myCats = categories.filter((c) => myInterests.has(c.id));
  const chipCats = (myCats.length ? myCats : categories).slice(0, 6);
  let row = 0;

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <Backdrop />
      <ScrollView
        contentContainerStyle={styles.screen}
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
        {/* Мэндчилгээ */}
        <FadeIn index={row++}>
          <View style={styles.greetRow}>
            <PressableScale onPress={() => router.push('/profile' as never)} accessibilityRole="button">
              <Avatar name={name || 'T'} url={avatarUrl} size={50} ring />
            </PressableScale>
            <View style={{ flex: 1 }}>
              <Text style={styles.greetSmall}>{tr('home.greeting')} 👋</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.greetName} numberOfLines={1}>
                  {name || 'TOGETHER'}
                </Text>
                {verified && <Ionicons name="checkmark-circle" size={20} color={palette.violet} />}
              </View>
            </View>
            <PressableScale
              onPress={() => router.push('/notifications' as never)}
              accessibilityRole="button"
              accessibilityLabel={tr('notifications.title')}
              style={styles.bell}
            >
              <Ionicons name="notifications-outline" size={23} color={t.text} />
              {unread > 0 && (
                <LinearGradient colors={gradients.sunset} style={styles.badge}>
                  <Text style={styles.badgeText}>{unread > 9 ? '9+' : unread}</Text>
                </LinearGradient>
              )}
            </PressableScale>
          </View>
        </FadeIn>

        {/* Хайлт */}
        <FadeIn index={row++}>
          <View style={styles.searchRow}>
            <PressableScale onPress={() => router.push('/search' as never)} accessibilityRole="search" style={[styles.search, { flex: 1 }]}>
              <Ionicons name="search" size={19} color={t.textMuted} />
              <Text style={styles.searchText} numberOfLines={1}>
                {tr('home.searchPlaceholder')}
              </Text>
            </PressableScale>
            <PressableScale
              onPress={() => router.push('/interests?edit=1' as never)}
              accessibilityRole="button"
              accessibilityLabel={tr('interests.edit')}
              style={styles.filterBtn}
            >
              <Ionicons name="options-outline" size={21} color={t.text} />
            </PressableScale>
          </View>
        </FadeIn>

        {/* Түвшний карт */}
        <FadeIn index={row++}>
          <PressableScale onPress={() => router.push('/me/xp' as never)} accessibilityRole="button" scaleTo={0.98}>
            <LinearGradient colors={gradients.card} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.levelCard}>
              <DriftingOrb size={180} color="#FF8A3D" opacity={0.35} style={{ right: -50, top: -60 }} />
              <DriftingOrb size={140} color="#8B5CF6" opacity={0.4} style={{ left: -40, bottom: -60 }} />
              <LinearGradient colors={gradients.sunset} style={styles.trendTile}>
                <Ionicons name="trending-up" size={20} color="#FFFFFF" />
              </LinearGradient>
              <View style={styles.levelRow}>
                <AnimatedRing progress={levelProgress} size={112} stroke={10}>
                  <Text style={styles.ringLevel}>{progress.current_level}</Text>
                  <Text style={styles.ringCaption}>{tr('home.level')}</Text>
                </AnimatedRing>
                <View style={{ flex: 1, gap: 6 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="star" size={20} color={palette.amber} />
                    <Text style={styles.xpValue}>{progress.total_xp} XP</Text>
                  </View>
                  <Text style={styles.xpMuted}>{tr('home.toNext', { n: Math.max(0, levelNext - progress.total_xp) })}</Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                    <View style={styles.statChip}>
                      <Text style={styles.statChipText}>🔥 {progress.current_streak}</Text>
                    </View>
                    <View style={[styles.statChip, styles.statChipViolet]}>
                      <Ionicons name="checkmark" size={14} color={palette.lilac} />
                      <Text style={styles.statChipText}>
                        {doneCount}/{taskCount}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            </LinearGradient>
          </PressableScale>
        </FadeIn>

        {/* Сонирхлоор судлах */}
        {chipCats.length > 0 && (
          <FadeIn index={row++} style={{ gap: 12 }}>
            <SectionHeader title={tr('home.explore')} action={tr('home.seeAll')} onAction={() => router.push('/groups' as never)} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={{ marginHorizontal: -20 }}>
              {chipCats.map((c, i) => (
                <PressableScale
                  key={c.id}
                  onPress={() => router.push({ pathname: '/groups', params: { category: c.id } } as never)}
                  accessibilityRole="button"
                >
                  {i === 0 ? (
                    <LinearGradient colors={['rgba(168,85,247,0.55)', 'rgba(124,58,237,0.35)']} style={[styles.catChip, styles.catChipActive]}>
                      <Text style={{ fontSize: 15 }}>{c.icon}</Text>
                      <Text style={styles.catText}>{categoryName(c)}</Text>
                    </LinearGradient>
                  ) : (
                    <View style={styles.catChip}>
                      <Text style={{ fontSize: 15 }}>{c.icon}</Text>
                      <Text style={styles.catText}>{categoryName(c)}</Text>
                    </View>
                  )}
                </PressableScale>
              ))}
              <PressableScale
                onPress={() => router.push('/interests?edit=1' as never)}
                accessibilityRole="button"
                accessibilityLabel={tr('interests.edit')}
                style={styles.catPlus}
              >
                <Ionicons name="add" size={20} color={t.text} />
              </PressableScale>
            </ScrollView>
          </FadeIn>
        )}

        {/* Өнөөдрийн зорилтууд */}
        <FadeIn index={row++}>
          <View style={styles.sectionRow}>
            <Text style={styles.section}>✨ {tr('home.todayGoals')}</Text>
            {taskCount > 0 && (
              <Text style={styles.count}>
                {doneCount}/{taskCount}
              </Text>
            )}
          </View>
        </FadeIn>

        {challenges.map((c) => {
          const checked = checkedToday.has(c.id);
          const day = dayNumber(c, today);
          const total = totalDays(c);
          return (
            <FadeIn key={c.id} index={row++}>
              <PressableScale onPress={() => router.push(`/challenge/${c.id}` as never)} accessibilityRole="button" style={styles.task}>
                <LinearGradient colors={['rgba(251,191,36,0.28)', 'rgba(255,138,61,0.12)']} style={styles.taskIcon}>
                  <Text style={{ fontSize: 24 }}>🏆</Text>
                </LinearGradient>
                <View style={{ flex: 1, gap: 6 }}>
                  <Text style={styles.taskTitle} numberOfLines={2}>
                    {c.title}
                  </Text>
                  <Text style={styles.taskXp}>
                    +25 XP · {tr('challenges.statusActive', { day, total })}
                  </Text>
                  <View style={styles.track}>
                    <LinearGradient
                      colors={gradients.brand}
                      start={{ x: 0, y: 0.5 }}
                      end={{ x: 1, y: 0.5 }}
                      style={[styles.fill, { width: `${Math.min(100, (day / Math.max(1, total)) * 100)}%` }]}
                    />
                  </View>
                </View>
                <PressableScale
                  onPress={() => !checked && busyId === null && onCheckIn(c)}
                  disabled={checked || busyId !== null}
                  accessibilityRole="button"
                  accessibilityLabel={checked ? tr('challenges.checkedIn') : tr('challenges.checkIn')}
                  style={[styles.arrowBtn, checked && { backgroundColor: 'rgba(52,211,153,0.2)', borderColor: 'rgba(52,211,153,0.5)' }]}
                >
                  {busyId === c.id ? (
                    <ActivityIndicator size="small" color={t.text} />
                  ) : (
                    <Pop trigger={checked}>
                      <Ionicons name={checked ? 'checkmark' : 'arrow-forward'} size={18} color={checked ? palette.mint : t.text} />
                    </Pop>
                  )}
                </PressableScale>
              </PressableScale>
            </FadeIn>
          );
        })}

        {goals.map((g) => {
          const done = doneToday.has(g.id);
          return (
            <FadeIn key={g.id} index={row++}>
              <PressableScale
                onPress={() => !done && busyId === null && onComplete(g)}
                onLongPress={() => onArchive(g)}
                disabled={busyId !== null}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: done }}
                style={[styles.task, done && styles.taskDone]}
              >
                <LinearGradient
                  colors={done ? ['rgba(52,211,153,0.3)', 'rgba(14,165,233,0.12)'] : ['rgba(168,85,247,0.35)', 'rgba(236,72,153,0.14)']}
                  style={styles.taskIcon}
                >
                  <Text style={{ fontSize: 22 }}>{done ? '✅' : '🎯'}</Text>
                </LinearGradient>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={[styles.taskTitle, done && styles.doneText]} numberOfLines={2}>
                    {g.title}
                  </Text>
                  <Text style={[styles.taskXp, done && { color: palette.mint }]}>{done ? tr('home.doneLabel') : '+20 XP'}</Text>
                </View>
                <Pop trigger={done}>
                  {done ? (
                    <LinearGradient colors={['#34D399', '#10B981']} style={styles.check}>
                      <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                    </LinearGradient>
                  ) : busyId === g.id ? (
                    <View style={styles.check}>
                      <ActivityIndicator size="small" color={t.text} />
                    </View>
                  ) : (
                    <View style={[styles.check, styles.checkEmpty]} />
                  )}
                </Pop>
              </PressableScale>
            </FadeIn>
          );
        })}

        <FadeIn index={row++}>
          <PressableScale onPress={() => router.push('/goal/new' as never)} accessibilityRole="button" style={styles.addRow}>
            <View style={styles.addIcon}>
              <Ionicons name="add" size={20} color={palette.lilac} />
            </View>
            <Text style={styles.addText}>{taskCount === 0 ? tr('home.noGoals') : tr('home.addGoal')}</Text>
          </PressableScale>
          {goals.length > 0 && <Text style={styles.hint}>{tr('goals.hint')}</Text>}
        </FadeIn>

        {/* Удахгүй болох сешн */}
        {sessions.length > 0 && (
          <FadeIn index={row++} style={{ gap: 10 }}>
            <Text style={styles.section}>🗓 {tr('sessions.upcoming')}</Text>
            {sessions.slice(0, 2).map((se) => {
              const live = sessionStatus(se) === 'live';
              return (
                <PressableScale key={se.id} onPress={() => router.push(`/session/${se.id}` as never)} accessibilityRole="button" style={styles.task}>
                  <LinearGradient colors={['rgba(14,165,233,0.3)', 'rgba(139,92,246,0.15)']} style={styles.taskIcon}>
                    <Ionicons name={live ? 'radio' : 'calendar'} size={22} color="#FFFFFF" />
                  </LinearGradient>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={styles.taskTitle} numberOfLines={1}>
                      {se.title}
                    </Text>
                    <Text style={styles.taskMeta}>
                      {formatDateTime(se.starts_at)} · {tr('sessions.minutes', { n: se.duration_min })}
                    </Text>
                  </View>
                  {live ? (
                    <LinearGradient colors={gradients.sunset} style={styles.liveTag}>
                      <Text style={styles.liveText}>{tr('sessions.status.live')}</Text>
                    </LinearGradient>
                  ) : (
                    <Ionicons name="chevron-forward" size={18} color={t.textFaint} />
                  )}
                </PressableScale>
              );
            })}
          </FadeIn>
        )}

        {/* Хамтдаа хөгжие баннер */}
        <FadeIn index={row++}>
          <LinearGradient colors={['#6D28D9', '#C026D3', '#FF8A3D']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.banner}>
            <View style={styles.bannerArt} pointerEvents="none">
              <TogetherArt width={190} height={138} />
            </View>
            <View style={{ gap: 6, maxWidth: '62%' }}>
              <Text style={styles.bannerTitle}>{tr('home.bannerTitle')} ✨</Text>
              <Text style={styles.bannerSub}>{tr('home.bannerSub')}</Text>
              <PressableScale onPress={() => router.push('/group/new' as never)} accessibilityRole="button" style={styles.bannerBtn}>
                <Text style={styles.bannerBtnText}>{tr('groups.createTitle')}</Text>
                <Ionicons name="arrow-forward" size={16} color={t.background} />
              </PressableScale>
            </View>
          </LinearGradient>
        </FadeIn>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  screen: { padding: 20, paddingTop: 58, gap: 14, paddingBottom: TAB_BAR_SPACE },
  greetRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  greetSmall: { fontFamily: font.medium, fontSize: 14, color: t.textMuted },
  greetName: { fontFamily: font.extrabold, fontSize: 24, color: t.text, letterSpacing: -0.3, flexShrink: 1 },
  bell: {
    width: 50, height: 50, borderRadius: 25, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border,
    alignItems: 'center', justifyContent: 'center',
  },
  badge: {
    position: 'absolute', top: 5, right: 4, minWidth: 19, height: 19, borderRadius: 10, paddingHorizontal: 4,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: t.background,
  },
  badgeText: { fontFamily: font.bold, fontSize: 10, color: '#FFFFFF' },
  searchRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  search: {
    height: 52, borderRadius: radius.pill, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border,
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18,
  },
  searchText: { fontFamily: font.medium, fontSize: 14, color: t.textFaint, flex: 1 },
  filterBtn: {
    width: 52, height: 52, borderRadius: 18, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border,
    alignItems: 'center', justifyContent: 'center',
  },
  levelCard: {
    borderRadius: 28, padding: 18, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)',
  },
  levelRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  trendTile: { position: 'absolute', top: 14, right: 14, width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  ringLevel: { fontFamily: font.extrabold, fontSize: 34, color: '#FFFFFF', lineHeight: 38 },
  ringCaption: { fontFamily: font.semibold, fontSize: 12, color: t.textMuted },
  xpValue: { fontFamily: font.extrabold, fontSize: 24, color: '#FFFFFF' },
  xpMuted: { fontFamily: font.medium, fontSize: 13, color: 'rgba(255,255,255,0.75)', lineHeight: 18, paddingRight: 36 },
  statChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: radius.pill, paddingVertical: 5, paddingHorizontal: 11, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  statChipViolet: { backgroundColor: 'rgba(139,92,246,0.28)', borderColor: 'rgba(196,181,253,0.35)' },
  statChipText: { fontFamily: font.bold, fontSize: 13, color: '#FFFFFF' },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  section: { fontFamily: font.extrabold, fontSize: 19, color: t.text },
  seeAll: { fontFamily: font.bold, fontSize: 14, color: palette.lilac },
  count: { fontFamily: font.bold, fontSize: 14, color: t.textMuted },
  chips: { gap: 10, paddingHorizontal: 20 },
  catChip: {
    flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: t.surface, borderRadius: radius.pill,
    borderWidth: 1, borderColor: t.border, paddingVertical: 10, paddingHorizontal: 16,
  },
  catChipActive: { borderColor: 'rgba(196,181,253,0.6)' },
  catText: { fontFamily: font.semibold, fontSize: 14, color: t.text },
  catPlus: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border,
    alignItems: 'center', justifyContent: 'center',
  },
  task: {
    backgroundColor: t.surface, borderRadius: 22, borderWidth: 1, borderColor: t.border,
    padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  taskDone: { borderColor: 'rgba(52,211,153,0.3)', backgroundColor: 'rgba(52,211,153,0.06)' },
  taskIcon: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  taskTitle: { fontFamily: font.bold, fontSize: 15, color: t.text, lineHeight: 20 },
  taskXp: { fontFamily: font.bold, fontSize: 12, color: palette.amber },
  taskMeta: { fontFamily: font.medium, fontSize: 12, color: t.textMuted },
  doneText: { color: t.textMuted, textDecorationLine: 'line-through' },
  track: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.10)', overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  arrowBtn: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1,
    borderColor: t.border, alignItems: 'center', justifyContent: 'center',
  },
  check: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  checkEmpty: { borderWidth: 2, borderColor: 'rgba(196,181,253,0.55)' },
  addRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 22, borderWidth: 1.5, borderStyle: 'dashed',
    borderColor: 'rgba(196,181,253,0.35)', padding: 14,
  },
  addIcon: { width: 34, height: 34, borderRadius: 12, backgroundColor: 'rgba(139,92,246,0.18)', alignItems: 'center', justifyContent: 'center' },
  addText: { fontFamily: font.semibold, fontSize: 14, color: t.textMuted, flex: 1 },
  hint: { fontFamily: font.medium, fontSize: 12, color: t.textFaint, textAlign: 'center', marginTop: 8 },
  liveTag: { borderRadius: radius.pill, paddingVertical: 4, paddingHorizontal: 10 },
  liveText: { fontFamily: font.bold, fontSize: 11, color: '#FFFFFF' },
  banner: { borderRadius: 26, padding: 20, minHeight: 150, overflow: 'hidden', justifyContent: 'center', ...shadow.card },
  bannerArt: { position: 'absolute', right: -10, bottom: 0 },
  bannerTitle: { fontFamily: font.extrabold, fontSize: 21, color: '#FFFFFF' },
  bannerSub: { fontFamily: font.medium, fontSize: 13, color: 'rgba(255,255,255,0.88)', lineHeight: 18 },
  bannerBtn: {
    marginTop: 8, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#FFFFFF', borderRadius: radius.pill, paddingVertical: 10, paddingHorizontal: 16,
  },
  bannerBtnText: { fontFamily: font.bold, fontSize: 14, color: t.background },
});
