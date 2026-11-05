import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { font, gradients, lightTheme as t, palette, radius, shadow } from '@together/ui/tokens';
import { Avatar, AvatarStack } from '../../components/Avatar';
import { Backdrop } from '../../components/Backdrop';
import { FadeIn, PressableScale } from '../../components/motion';
import { useSession } from '../../lib/session';
import { fetchBlockedIds } from '../../lib/account';
import { promptMemberActions, promptReport } from '../../lib/moderation';
import { todayIso } from '../../lib/goals';
import { fetchGroupChallenges, statusOf, type Challenge } from '../../lib/challenges';
import { fetchGroupSessions, statusOf as sessionStatus, type Session } from '../../lib/sessions';
import { fetchFeed, type Post } from '../../lib/feed';
import { formatDateTime, timeAgo } from '../../lib/time';
import { categoryColor, categoryName, fetchCategories, type Category } from '../../lib/interests';
import { compact, fetchGroupStats, type GroupStat } from '../../lib/social';
import {
  canReview,
  fetchCompletions,
  fetchCourseReviews,
  fetchLessons,
  fetchTeacher,
  promptDeclareAge,
  stars,
  type Lesson,
  type Review,
} from '../../lib/teaching';
import {
  createInvite,
  fetchGroup,
  fetchMembers,
  fetchMyMembership,
  joinGroup,
  leaveGroup,
  pickGroupCover,
  reviewJoinRequest,
  uploadGroupCover,
  type GroupSummary,
  type MemberRow,
} from '../../lib/groups';

type Tab = 'about' | 'posts' | 'members' | 'activity';
const TABS: Tab[] = ['about', 'posts', 'members', 'activity'];

// Группын дэлгэрэнгүй: нүүр зураг, нэгдэх/холбоо, Мэдээлэл · Пост · Гишүүд · Үйл ажиллагаа.
export default function GroupDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const groupId = String(id);
  const { t: tr } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { session } = useSession();
  const myId = session?.user.id;

  const [group, setGroup] = useState<GroupSummary | null>(null);
  const [category, setCategory] = useState<Category | null>(null);
  const [stat, setStat] = useState<GroupStat | null>(null);
  const [membership, setMembership] = useState<{ role: string; status: string } | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set());
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [completions, setCompletions] = useState<Map<string, string[]>>(new Map());
  const [teacherName, setTeacherName] = useState<string | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>('about');
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    try {
      const [g, m, b] = await Promise.all([
        fetchGroup(groupId),
        fetchMyMembership(groupId),
        fetchBlockedIds().catch(() => new Set<string>()),
      ]);
      setGroup(g);
      setMembership(m);
      setBlockedIds(b);
      if (g?.category_id) {
        fetchCategories()
          .then((cs) => setCategory(cs.find((c) => c.id === g.category_id) ?? null))
          .catch(() => {});
      }
      fetchGroupStats([groupId])
        .then((s) => setStat(s[groupId] ?? null))
        .catch(() => {});
      // Гишүүдийн жагсаалт, пост зөвхөн харах эрхтэй үед (RLS шалгана).
      const [mem, ch, se, ps] = await Promise.all([
        fetchMembers(groupId).catch(() => [] as MemberRow[]),
        fetchGroupChallenges(groupId).catch(() => [] as Challenge[]),
        fetchGroupSessions(groupId).catch(() => [] as Session[]),
        m?.status === 'active' ? fetchFeed(groupId).catch(() => [] as Post[]) : Promise.resolve([] as Post[]),
      ]);
      setMembers(mem);
      setChallenges(ch);
      setSessions(se);
      setPosts(ps);
      if (g?.kind === 'course') {
        const ls = await fetchLessons(groupId).catch(() => [] as Lesson[]);
        setLessons(ls);
        setCompletions(await fetchCompletions(ls.map((l) => l.id)).catch(() => new Map()));
        const tp = await fetchTeacher(g.owner_id).catch(() => null);
        setTeacherName(tp?.profile.display_name ?? null);
        setReviews(await fetchCourseReviews(groupId).catch(() => []));
      }
    } catch (e: any) {
      Alert.alert(tr('common.error'), String(e.message ?? e));
    } finally {
      setLoading(false);
    }
  }, [groupId, tr]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const isActive = membership?.status === 'active';
  const isOwner = membership?.role === 'owner' && isActive;
  const isPending = membership?.status === 'pending';

  const onJoin = async () => {
    setBusy(true);
    try {
      const status = await joinGroup(groupId);
      Alert.alert(tr('groups.joinedTitle'), status === 'active' ? tr('groups.joinedNow') : tr('groups.joinPending'));
      await load();
    } catch (e: any) {
      const msg = String(e.message ?? e);
      if (msg.includes('course_adults_only')) {
        promptDeclareAge(() => onJoin());
        return;
      }
      Alert.alert(
        tr('common.error'),
        msg.includes('invite_only') ? tr('groups.inviteOnly') : msg.includes('banned') ? tr('groups.banned') : msg,
      );
    } finally {
      setBusy(false);
    }
  };

  const onLeave = () => {
    Alert.alert(tr('groups.leaveConfirmTitle'), tr('groups.leaveConfirm'), [
      { text: tr('common.cancel'), style: 'cancel' },
      {
        text: tr('groups.leave'),
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await leaveGroup(groupId);
            router.back();
          } catch (e: any) {
            Alert.alert(tr('common.error'), String(e.message ?? e));
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  const onReview = async (userId: string, approve: boolean) => {
    setBusy(true);
    try {
      await reviewJoinRequest(groupId, userId, approve);
      await load();
    } catch (e: any) {
      Alert.alert(tr('common.error'), String(e.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  // "Холбоо": эзэн урилгын код үүсгэж хуваалцана; бусад нь группын нэрийг хуваалцана.
  const onShare = async () => {
    if (!group) return;
    try {
      if (isOwner) {
        setBusy(true);
        const code = await createInvite(groupId);
        await Share.share({ message: tr('groups.inviteShare', { name: group.name, code }) });
      } else {
        await Share.share({ message: tr('groups.shareText', { name: group.name }) });
      }
    } catch (e: any) {
      Alert.alert(tr('common.error'), String(e.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const onCover = async () => {
    try {
      const a = await pickGroupCover();
      if (!a) return;
      setBusy(true);
      const url = await uploadGroupCover(groupId, a);
      setGroup((g) => (g ? { ...g, cover_url: url } : g));
    } catch (e: any) {
      Alert.alert(tr('common.error'), String(e.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const onMore = () => {
    const options: { text: string; style?: 'destructive' | 'cancel'; onPress?: () => void }[] = [];
    if (isOwner) options.push({ text: tr('groups.changeCover'), onPress: onCover });
    if (isOwner) options.push({ text: tr('groups.invite'), onPress: onShare });
    if (isActive && !isOwner) options.push({ text: tr('groups.leave'), style: 'destructive', onPress: onLeave });
    if (!isOwner) options.push({ text: tr('groups.reportGroup'), onPress: () => promptReport('group', groupId) });
    options.push({ text: tr('common.cancel'), style: 'cancel' });
    Alert.alert(group?.name ?? '', undefined, options);
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: t.background }]}>
        <ActivityIndicator color={t.accent} />
      </View>
    );
  }

  if (!group) {
    return (
      <View style={[styles.center, { backgroundColor: t.background }]}>
        <Text style={{ color: t.textMuted, fontFamily: font.medium }}>{tr('groups.notFound')}</Text>
      </View>
    );
  }

  // Блоклосон хэрэглэгчдийг жагсаалтаас нууна.
  const visible = members.filter((m) => !blockedIds.has(m.user_id));
  const pending = visible.filter((m) => m.status === 'pending');
  const active = visible.filter((m) => m.status === 'active');
  const memberCount = stat?.members ?? active.length;
  const preview = stat?.preview ?? active.slice(0, 3).map((m) => ({ name: m.profiles?.display_name, url: m.profiles?.avatar_url }));
  const icon = group.kind === 'course' ? '📚' : category?.icon ?? '👥';

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <Backdrop />
      <ScrollView contentContainerStyle={{ paddingBottom: 48 }} stickyHeaderIndices={[2]}>
        {/* Нүүр зураг */}
        <View style={[styles.cover, { height: 230 + insets.top * 0.4 }]}>
          {group.cover_url ? (
            <Image source={{ uri: group.cover_url }} style={StyleSheet.absoluteFill} />
          ) : (
            <LinearGradient colors={categoryColor(group.category_id)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill}>
              <CoverPattern width={width} />
            </LinearGradient>
          )}
          <LinearGradient colors={['rgba(12,10,28,0.35)', 'rgba(12,10,28,0)', 'rgba(12,10,28,0.95)']} style={StyleSheet.absoluteFill} />
          <View style={[styles.topBar, { top: insets.top + 8 }]}>
            <GlassButton icon="chevron-back" label={tr('common.back')} onPress={() => router.back()} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <GlassButton icon="share-outline" label={tr('groups.share')} onPress={onShare} />
              <GlassButton icon="ellipsis-horizontal" label={tr('common.more')} onPress={onMore} />
            </View>
          </View>
        </View>

        {/* Нэр, мета, үйлдэл */}
        <View style={styles.head}>
          <FadeIn index={0} style={{ alignItems: 'center' }}>
            <LinearGradient colors={['#A855F7', '#3B82F6']} style={styles.iconRing}>
              <LinearGradient colors={categoryColor(group.category_id)} style={styles.iconTile}>
                <Text style={{ fontSize: 34 }}>{icon}</Text>
              </LinearGradient>
            </LinearGradient>
          </FadeIn>
          <FadeIn index={1} style={{ alignItems: 'center', gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20 }}>
              <Text style={styles.name} numberOfLines={2}>
                {group.name}
              </Text>
              {group.kind === 'course' && <Ionicons name="checkmark-circle" size={20} color={palette.violet} />}
            </View>
            <Text style={styles.sub}>
              {[
                category ? categoryName(category) : null,
                group.kind === 'course' ? tr('courses.badge') : tr('groups.community'),
                group.visibility === 'private' ? tr('groups.private') : tr('groups.public'),
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 }}>
              <AvatarStack people={preview} total={memberCount} size={28} />
              <Text style={styles.memberCount}>
                {compact(memberCount)} {tr('groups.members')}
              </Text>
            </View>
          </FadeIn>

          <FadeIn index={2}>
            <View style={styles.actions}>
              {isActive ? (
                <PressableScale onPress={() => router.push(`/feed/${groupId}` as never)} accessibilityRole="button" style={[{ flex: 1 }, shadow.glow]}>
                  <LinearGradient colors={gradients.violet} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.primary}>
                    <Ionicons name="chatbubbles" size={18} color="#FFFFFF" />
                    <Text style={styles.primaryText}>{tr('feed.open')}</Text>
                  </LinearGradient>
                </PressableScale>
              ) : isPending ? (
                <View style={[styles.primary, styles.pending, { flex: 1 }]}>
                  <Ionicons name="time-outline" size={18} color={t.textMuted} />
                  <Text style={[styles.primaryText, { color: t.textMuted }]}>{tr('groups.pendingLabel')}</Text>
                </View>
              ) : (
                <PressableScale
                  onPress={onJoin}
                  disabled={busy || group.join_policy === 'invite_only'}
                  accessibilityRole="button"
                  style={[{ flex: 1, opacity: group.join_policy === 'invite_only' ? 0.6 : 1 }, shadow.glow]}
                >
                  <LinearGradient colors={gradients.violet} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.primary}>
                    {busy ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <>
                        <Ionicons name="add" size={20} color="#FFFFFF" />
                        <Text style={styles.primaryText}>
                          {group.join_policy === 'invite_only'
                            ? tr('groups.inviteOnly')
                            : group.join_policy === 'approval' || group.visibility === 'private'
                              ? tr('groups.requestJoin')
                              : tr('groups.join')}
                        </Text>
                      </>
                    )}
                  </LinearGradient>
                </PressableScale>
              )}
              <PressableScale onPress={onShare} disabled={busy} accessibilityRole="button" style={[styles.secondary, { flex: 1 }]}>
                <Ionicons name="link" size={18} color={t.text} />
                <Text style={styles.secondaryText}>{tr('groups.link')}</Text>
              </PressableScale>
            </View>
          </FadeIn>
        </View>

        {/* Табууд (наалддаг) */}
        <TabsBar tab={tab} onChange={setTab} />

        <View style={styles.body}>
          {tab === 'about' && (
            <>
              <FadeIn index={0} style={{ gap: 8 }}>
                <Text style={styles.h}>{tr('groups.about')}</Text>
                <Text style={styles.p} numberOfLines={expanded ? undefined : 3}>
                  {group.description || tr('groups.noDescription')}
                </Text>
                {!!group.description && group.description.length > 120 && (
                  <Pressable onPress={() => setExpanded((v) => !v)} hitSlop={6} accessibilityRole="button">
                    <Text style={styles.more}>{expanded ? tr('groups.less') : tr('groups.readMore')}</Text>
                  </Pressable>
                )}
              </FadeIn>

              {group.kind === 'course' && (
                <CourseBlock
                  group={group}
                  teacherName={teacherName}
                  lessons={lessons}
                  completions={completions}
                  reviews={reviews.filter((r) => !blockedIds.has(r.user_id))}
                  allReviews={reviews}
                  myId={myId}
                  isActive={isActive}
                  isOwner={isOwner}
                />
              )}

              {isOwner && pending.length > 0 && (
                <FadeIn index={3} style={{ gap: 10 }}>
                  <Text style={styles.h}>
                    {tr('groups.requests')} · {pending.length}
                  </Text>
                  {pending.map((m) => (
                    <View key={m.user_id} style={styles.row}>
                      <Avatar name={m.profiles?.display_name} url={m.profiles?.avatar_url} size={40} />
                      <Text style={[styles.rowTitle, { flex: 1 }]}>{m.profiles?.display_name ?? '—'}</Text>
                      <PressableScale onPress={() => onReview(m.user_id, true)} disabled={busy} accessibilityRole="button" style={[styles.smallBtn, styles.okBtn]}>
                        <Ionicons name="checkmark" size={18} color={palette.mint} />
                      </PressableScale>
                      <PressableScale onPress={() => onReview(m.user_id, false)} disabled={busy} accessibilityRole="button" style={[styles.smallBtn, styles.noBtn]}>
                        <Ionicons name="close" size={18} color={palette.rose} />
                      </PressableScale>
                    </View>
                  ))}
                </FadeIn>
              )}
            </>
          )}

          {tab === 'posts' && (
            <>
              {!isActive ? (
                <Locked text={tr('groups.postsLocked')} />
              ) : (
                <>
                  <FadeIn index={0}>
                    <PressableScale onPress={() => router.push(`/post/new?groupId=${groupId}` as never)} accessibilityRole="button" style={styles.compose}>
                      <LinearGradient colors={gradients.brand} style={styles.composeIcon}>
                        <Ionicons name="create" size={16} color="#FFFFFF" />
                      </LinearGradient>
                      <Text style={styles.composeText}>{tr('feed.composePlaceholder')}</Text>
                    </PressableScale>
                  </FadeIn>
                  {posts.length === 0 && <Text style={styles.emptyText}>{tr('feed.empty')}</Text>}
                  {posts.slice(0, 8).map((p, i) => (
                    <FadeIn key={p.id} index={i + 1}>
                      <PressableScale onPress={() => router.push(`/post/${p.id}` as never)} accessibilityRole="button" style={styles.post}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                          <Avatar name={p.author_name} url={p.author_avatar} size={34} />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.rowTitle}>{p.author_name}</Text>
                            <Text style={styles.meta}>
                              {tr(`feed.kind.${p.kind}`)} · {timeAgo(p.created_at)}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.p} numberOfLines={3}>
                          {p.body}
                        </Text>
                        <View style={{ flexDirection: 'row', gap: 16 }}>
                          <Text style={styles.meta}>💡 {p.helpful_ids.length}</Text>
                          <Text style={styles.meta}>💬 {p.comment_count}</Text>
                          {p.attachments.length > 0 && <Text style={styles.meta}>📎 {p.attachments.length}</Text>}
                        </View>
                      </PressableScale>
                    </FadeIn>
                  ))}
                  {posts.length > 0 && (
                    <PressableScale onPress={() => router.push(`/feed/${groupId}` as never)} accessibilityRole="button" style={styles.seeAllBtn}>
                      <Text style={styles.seeAllText}>{tr('groups.allPosts')}</Text>
                      <Ionicons name="arrow-forward" size={16} color={palette.lilac} />
                    </PressableScale>
                  )}
                </>
              )}
            </>
          )}

          {tab === 'members' && (
            <>
              {active.length === 0 ? (
                <Locked text={tr('groups.membersLocked')} />
              ) : (
                <>
                  <Text style={styles.meta}>{tr('groups.memberHint')}</Text>
                  {active.map((m, i) => (
                    <FadeIn key={m.user_id} index={i}>
                      <PressableScale
                        onPress={() => m.user_id !== myId && router.push(`/user/${m.user_id}` as never)}
                        onLongPress={() =>
                          m.user_id !== myId && promptMemberActions(m.profiles?.display_name ?? '—', m.user_id, load)
                        }
                        accessibilityRole="button"
                        style={styles.row}
                      >
                        <Avatar name={m.profiles?.display_name} url={m.profiles?.avatar_url} size={42} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.rowTitle}>{m.profiles?.display_name ?? '—'}</Text>
                          {!!m.profiles?.username && <Text style={styles.meta}>@{m.profiles.username}</Text>}
                        </View>
                        {m.role !== 'member' && (
                          <View style={styles.roleTag}>
                            <Text style={styles.roleText}>{m.role === 'owner' ? tr('groups.owner') : tr('groups.admin')}</Text>
                          </View>
                        )}
                      </PressableScale>
                    </FadeIn>
                  ))}
                  {isActive && !isOwner && (
                    <Pressable onPress={onLeave} disabled={busy} accessibilityRole="button" style={styles.textBtn}>
                      <Text style={{ color: t.warning, fontFamily: font.semibold }}>{tr('groups.leave')}</Text>
                    </Pressable>
                  )}
                </>
              )}
            </>
          )}

          {tab === 'activity' && (
            <>
              <FadeIn index={0}>
                <View style={styles.sectionRow}>
                  <Text style={styles.h}>{tr('sessions.section')}</Text>
                  {isActive && (
                    <Pressable onPress={() => router.push(`/session/new?groupId=${groupId}` as never)} hitSlop={8} accessibilityRole="button">
                      <Text style={styles.more}>+ {tr('sessions.create')}</Text>
                    </Pressable>
                  )}
                </View>
              </FadeIn>
              {sessions.length === 0 && <Text style={styles.emptyText}>{tr('sessions.none')}</Text>}
              {sessions.map((se, i) => {
                const st = sessionStatus(se);
                return (
                  <FadeIn key={se.id} index={i + 1}>
                    <PressableScale
                      onPress={() => router.push(`/session/${se.id}` as never)}
                      accessibilityRole="button"
                      style={[styles.row, { opacity: st === 'ended' || st === 'cancelled' ? 0.55 : 1 }]}
                    >
                      <LinearGradient colors={['rgba(14,165,233,0.35)', 'rgba(139,92,246,0.18)']} style={styles.rowIcon}>
                        <Ionicons name={st === 'live' ? 'radio' : 'calendar'} size={20} color="#FFFFFF" />
                      </LinearGradient>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rowTitle}>{se.title}</Text>
                        <Text style={styles.meta}>{formatDateTime(se.starts_at)}</Text>
                      </View>
                      <Text style={[styles.meta, st === 'live' && { color: palette.pink, fontFamily: font.bold }]}>
                        {tr(`sessions.status.${st}`)}
                      </Text>
                    </PressableScale>
                  </FadeIn>
                );
              })}

              <View style={[styles.sectionRow, { marginTop: 10 }]}>
                <Text style={styles.h}>{tr('challenges.section')}</Text>
                {isActive && (
                  <Pressable onPress={() => router.push(`/challenge/new?groupId=${groupId}` as never)} hitSlop={8} accessibilityRole="button">
                    <Text style={styles.more}>+ {tr('challenges.create')}</Text>
                  </Pressable>
                )}
              </View>
              {challenges.length === 0 && <Text style={styles.emptyText}>{tr('challenges.none')}</Text>}
              {challenges.map((c, i) => {
                const st = statusOf(c, todayIso());
                return (
                  <FadeIn key={c.id} index={i + 1}>
                    <PressableScale
                      onPress={() => router.push(`/challenge/${c.id}` as never)}
                      accessibilityRole="button"
                      style={[styles.row, { opacity: st === 'ended' ? 0.55 : 1 }]}
                    >
                      <LinearGradient colors={['rgba(251,191,36,0.3)', 'rgba(255,138,61,0.12)']} style={styles.rowIcon}>
                        <Text style={{ fontSize: 20 }}>🏆</Text>
                      </LinearGradient>
                      <Text style={[styles.rowTitle, { flex: 1 }]}>{c.title}</Text>
                      <Text style={styles.meta}>{tr(`challenges.badge.${st}`)}</Text>
                    </PressableScale>
                  </FadeIn>
                );
              })}
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function GlassButton({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={styles.glassBtn}>
      <Ionicons name={icon} size={20} color="#FFFFFF" />
    </PressableScale>
  );
}

// Нүүр зураггүй үед: зөөлөн тойргууд.
function CoverPattern({ width }: { width: number }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={[styles.patternDot, { width: 220, height: 220, right: -60, top: -40 }]} />
      <View style={[styles.patternDot, { width: 140, height: 140, left: -30, bottom: 10, opacity: 0.08 }]} />
      <View style={[styles.patternDot, { width: 60, height: 60, left: width * 0.42, top: 50, opacity: 0.1 }]} />
    </View>
  );
}

// Табын мөр: идэвхтэй табын доор градиент зураас пүршээр гулсана.
function TabsBar({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  const { t: tr } = useTranslation();
  const [w, setW] = useState(0);
  const x = useRef(new Animated.Value(0)).current;
  const slot = w / TABS.length;
  useEffect(() => {
    if (!slot) return;
    Animated.spring(x, { toValue: TABS.indexOf(tab) * slot + slot * 0.2, useNativeDriver: true, speed: 18, bounciness: 8 }).start();
  }, [tab, slot, x]);
  return (
    <View style={styles.tabsWrap}>
      <View style={styles.tabs} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
        {TABS.map((k) => (
          <Pressable
            key={k}
            onPress={() => onChange(k)}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === k }}
            style={styles.tab}
          >
            <Text style={[styles.tabText, tab === k && styles.tabTextOn]} numberOfLines={1}>
              {tr(`groups.tab.${k}`)}
            </Text>
          </Pressable>
        ))}
        {slot > 0 && (
          <Animated.View style={[styles.indicator, { width: slot * 0.6, transform: [{ translateX: x }] }]}>
            <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ flex: 1, borderRadius: 2 }} />
          </Animated.View>
        )}
      </View>
    </View>
  );
}

function Locked({ text }: { text: string }) {
  return (
    <View style={styles.locked}>
      <Ionicons name="lock-closed-outline" size={26} color={t.textMuted} />
      <Text style={[styles.emptyText, { textAlign: 'center' }]}>{text}</Text>
    </View>
  );
}

// Курсын хэсэг: багш, хичээлүүд, үнэлгээ.
function CourseBlock({
  group,
  teacherName,
  lessons,
  completions,
  reviews,
  allReviews,
  myId,
  isActive,
  isOwner,
}: {
  group: GroupSummary;
  teacherName: string | null;
  lessons: Lesson[];
  completions: Map<string, string[]>;
  reviews: Review[];
  allReviews: Review[];
  myId?: string;
  isActive: boolean;
  isOwner: boolean;
}) {
  const { t: tr } = useTranslation();
  const router = useRouter();
  const myDone = new Set(lessons.filter((l) => myId && (completions.get(l.id) ?? []).includes(myId)).map((l) => l.id));
  const firstOpen = lessons.find((l) => !myDone.has(l.id));
  const nextLessonPosition = lessons.reduce((m, l) => Math.max(m, l.position), 0) + 1;
  const avg = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
  const myReview = allReviews.find((r) => r.user_id === myId);

  return (
    <View style={{ gap: 10 }}>
      <PressableScale onPress={() => router.push(`/teacher/${group.owner_id}` as never)} accessibilityRole="link" style={styles.row}>
        <LinearGradient colors={['#FF8A3D', '#EC4899']} style={styles.rowIcon}>
          <Text style={{ fontSize: 18 }}>👩‍🏫</Text>
        </LinearGradient>
        <View style={{ flex: 1 }}>
          <Text style={styles.meta}>{tr('courses.badge')}</Text>
          <Text style={styles.rowTitle}>{tr('courses.teacher', { name: teacherName ?? '—' })}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={t.textFaint} />
      </PressableScale>

      <View style={styles.sectionRow}>
        <Text style={styles.h}>
          {tr('courses.lessons')}
          {isActive && !isOwner && lessons.length > 0 ? ` · ${myDone.size}/${lessons.length}` : ''}
        </Text>
        {isOwner && lessons.length < 50 && (
          <Pressable
            onPress={() => router.push(`/lesson/new?groupId=${group.id}&position=${nextLessonPosition}` as never)}
            hitSlop={8}
            accessibilityRole="button"
          >
            <Text style={styles.more}>+ {tr('courses.addLesson')}</Text>
          </Pressable>
        )}
      </View>
      {lessons.length === 0 && <Text style={styles.emptyText}>{tr('courses.noLessons')}</Text>}
      {lessons.map((l) => {
        const done = myDone.has(l.id);
        const isNext = firstOpen?.id === l.id && isActive && !isOwner;
        return (
          <PressableScale
            key={l.id}
            onPress={() => (isActive ? router.push(`/lesson/${l.id}` as never) : null)}
            accessibilityRole="button"
            style={[styles.row, isNext && { borderColor: palette.violet }, done && { borderColor: 'rgba(52,211,153,0.35)' }]}
          >
            <View style={[styles.lessonNum, done && { backgroundColor: 'rgba(52,211,153,0.2)' }]}>
              <Text style={styles.lessonNumText}>{done ? '✓' : l.position}</Text>
            </View>
            <Text style={[styles.rowTitle, { flex: 1 }]}>{l.title}</Text>
            <Text style={styles.meta}>
              {isOwner
                ? tr('courses.doneCount', { n: (completions.get(l.id) ?? []).length })
                : isNext
                  ? tr('courses.next')
                  : ''}
            </Text>
          </PressableScale>
        );
      })}

      <View style={[styles.sectionRow, { marginTop: 6 }]}>
        <Text style={styles.h}>
          {tr('reviews.section')}
          {reviews.length > 0 ? ` · ${avg.toFixed(1)} (${reviews.length})` : ''}
        </Text>
        {isActive && !isOwner && canReview(myDone.size, lessons.length) && (
          <Pressable onPress={() => router.push(`/review/${group.id}` as never)} hitSlop={8} accessibilityRole="button">
            <Text style={styles.more}>{myReview ? tr('reviews.edit') : tr('reviews.write')}</Text>
          </Pressable>
        )}
      </View>
      {isActive && !isOwner && !canReview(myDone.size, lessons.length) && lessons.length > 0 && (
        <Text style={styles.meta}>{tr('reviews.unlockHint')}</Text>
      )}
      {reviews.length === 0 && <Text style={styles.emptyText}>{tr('reviews.none')}</Text>}
      {reviews.slice(0, 10).map((r) => (
        <Pressable
          key={r.id}
          onLongPress={() => r.user_id !== myId && promptReport('review', r.id)}
          style={[styles.row, { flexDirection: 'column', alignItems: 'flex-start', gap: 4 }]}
        >
          <Text style={styles.rowTitle}>
            <Text style={{ color: palette.amber }}>{stars(r.rating)}</Text> {r.display_name}
          </Text>
          {!!r.comment && <Text style={styles.p}>{r.comment}</Text>}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  cover: { width: '100%', overflow: 'hidden' },
  patternDot: { position: 'absolute', borderRadius: 999, backgroundColor: '#FFFFFF', opacity: 0.12 },
  topBar: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between' },
  glassBtn: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(12,10,28,0.45)', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center',
  },
  head: { marginTop: -54, paddingHorizontal: 20, gap: 12 },
  iconRing: { padding: 2.5, borderRadius: 26 },
  iconTile: { width: 84, height: 84, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  name: { fontFamily: font.extrabold, fontSize: 24, color: t.text, textAlign: 'center' },
  sub: { fontFamily: font.medium, fontSize: 14, color: t.textMuted, textAlign: 'center' },
  memberCount: { fontFamily: font.bold, fontSize: 15, color: t.text },
  actions: { flexDirection: 'row', gap: 12, marginTop: 6 },
  primary: { height: 52, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 14 },
  primaryText: { fontFamily: font.bold, fontSize: 15, color: '#FFFFFF' },
  pending: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border },
  secondary: {
    height: 52, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: t.surface, borderWidth: 1, borderColor: t.border,
  },
  secondaryText: { fontFamily: font.bold, fontSize: 15, color: t.text },
  tabsWrap: { backgroundColor: t.background, paddingTop: 16, paddingHorizontal: 20 },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: t.borderSoft },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  tabText: { fontFamily: font.semibold, fontSize: 14, color: t.textMuted },
  tabTextOn: { fontFamily: font.bold, color: t.text },
  indicator: { position: 'absolute', bottom: -1, left: 0, height: 3 },
  body: { padding: 20, gap: 12 },
  h: { fontFamily: font.extrabold, fontSize: 17, color: t.text },
  p: { fontFamily: font.medium, fontSize: 15, color: 'rgba(255,255,255,0.86)', lineHeight: 22 },
  more: { fontFamily: font.bold, fontSize: 14, color: palette.lilac },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: t.surface, borderRadius: 18,
    borderWidth: 1, borderColor: t.border, padding: 12,
  },
  rowIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontFamily: font.bold, fontSize: 15, color: t.text },
  meta: { fontFamily: font.medium, fontSize: 12, color: t.textMuted },
  emptyText: { fontFamily: font.medium, fontSize: 14, color: t.textMuted },
  smallBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  okBtn: { backgroundColor: 'rgba(52,211,153,0.12)', borderColor: 'rgba(52,211,153,0.4)' },
  noBtn: { backgroundColor: 'rgba(251,113,133,0.12)', borderColor: 'rgba(251,113,133,0.4)' },
  roleTag: { backgroundColor: 'rgba(139,92,246,0.2)', borderRadius: radius.pill, paddingVertical: 4, paddingHorizontal: 10 },
  roleText: { fontFamily: font.bold, fontSize: 11, color: palette.lilac },
  textBtn: { alignItems: 'center', paddingVertical: 14 },
  compose: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: t.surface, borderRadius: radius.pill,
    borderWidth: 1, borderColor: t.border, padding: 8, paddingRight: 16,
  },
  composeIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  composeText: { fontFamily: font.medium, fontSize: 14, color: t.textFaint },
  post: { backgroundColor: t.surface, borderRadius: 20, borderWidth: 1, borderColor: t.border, padding: 14, gap: 10 },
  seeAllBtn: { flexDirection: 'row', alignSelf: 'center', alignItems: 'center', gap: 6, paddingVertical: 10 },
  seeAllText: { fontFamily: font.bold, fontSize: 14, color: palette.lilac },
  locked: { alignItems: 'center', gap: 10, padding: 24, borderRadius: 20, borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.18)' },
  lessonNum: { width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(139,92,246,0.2)', alignItems: 'center', justifyContent: 'center' },
  lessonNumText: { fontFamily: font.bold, fontSize: 14, color: t.text },
});
