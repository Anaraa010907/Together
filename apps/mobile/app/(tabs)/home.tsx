import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { font, lightTheme as t, palette, radius, shadow } from '@together/ui/tokens';
import { AnimatedRing, Dots, FadeIn, Pop, PressableScale } from '../../components/motion';
import { TAB_BAR_SPACE } from '../../components/TabBar';
import { categoryColor, categoryName, fetchCategories, fetchMyInterests, type Category } from '../../lib/interests';
import { fetchMyProfile } from '../../lib/account';
import { fetchUnreadCount } from '../../lib/notifications';
import { Avatar } from '../../components/Avatar';
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
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);
  const [progress, setProgress] = useState<Progress>(EMPTY_PROGRESS);
  const [newTitle, setNewTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [myInterests, setMyInterests] = useState<Set<string>>(new Set());
  const scrollX = useRef(new Animated.Value(0)).current;
  const { width: screenWidth } = useWindowDimensions();
  const cardWidth = screenWidth - 40;

  const today = todayIso();

  const load = useCallback(async () => {
    try {
      fetchMyProfile()
        .then((p) => {
          setName(p?.display_name ?? '');
          setAvatarUrl(p?.avatar_url ?? null);
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

  // Онцлох carousel: ахиц + идэвхтэй challenge + удахгүй болох сешн.
  const slides: Slide[] = [
    { kind: 'progress' },
    ...challenges.map((c) => ({ kind: 'challenge' as const, challenge: c })),
    ...sessions.slice(0, 2).map((se) => ({ kind: 'session' as const, session: se })),
  ];
  const pageWidth = cardWidth + 12;

  const header = (
    <View style={{ gap: 18, marginBottom: 6 }}>
      <FadeIn index={0}>
        <View style={styles.greetRow}>
          <PressableScale onPress={() => router.push('/profile' as never)} accessibilityRole="button">
            <Avatar name={name || 'T'} url={avatarUrl} size={48} />
          </PressableScale>
          <View style={{ flex: 1 }}>
            <Text style={styles.greetSmall}>{tr('home.greeting')}</Text>
            <Text style={styles.greetName} numberOfLines={1}>
              {name || 'TOGETHER'}
            </Text>
          </View>
          <PressableScale
            onPress={() => router.push('/notifications' as never)}
            accessibilityRole="button"
            accessibilityLabel={tr('notifications.title')}
            style={styles.bell}
          >
            <Ionicons name="notifications-outline" size={22} color={t.text} />
            {unread > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unread > 9 ? '9+' : unread}</Text>
              </View>
            )}
          </PressableScale>
        </View>
      </FadeIn>

      <FadeIn index={1}>
        <View style={styles.searchRow}>
          <PressableScale onPress={() => router.push('/groups' as never)} accessibilityRole="search" style={styles.search}>
            <Ionicons name="search" size={18} color="#9AA2AD" />
            <Text style={styles.searchText}>{tr('home.searchPlaceholder')}</Text>
          </PressableScale>
          <PressableScale
            onPress={() => router.push('/interests?edit=1' as never)}
            accessibilityRole="button"
            accessibilityLabel={tr('interests.edit')}
            style={styles.filterBtn}
          >
            <Ionicons name="options-outline" size={20} color={t.onAccent} />
          </PressableScale>
        </View>
      </FadeIn>

      <FadeIn index={2}>
        <Animated.ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={pageWidth}
          decelerationRate="fast"
          contentContainerStyle={{ gap: 12, paddingRight: 20 }}
          style={{ marginRight: -20 }}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: false })}
          scrollEventThrottle={16}
        >
          {slides.map((slide, i) => (
            <FeaturedCard
              key={slide.kind === 'progress' ? 'progress' : slide.kind === 'challenge' ? slide.challenge.id : slide.session.id}
              slide={slide}
              width={cardWidth}
              index={i}
              progress={progress}
              levelProgress={levelProgress}
              toNext={Math.max(0, levelNext - progress.total_xp)}
              goalsDone={doneCount}
              goalsTotal={goals.length}
              today={today}
              checked={slide.kind === 'challenge' && checkedToday.has(slide.challenge.id)}
              busy={slide.kind === 'challenge' && busyId === slide.challenge.id}
              onCheckIn={onCheckIn}
              onOpen={(path) => router.push(path as never)}
            />
          ))}
        </Animated.ScrollView>
        <Dots scrollX={scrollX} count={slides.length} pageWidth={pageWidth} />
      </FadeIn>

      {categories.length > 0 && (
        <FadeIn index={3}>
          <View style={styles.sectionRow}>
            <Text style={styles.section}>{tr('home.explore')}</Text>
            <Pressable onPress={() => router.push('/groups' as never)} hitSlop={8} accessibilityRole="link">
              <Text style={styles.seeAll}>{tr('home.seeAll')}</Text>
            </Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 20 }} style={{ marginRight: -20, marginTop: 10 }}>
            {categories.map((c) => (
              <PressableScale
                key={c.id}
                onPress={() => router.push({ pathname: '/groups', params: { category: c.id } } as never)}
                accessibilityRole="button"
                style={[styles.catChip, myInterests.has(c.id) && styles.catChipMine]}
              >
                <View style={[styles.catIcon, { backgroundColor: categoryColor(c.id)[0] }]}>
                  <Text style={{ fontSize: 15 }}>{c.icon}</Text>
                </View>
                <Text style={styles.catText}>{categoryName(c)}</Text>
              </PressableScale>
            ))}
          </ScrollView>
        </FadeIn>
      )}

      <FadeIn index={4}>
        <View style={styles.sectionRow}>
          <Text style={styles.section}>{tr('home.todayGoals')}</Text>
          {goals.length > 0 && (
            <Text style={styles.seeAll}>
              {doneCount}/{goals.length}
            </Text>
          )}
        </View>
      </FadeIn>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <FlatList
        data={goals}
        keyExtractor={(g) => g.id}
        ListHeaderComponent={header}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <FadeIn index={5}>
            <View style={styles.empty}>
              <Text style={{ fontSize: 28 }}>🌱</Text>
              <Text style={styles.rowMeta}>{tr('home.noGoals')}</Text>
            </View>
          </FadeIn>
        }
        renderItem={({ item, index }) => {
          const done = doneToday.has(item.id);
          return (
            <FadeIn index={5 + index}>
              <PressableScale
                onPress={() => !done && busyId === null && onComplete(item)}
                onLongPress={() => onArchive(item)}
                disabled={busyId !== null}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: done }}
                style={[styles.row, shadow.card, done && styles.rowDone]}
              >
                <Pop trigger={done}>
                  <View style={[styles.checkbox, done && { backgroundColor: t.success, borderColor: t.success }]}>
                    {done && <Ionicons name="checkmark" size={16} color={t.background} />}
                  </View>
                </Pop>
                <Text style={[styles.rowTitle, { flex: 1 }, done && styles.doneText]}>{item.title}</Text>
                <Text style={[styles.xpTag, done && { opacity: 0.5 }]}>+20 XP</Text>
              </PressableScale>
            </FadeIn>
          );
        }}
        ListFooterComponent={
          <View style={{ gap: 10, marginTop: 4 }}>
            <View style={[styles.addCard, shadow.card]}>
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
              <PressableScale style={styles.addBtn} onPress={onAdd} accessibilityRole="button" accessibilityLabel={tr('home.addPlaceholder')}>
                <Ionicons name="add" size={24} color={t.onAccent} />
              </PressableScale>
            </View>
            {goals.length > 0 && <Text style={[styles.rowMeta, { textAlign: 'center' }]}>{tr('goals.hint')}</Text>}
          </View>
        }
      />
    </View>
  );
}

type Slide =
  | { kind: 'progress' }
  | { kind: 'challenge'; challenge: Challenge }
  | { kind: 'session'; session: Session };

// Онцлох карт: navy градиент, алтан чимэглэлийн тойрог, үйлдлийн товч.
function FeaturedCard({
  slide,
  width,
  progress,
  levelProgress,
  toNext,
  goalsDone,
  goalsTotal,
  today,
  checked,
  busy,
  onCheckIn,
  onOpen,
}: {
  slide: Slide;
  width: number;
  index: number;
  progress: Progress;
  levelProgress: number;
  toNext: number;
  goalsDone: number;
  goalsTotal: number;
  today: string;
  checked: boolean;
  busy: boolean;
  onCheckIn: (c: Challenge) => void;
  onOpen: (path: string) => void;
}) {
  const { t: tr } = useTranslation();
  const colors: [string, string] =
    slide.kind === 'challenge' ? ['#1B2A3A', '#3A3020'] : slide.kind === 'session' ? ['#1D2A2A', '#2E4038'] : ['#111923', '#22344A'];

  return (
    <PressableScale
      onPress={() =>
        slide.kind === 'challenge'
          ? onOpen(`/challenge/${slide.challenge.id}`)
          : slide.kind === 'session'
            ? onOpen(`/session/${slide.session.id}`)
            : onOpen('/profile')
      }
      accessibilityRole="button"
      scaleTo={0.98}
    >
      <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.featured, { width }]}>
        <View style={[styles.orb, { right: -40, top: -50, width: 170, height: 170, opacity: 0.18 }]} />
        <View style={[styles.orb, { right: 40, bottom: -70, width: 120, height: 120, opacity: 0.1 }]} />

        {slide.kind === 'progress' && (
          <View style={styles.featuredRow}>
            <AnimatedRing progress={levelProgress} size={104}>
              <Text style={styles.ringLevel}>{progress.current_level}</Text>
              <Text style={styles.ringCaption}>{tr('home.level')}</Text>
            </AnimatedRing>
            <View style={{ flex: 1, gap: 8 }}>
              <Tag label={tr('home.yourProgress')} />
              <Text style={styles.heroValue}>
                {progress.total_xp} <Text style={styles.heroUnit}>XP</Text>
              </Text>
              <Text style={styles.heroMuted}>{tr('home.toNext', { n: toNext })}</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Text style={styles.heroChip}>🔥 {progress.current_streak}</Text>
                <Text style={styles.heroChip}>
                  ✓ {goalsDone}/{goalsTotal}
                </Text>
              </View>
            </View>
          </View>
        )}

        {slide.kind === 'challenge' && (
          <View style={{ gap: 10 }}>
            <Tag label={`🏁 ${tr('challenges.badge.active')}`} />
            <Text style={styles.featuredTitle} numberOfLines={2}>
              {slide.challenge.title}
            </Text>
            <Text style={styles.heroMuted}>
              {tr('challenges.statusActive', {
                day: dayNumber(slide.challenge, today),
                total: totalDays(slide.challenge),
              })}
            </Text>
            <View style={styles.track}>
              <View
                style={[
                  styles.fill,
                  { width: `${Math.min(100, (dayNumber(slide.challenge, today) / totalDays(slide.challenge)) * 100)}%` },
                ]}
              />
            </View>
            <PressableScale
              onPress={() => !checked && onCheckIn(slide.challenge)}
              disabled={checked || busy}
              accessibilityRole="button"
              style={[styles.cta, checked && { backgroundColor: palette.sageGreen }]}
            >
              {busy ? (
                <ActivityIndicator color={palette.midnightNavy} />
              ) : (
                <Text style={styles.ctaText}>{checked ? tr('challenges.checkedIn') : tr('challenges.checkIn')}</Text>
              )}
            </PressableScale>
          </View>
        )}

        {slide.kind === 'session' && (
          <View style={{ gap: 10 }}>
            <Tag
              label={
                sessionStatus(slide.session) === 'live' ? `🔴 ${tr('sessions.status.live')}` : `🗓 ${tr('sessions.upcoming')}`
              }
            />
            <Text style={styles.featuredTitle} numberOfLines={2}>
              {slide.session.title}
            </Text>
            <Text style={styles.heroMuted}>
              {formatDateTime(slide.session.starts_at)} · {tr('sessions.minutes', { n: slide.session.duration_min })}
            </Text>
            <View style={styles.cta}>
              <Text style={styles.ctaText}>{tr('home.openSession')}</Text>
            </View>
          </View>
        )}
      </LinearGradient>
    </PressableScale>
  );
}

function Tag({ label }: { label: string }) {
  return (
    <View style={styles.tag}>
      <Text style={styles.tagText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 20, paddingTop: 58, gap: 10, paddingBottom: TAB_BAR_SPACE },
  greetRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  greetSmall: { fontFamily: font.medium, fontSize: 13, color: '#5B6573' },
  greetName: { fontFamily: font.extrabold, fontSize: 24, color: t.text, letterSpacing: -0.3 },
  bell: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: t.surface, borderWidth: 1, borderColor: '#EFEAE0',
    alignItems: 'center', justifyContent: 'center',
  },
  badge: {
    position: 'absolute', top: 7, right: 7, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4,
    backgroundColor: t.warning, alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { fontFamily: font.bold, fontSize: 10, color: '#FFFFFF' },
  searchRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  search: {
    flex: 1, height: 52, borderRadius: radius.pill, backgroundColor: t.surface, borderWidth: 1, borderColor: '#EFEAE0',
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, ...shadow.card,
  },
  searchText: { fontFamily: font.medium, fontSize: 15, color: '#9AA2AD' },
  filterBtn: { width: 52, height: 52, borderRadius: 26, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center', ...shadow.card },
  featured: { borderRadius: 24, padding: 20, minHeight: 190, overflow: 'hidden', justifyContent: 'center' },
  featuredRow: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  orb: { position: 'absolute', borderRadius: 999, backgroundColor: palette.champagneGold },
  featuredTitle: { fontFamily: font.extrabold, fontSize: 22, color: palette.warmIvory, lineHeight: 28 },
  ringLevel: { fontFamily: font.extrabold, fontSize: 30, color: palette.warmIvory, lineHeight: 34 },
  ringCaption: { fontFamily: font.medium, fontSize: 11, color: 'rgba(244,240,231,0.7)' },
  heroValue: { fontFamily: font.extrabold, fontSize: 28, color: palette.warmIvory },
  heroUnit: { fontFamily: font.bold, fontSize: 16, color: t.accent },
  heroMuted: { fontFamily: font.medium, fontSize: 13, color: 'rgba(244,240,231,0.75)' },
  heroChip: {
    fontFamily: font.bold, fontSize: 13, color: palette.warmIvory, backgroundColor: 'rgba(244,240,231,0.12)',
    borderRadius: radius.pill, paddingVertical: 5, paddingHorizontal: 11, overflow: 'hidden',
  },
  tag: { alignSelf: 'flex-start', backgroundColor: 'rgba(198,166,107,0.22)', borderRadius: radius.pill, paddingVertical: 4, paddingHorizontal: 10 },
  tagText: { fontFamily: font.bold, fontSize: 12, color: t.accent },
  track: { height: 6, borderRadius: 3, backgroundColor: 'rgba(244,240,231,0.15)', overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3, backgroundColor: t.accent },
  cta: { alignSelf: 'flex-start', backgroundColor: t.accent, borderRadius: radius.pill, paddingVertical: 10, paddingHorizontal: 18, marginTop: 2, minWidth: 120, alignItems: 'center' },
  ctaText: { fontFamily: font.bold, fontSize: 14, color: palette.midnightNavy },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  section: { fontFamily: font.extrabold, fontSize: 19, color: t.text },
  seeAll: { fontFamily: font.bold, fontSize: 14, color: '#8A6F3D' },
  catChip: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: t.surface, borderRadius: radius.pill,
    borderWidth: 1, borderColor: '#EFEAE0', paddingVertical: 6, paddingLeft: 6, paddingRight: 14,
  },
  catChipMine: { borderColor: t.accent, backgroundColor: '#FBF6EA' },
  catIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  catText: { fontFamily: font.semibold, fontSize: 14, color: t.text },
  row: {
    backgroundColor: t.surface, borderRadius: 18, borderWidth: 1, borderColor: '#EFEAE0',
    paddingVertical: 15, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  rowDone: { backgroundColor: '#F6F8F4', borderColor: '#DCE5DD' },
  rowTitle: { fontFamily: font.semibold, fontSize: 16, color: t.text },
  rowMeta: { fontFamily: font.medium, fontSize: 13, color: '#5B6573' },
  checkbox: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: '#D5CDBD', alignItems: 'center', justifyContent: 'center' },
  doneText: { color: '#5B6573', textDecorationLine: 'line-through' },
  xpTag: { fontFamily: font.bold, fontSize: 12, color: '#8A6F3D', backgroundColor: '#F4ECDC', borderRadius: radius.pill, paddingVertical: 4, paddingHorizontal: 10, overflow: 'hidden' },
  empty: { backgroundColor: t.surface, borderRadius: 18, borderWidth: 1, borderStyle: 'dashed', borderColor: '#D5CDBD', padding: 22, alignItems: 'center', gap: 6 },
  addCard: { flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: t.surface, borderRadius: 18, borderWidth: 1, borderColor: '#EFEAE0', padding: 8, paddingLeft: 16 },
  addInput: { flex: 1, height: 44, fontFamily: font.medium, fontSize: 16, color: t.text },
  addBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center' },
});
