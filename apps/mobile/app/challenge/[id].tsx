import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { font, gradients, lightTheme as t, palette, radius, space } from '@together/ui/tokens';
import { Backdrop } from '../../components/Backdrop';
import { Avatar } from '../../components/Avatar';
import { FadeIn, Pop } from '../../components/motion';
import { Button, HEADER_SPACE } from '../../components/ui';
import { useSession } from '../../lib/session';
import { todayIso } from '../../lib/goals';
import { fetchBlockedIds } from '../../lib/account';
import {
  challengeErrorKey,
  checkInChallenge,
  dayNumber,
  fetchChallenge,
  fetchChallengeProgress,
  isVerified,
  joinChallenge,
  leaveChallenge,
  statusOf,
  totalDays,
  trackKind,
  type Challenge,
  type Participant,
} from '../../lib/challenges';
import { fetchBoard, fetchMyActivities, KIND_ICON, type Activity, type BoardRow } from '../../lib/activities';
import { clock, pace } from '../../lib/tracking';

// Challenge дэлгэрэнгүй: төлөв, шаардлага, миний ахиц, өнөөдрийн check-in эсвэл хянагч, оролцогчид.
export default function ChallengeDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const challengeId = String(id);
  const { t: tr } = useTranslation();
  const router = useRouter();
  const { session } = useSession();
  const myId = session?.user.id;

  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [checkins, setCheckins] = useState<{ user_id: string; checked_on: string }[]>([]);
  const [board, setBoard] = useState<BoardRow[]>([]);
  const [mine, setMine] = useState<Activity[]>([]);
  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const today = todayIso();

  const load = useCallback(async () => {
    try {
      const [c, prog, b] = await Promise.all([
        fetchChallenge(challengeId),
        fetchChallengeProgress(challengeId),
        fetchBlockedIds().catch(() => new Set<string>()),
      ]);
      setChallenge(c);
      setParticipants(prog.participants);
      setCheckins(prog.checkins);
      setBlocked(b);
      if (c && isVerified(c)) {
        const [bd, acts] = await Promise.all([
          fetchBoard(challengeId).catch(() => [] as BoardRow[]),
          fetchMyActivities(challengeId).catch(() => [] as Activity[]),
        ]);
        setBoard(bd);
        setMine(acts);
      }
    } catch (e: any) {
      Alert.alert(tr('common.error'), String(e.message ?? e));
    } finally {
      setLoading(false);
    }
  }, [challengeId, tr]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const showError = (e: any) => {
    const key = challengeErrorKey(e);
    Alert.alert(tr('common.error'), key ? tr(key) : String(e.message ?? e));
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      await load();
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  };

  const onCheckIn = () =>
    run(async () => {
      const res = await checkInChallenge(challengeId, today);
      if (res.completed && res.xp_gained > 25) {
        Alert.alert(tr('challenges.completedTitle'), tr('challenges.completedBody', { xp: res.xp_gained }));
      }
    });

  const onLeave = () =>
    Alert.alert(tr('challenges.leaveTitle'), tr('challenges.leaveConfirm'), [
      { text: tr('common.cancel'), style: 'cancel' },
      { text: tr('challenges.leave'), style: 'destructive', onPress: () => run(() => leaveChallenge(challengeId)) },
    ]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: t.background }]}>
        <ActivityIndicator color={t.accent} />
      </View>
    );
  }
  if (!challenge) {
    return (
      <View style={[styles.center, { backgroundColor: t.background }]}>
        <Backdrop />
        <Text style={{ color: t.textMuted }}>{tr('challenges.errors.challenge_not_found')}</Text>
      </View>
    );
  }

  const status = statusOf(challenge, today);
  const total = totalDays(challenge);
  const verified = isVerified(challenge);
  const kind = trackKind(challenge);
  const isParticipant = participants.some((p) => p.user_id === myId);
  const myDays = participants.find((p) => p.user_id === myId)?.days ?? 0;
  const doneToday = checkins.some((c) => c.user_id === myId && c.checked_on === today);
  const visible = participants.filter((p) => !blocked.has(p.user_id));
  const ranked = verified
    ? board.filter((r) => !blocked.has(r.user_id))
    : [...visible].sort((a, b) => b.days - a.days).map((p) => ({ user_id: p.user_id, display_name: p.display_name, avatar_url: null, days: p.days, distance_m: 0, minutes: 0 }));

  const statusText =
    status === 'upcoming'
      ? tr('challenges.statusUpcoming', { date: challenge.start_on })
      : status === 'ended'
        ? tr('challenges.statusEnded')
        : tr('challenges.statusActive', { day: dayNumber(challenge, today), total });

  const requirement = !kind
    ? tr('track.req.manual')
    : kind === 'place'
      ? tr('track.req.place', { name: challenge.place_name ?? '', min: challenge.min_minutes ?? 0, r: challenge.place_radius_m ?? 0 })
      : kind === 'focus'
        ? tr('track.req.focus', { min: challenge.min_minutes ?? 0 })
        : tr(`track.req.${kind}`, { km: ((challenge.min_distance_m ?? 0) / 1000).toString() });

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <Backdrop />
      <ScrollView contentContainerStyle={styles.screen}>
        <FadeIn index={0}>
          <LinearGradient colors={gradients.card} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
            <View style={styles.heroTop}>
              <Text style={{ fontSize: 34 }}>{kind ? KIND_ICON[kind] : '🏆'}</Text>
              <View style={[styles.pill, verified && { backgroundColor: 'rgba(52,211,153,0.18)', borderColor: 'rgba(52,211,153,0.5)' }]}>
                <Ionicons name={verified ? 'shield-checkmark' : 'hand-left'} size={12} color={verified ? palette.mint : palette.lilac} />
                <Text style={styles.pillText}>{verified ? tr('track.verifiedBadge') : tr('track.manualBadge')}</Text>
              </View>
            </View>
            <Text style={styles.title}>{challenge.title}</Text>
            {!!challenge.description && <Text style={styles.muted}>{challenge.description}</Text>}
            <View style={styles.req}>
              <Ionicons name="flag" size={14} color={palette.amber} />
              <Text style={[styles.reqText, { flex: 1 }]}>{requirement}</Text>
            </View>
            <Text style={styles.meta}>
              {statusText} · {challenge.start_on} → {challenge.end_on}
            </Text>
          </LinearGradient>
        </FadeIn>

        {isParticipant && (
          <FadeIn index={1} style={styles.card}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={styles.cardTitle}>{tr('challenges.myProgress', { done: myDays, total })}</Text>
              <Text style={[styles.cardTitle, { color: palette.amber }]}>{Math.round((myDays / total) * 100)}%</Text>
            </View>
            <View style={styles.trackBar}>
              <LinearGradient
                colors={gradients.brand}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={[styles.fill, { width: `${Math.max(2, Math.min(100, (myDays / total) * 100))}%` }]}
              />
            </View>
          </FadeIn>
        )}

        {isParticipant && status === 'active' && (
          <FadeIn index={2}>
            {doneToday ? (
              <View style={styles.doneBanner}>
                <Pop trigger={doneToday}>
                  <Ionicons name="checkmark-circle" size={22} color={palette.mint} />
                </Pop>
                <Text style={[styles.cardTitle, { flex: 1 }]}>{tr('challenges.checkedIn')}</Text>
              </View>
            ) : verified ? (
              <Button label={tr(`track.startKind.${kind}`)} icon="play" onPress={() => router.push(`/track/${challengeId}` as never)} />
            ) : (
              <Button label={tr('challenges.checkIn')} icon="checkmark" onPress={onCheckIn} loading={busy} />
            )}
          </FadeIn>
        )}

        {!isParticipant && status !== 'ended' && (
          <Button label={tr('challenges.join')} icon="add" onPress={() => run(() => joinChallenge(challengeId))} loading={busy} />
        )}

        {verified && isParticipant && mine.length > 0 && (
          <>
            <Text style={styles.section}>{tr('track.history')}</Text>
            {mine.slice(0, 7).map((a) => (
              <View key={a.id} style={styles.row}>
                <View
                  style={[
                    styles.histIcon,
                    a.status === 'verified'
                      ? { backgroundColor: 'rgba(52,211,153,0.16)' }
                      : a.status === 'rejected'
                        ? { backgroundColor: 'rgba(251,113,133,0.16)' }
                        : null,
                  ]}
                >
                  <Ionicons
                    name={a.status === 'verified' ? 'checkmark' : a.status === 'rejected' ? 'close' : 'time'}
                    size={16}
                    color={a.status === 'verified' ? palette.mint : a.status === 'rejected' ? palette.rose : palette.lilac}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>
                    {a.kind === 'run' || a.kind === 'walk' || a.kind === 'ride'
                      ? `${((a.distance_m ?? 0) / 1000).toFixed(2)} км · ${clock(a.duration_s ?? 0)}${a.kind !== 'ride' && a.avg_speed_mps ? ` · ${pace(a.avg_speed_mps)}/км` : ''}`
                      : clock(a.duration_s ?? 0)}
                  </Text>
                  <Text style={styles.rowSub}>
                    {a.started_at.slice(0, 10)} ·{' '}
                    {a.status === 'rejected'
                      ? tr(`track.reason.${a.reject_reason ?? 'unknown'}`, { defaultValue: tr('track.reason.unknown') })
                      : a.status === 'active'
                        ? tr('track.recording')
                        : a.checked_in
                          ? tr('track.counted')
                          : tr('track.notCounted')}
                  </Text>
                </View>
              </View>
            ))}
          </>
        )}

        <Text style={styles.section}>
          {verified ? tr('track.board') : tr('challenges.participants')} ({ranked.length})
        </Text>
        {ranked.map((p, i) => (
          <Pressable
            key={p.user_id}
            onPress={() => router.push(`/user/${p.user_id}` as never)}
            accessibilityRole="button"
            style={[styles.row, p.user_id === myId && { borderColor: 'rgba(196,181,253,0.5)' }]}
          >
            <Text style={styles.rank}>{i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</Text>
            <Avatar name={p.display_name} url={p.avatar_url} size={36} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {p.display_name}
              </Text>
              {verified && (kind === 'run' || kind === 'walk' || kind === 'ride') ? (
                <Text style={styles.rowSub}>{tr('track.boardKm', { km: (p.distance_m / 1000).toFixed(1) })}</Text>
              ) : verified ? (
                <Text style={styles.rowSub}>{tr('track.boardMin', { n: p.minutes })}</Text>
              ) : null}
            </View>
            <Text style={styles.days}>
              {p.days}/{total}
            </Text>
          </Pressable>
        ))}

        {isParticipant && status !== 'ended' && (
          <Pressable onPress={onLeave} disabled={busy} accessibilityRole="button" style={styles.textBtn}>
            <Text style={{ color: t.warning, fontFamily: font.semibold }}>{tr('challenges.leave')}</Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 20, paddingTop: HEADER_SPACE, gap: space.md, paddingBottom: 48 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  hero: { borderRadius: 26, padding: 18, gap: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)',
  },
  pillText: { fontFamily: font.bold, fontSize: 11, color: t.text },
  title: { fontFamily: font.extrabold, fontSize: 24, lineHeight: 30, color: t.text },
  muted: { fontFamily: font.medium, fontSize: 14, lineHeight: 20, color: t.textMuted },
  req: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 14, backgroundColor: 'rgba(12,10,28,0.35)' },
  reqText: { fontFamily: font.semibold, fontSize: 13, color: t.text },
  meta: { fontFamily: font.medium, fontSize: 12, color: t.textMuted },
  card: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 22, padding: space.md, gap: 10 },
  cardTitle: { fontFamily: font.bold, fontSize: 15, color: t.text },
  trackBar: { height: 10, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  fill: { height: 10, borderRadius: radius.pill },
  doneBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, borderRadius: radius.pill,
    backgroundColor: 'rgba(52,211,153,0.12)', borderWidth: 1, borderColor: 'rgba(52,211,153,0.45)',
  },
  section: { fontFamily: font.bold, fontSize: 17, color: t.text, marginTop: space.sm },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 18,
    backgroundColor: t.surface, borderWidth: 1, borderColor: t.border,
  },
  rowTitle: { fontFamily: font.bold, fontSize: 14, color: t.text },
  rowSub: { fontFamily: font.medium, fontSize: 12, color: t.textMuted, marginTop: 2 },
  histIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: t.surface },
  rank: { width: 24, textAlign: 'center', fontFamily: font.bold, fontSize: 14, color: t.textMuted },
  days: { fontFamily: font.extrabold, fontSize: 14, color: palette.amber },
  textBtn: { alignItems: 'center', paddingVertical: space.md },
});
