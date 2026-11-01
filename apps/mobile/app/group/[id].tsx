import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { lightTheme as t, radius, space } from '@together/ui/tokens';
import { useSession } from '../../lib/session';
import { fetchBlockedIds } from '../../lib/account';
import { promptMemberActions, promptReport } from '../../lib/moderation';
import { todayIso } from '../../lib/goals';
import { fetchGroupChallenges, statusOf, type Challenge } from '../../lib/challenges';
import { fetchGroupSessions, statusOf as sessionStatus, type Session } from '../../lib/sessions';
import { formatDateTime } from '../../lib/time';
import { fetchCompletions, fetchLessons, fetchTeacher, promptDeclareAge, type Lesson } from '../../lib/teaching';
import {
  createInvite,
  fetchGroup,
  fetchMembers,
  fetchMyMembership,
  joinGroup,
  leaveGroup,
  reviewJoinRequest,
  type GroupSummary,
  type MemberRow,
} from '../../lib/groups';

// Group дэлгэрэнгүй: гишүүд, нэгдэх/гарах, эзэнд хүсэлт + урилга, report/block.
export default function GroupDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const groupId = String(id);
  const { t: tr } = useTranslation();
  const router = useRouter();
  const { session } = useSession();
  const myId = session?.user.id;

  const [group, setGroup] = useState<GroupSummary | null>(null);
  const [membership, setMembership] = useState<{ role: string; status: string } | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set());
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [completions, setCompletions] = useState<Map<string, string[]>>(new Map());
  const [teacherName, setTeacherName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

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
      // Гишүүдийн жагсаалт зөвхөн харах эрхтэй үед (RLS шалгана).
      setMembers(await fetchMembers(groupId).catch(() => []));
      setChallenges(await fetchGroupChallenges(groupId).catch(() => []));
      setSessions(await fetchGroupSessions(groupId).catch(() => []));
      if (g?.kind === 'course') {
        const ls = await fetchLessons(groupId).catch(() => [] as Lesson[]);
        setLessons(ls);
        setCompletions(await fetchCompletions(ls.map((l) => l.id)).catch(() => new Map()));
        const tp = await fetchTeacher(g.owner_id).catch(() => null);
        setTeacherName(tp?.profile.display_name ?? null);
      }
    } catch (e: any) {
      Alert.alert(tr('common.error'), String(e.message ?? e));
    } finally {
      setLoading(false);
    }
  }, [groupId, tr]);

  // Хичээл, сешн нэмээд буцахад шинэчлэгдэнэ.
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
        // Нас зарлаагүй бол нэг удаа асуугаад дахин оролдоно; зарласан бол тайлбар харуулна.
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

  const nextLessonPosition = lessons.reduce((m, l) => Math.max(m, l.position), 0) + 1;
  const myDone = new Set(lessons.filter((l) => myId && (completions.get(l.id) ?? []).includes(myId)).map((l) => l.id));
  const firstOpen = lessons.find((l) => !myDone.has(l.id));

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

  const onInvite = async () => {
    if (!group) return;
    setBusy(true);
    try {
      const code = await createInvite(groupId);
      await Share.share({ message: tr('groups.inviteShare', { name: group.name, code }) });
    } catch (e: any) {
      Alert.alert(tr('common.error'), String(e.message ?? e));
    } finally {
      setBusy(false);
    }
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
        <Text style={{ color: t.textMuted }}>{tr('groups.notFound')}</Text>
      </View>
    );
  }

  // Блоклосон хэрэглэгчдийг жагсаалтаас нууна.
  const visible = members.filter((m) => !blockedIds.has(m.user_id));
  const pending = visible.filter((m) => m.status === 'pending');
  const active = visible.filter((m) => m.status === 'active');

  return (
    <ScrollView style={{ backgroundColor: t.background }} contentContainerStyle={styles.screen}>
      <Text style={[styles.title, { color: t.text }]}>{group.name}</Text>
      {group.kind === 'course' && (
        <Pressable onPress={() => router.push(`/teacher/${group.owner_id}` as never)} accessibilityRole="link">
          <Text style={{ color: t.text, fontWeight: '600' }}>
            📚 {tr('courses.badge')} · {tr('courses.teacher', { name: teacherName ?? '—' })} ›
          </Text>
        </Pressable>
      )}
      {!!group.description && <Text style={{ color: t.textMuted }}>{group.description}</Text>}

      {group.kind === 'course' && (
        <>
          <View style={styles.sectionRow}>
            <Text style={[styles.section, { color: t.text }]}>
              {tr('courses.lessons')}
              {isActive && !isOwner && lessons.length > 0 ? ` · ${myDone.size}/${lessons.length}` : ''}
            </Text>
            {isOwner && lessons.length < 50 && (
              <Pressable
                onPress={() => router.push(`/lesson/new?groupId=${groupId}&position=${nextLessonPosition}` as never)}
                accessibilityRole="button"
              >
                <Text style={{ color: t.text, fontWeight: '600', marginTop: space.md }}>{tr('courses.addLesson')}</Text>
              </Pressable>
            )}
          </View>
          {lessons.length === 0 && <Text style={{ color: t.textMuted }}>{tr('courses.noLessons')}</Text>}
          {lessons.map((l) => {
            const done = myDone.has(l.id);
            const isNext = firstOpen?.id === l.id && isActive && !isOwner;
            return (
              <Pressable
                key={l.id}
                onPress={() => (isActive ? router.push(`/lesson/${l.id}` as never) : null)}
                accessibilityRole="button"
                style={[
                  styles.row,
                  { borderColor: isNext ? t.accent : t.border, backgroundColor: done ? t.success : t.surface },
                ]}
              >
                <Text style={{ color: t.text, flex: 1 }}>
                  {l.position}. {l.title}
                </Text>
                <Text style={{ color: t.textMuted, fontSize: 12 }}>
                  {isOwner
                    ? tr('courses.doneCount', { n: (completions.get(l.id) ?? []).length })
                    : done
                      ? '✓'
                      : isNext
                        ? tr('courses.next')
                        : ''}
                </Text>
              </Pressable>
            );
          })}
        </>
      )}
      <Text style={[styles.meta, { color: t.textMuted }]}>
        {group.visibility === 'private' ? tr('groups.private') : tr('groups.public')} · {active.length}{' '}
        {tr('groups.members')}
      </Text>

      {isActive && (
        <Pressable
          style={[styles.primary, { backgroundColor: t.accent }]}
          onPress={() => router.push(`/feed/${groupId}` as never)}
          accessibilityRole="button"
        >
          <Text style={[styles.primaryText, { color: t.onAccent }]}>💬 {tr('feed.open')}</Text>
        </Pressable>
      )}

      {!isActive && !isPending && (
        <Pressable
          style={[styles.primary, { backgroundColor: t.accent, opacity: busy ? 0.6 : 1 }]}
          disabled={busy || group.join_policy === 'invite_only'}
          onPress={onJoin}
          accessibilityRole="button"
        >
          <Text style={[styles.primaryText, { color: t.onAccent }]}>
            {group.join_policy === 'invite_only'
              ? tr('groups.inviteOnly')
              : group.join_policy === 'approval' || group.visibility === 'private'
                ? tr('groups.requestJoin')
                : tr('groups.join')}
          </Text>
        </Pressable>
      )}

      {isPending && <Text style={[styles.meta, { color: t.textMuted }]}>{tr('groups.pendingLabel')}</Text>}

      {isOwner && (
        <Pressable
          style={[styles.secondary, { borderColor: t.border }]}
          onPress={onInvite}
          disabled={busy}
          accessibilityRole="button"
        >
          <Text style={{ color: t.text, fontWeight: '600' }}>{tr('groups.invite')}</Text>
        </Pressable>
      )}

      {isOwner && pending.length > 0 && (
        <>
          <Text style={[styles.section, { color: t.text }]}>{tr('groups.requests')}</Text>
          {pending.map((m) => (
            <View key={m.user_id} style={[styles.row, { borderColor: t.border, backgroundColor: t.surface }]}>
              <Text style={{ color: t.text, flex: 1 }}>{m.profiles?.display_name ?? '—'}</Text>
              <Pressable onPress={() => onReview(m.user_id, true)} disabled={busy} accessibilityRole="button">
                <Text style={{ color: t.text, fontWeight: '700', paddingHorizontal: space.sm }}>✓</Text>
              </Pressable>
              <Pressable onPress={() => onReview(m.user_id, false)} disabled={busy} accessibilityRole="button">
                <Text style={{ color: t.warning, fontWeight: '700', paddingHorizontal: space.sm }}>✕</Text>
              </Pressable>
            </View>
          ))}
        </>
      )}

      {isActive && (
        <>
          <View style={styles.sectionRow}>
            <Text style={[styles.section, { color: t.text }]}>{tr('sessions.section')}</Text>
            <Pressable
              onPress={() => router.push(`/session/new?groupId=${groupId}` as never)}
              accessibilityRole="button"
            >
              <Text style={{ color: t.text, fontWeight: '600', marginTop: space.md }}>{tr('sessions.create')}</Text>
            </Pressable>
          </View>
          {sessions.length === 0 && <Text style={{ color: t.textMuted }}>{tr('sessions.none')}</Text>}
          {sessions.map((se) => {
            const st = sessionStatus(se);
            return (
              <Pressable
                key={se.id}
                onPress={() => router.push(`/session/${se.id}` as never)}
                accessibilityRole="button"
                style={[
                  styles.row,
                  { borderColor: t.border, backgroundColor: t.surface, opacity: st === 'ended' || st === 'cancelled' ? 0.6 : 1 },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.text, fontWeight: '600' }}>{se.title}</Text>
                  <Text style={{ color: t.textMuted, fontSize: 12 }}>{formatDateTime(se.starts_at)}</Text>
                </View>
                <Text style={{ color: t.textMuted, fontSize: 12 }}>{tr(`sessions.status.${st}`)}</Text>
              </Pressable>
            );
          })}
        </>
      )}

      {(isActive || challenges.length > 0) && (
        <>
          <View style={styles.sectionRow}>
            <Text style={[styles.section, { color: t.text }]}>{tr('challenges.section')}</Text>
            {isActive && (
              <Pressable
                onPress={() => router.push(`/challenge/new?groupId=${groupId}` as never)}
                accessibilityRole="button"
              >
                <Text style={{ color: t.text, fontWeight: '600', marginTop: space.md }}>{tr('challenges.create')}</Text>
              </Pressable>
            )}
          </View>
          {challenges.length === 0 && <Text style={{ color: t.textMuted }}>{tr('challenges.none')}</Text>}
          {challenges.map((c) => {
            const st = statusOf(c, todayIso());
            return (
              <Pressable
                key={c.id}
                onPress={() => router.push(`/challenge/${c.id}` as never)}
                accessibilityRole="button"
                style={[styles.row, { borderColor: t.border, backgroundColor: t.surface, opacity: st === 'ended' ? 0.6 : 1 }]}
              >
                <Text style={{ color: t.text, flex: 1, fontWeight: '600' }}>{c.title}</Text>
                <Text style={{ color: t.textMuted, fontSize: 12 }}>{tr(`challenges.badge.${st}`)}</Text>
              </Pressable>
            );
          })}
        </>
      )}

      {isActive && (
        <>
          <Text style={[styles.section, { color: t.text }]}>{tr('groups.membersTitle')}</Text>
          <Text style={[styles.hint, { color: t.textMuted }]}>{tr('groups.memberHint')}</Text>
          {active.map((item) => (
            <Pressable
              key={item.user_id}
              onLongPress={() =>
                item.user_id !== myId &&
                promptMemberActions(item.profiles?.display_name ?? '—', item.user_id, load)
              }
              style={[styles.row, { borderColor: t.border, backgroundColor: t.surface }]}
            >
              <Text style={{ color: t.text, flex: 1 }}>{item.profiles?.display_name ?? '—'}</Text>
              {item.role === 'owner' && <Text style={{ color: t.textMuted, fontSize: 12 }}>{tr('groups.owner')}</Text>}
            </Pressable>
          ))}
          {!isOwner && (
            <Pressable onPress={onLeave} disabled={busy} accessibilityRole="button" style={styles.textBtn}>
              <Text style={{ color: t.warning }}>{tr('groups.leave')}</Text>
            </Pressable>
          )}
        </>
      )}

      {!isOwner && (
        <Pressable onPress={() => promptReport('group', groupId)} accessibilityRole="button" style={styles.textBtn}>
          <Text style={{ color: t.textMuted }}>{tr('groups.reportGroup')}</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { padding: space.lg, gap: space.sm, paddingBottom: space.xl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 26, fontWeight: '700' },
  meta: { fontSize: 13 },
  hint: { fontSize: 12 },
  section: { fontSize: 16, fontWeight: '600', marginTop: space.md },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  primary: { borderRadius: radius.pill, paddingVertical: 14, alignItems: 'center', marginTop: space.md },
  primaryText: { fontSize: 16, fontWeight: '600' },
  secondary: { borderWidth: 1, borderRadius: radius.pill, paddingVertical: 12, alignItems: 'center', marginTop: space.md },
  row: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: radius.md, padding: space.md },
  textBtn: { alignItems: 'center', paddingVertical: space.md },
});
