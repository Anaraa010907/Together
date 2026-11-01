import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { lightTheme as t, radius, space } from '@together/ui/tokens';
import { useSession } from '../../lib/session';
import { todayIso } from '../../lib/goals';
import { fetchBlockedIds } from '../../lib/account';
import {
  challengeErrorKey,
  checkInChallenge,
  dayNumber,
  fetchChallenge,
  fetchChallengeProgress,
  joinChallenge,
  leaveChallenge,
  statusOf,
  totalDays,
  type Challenge,
  type Participant,
} from '../../lib/challenges';

// Challenge дэлгэрэнгүй: төлөв, миний ахиц, өнөөдрийн check-in, оролцогчид.
export default function ChallengeDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const challengeId = String(id);
  const { t: tr } = useTranslation();
  const { session } = useSession();
  const myId = session?.user.id;

  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [checkins, setCheckins] = useState<{ user_id: string; checked_on: string }[]>([]);
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
        <Text style={{ color: t.textMuted }}>{tr('challenges.errors.challenge_not_found')}</Text>
      </View>
    );
  }

  const status = statusOf(challenge, today);
  const total = totalDays(challenge);
  const isParticipant = participants.some((p) => p.user_id === myId);
  const myDays = participants.find((p) => p.user_id === myId)?.days ?? 0;
  const doneToday = checkins.some((c) => c.user_id === myId && c.checked_on === today);
  const visible = participants.filter((p) => !blocked.has(p.user_id));

  const statusText =
    status === 'upcoming'
      ? tr('challenges.statusUpcoming', { date: challenge.start_on })
      : status === 'ended'
        ? tr('challenges.statusEnded')
        : tr('challenges.statusActive', { day: dayNumber(challenge, today), total });

  return (
    <ScrollView style={{ backgroundColor: t.background }} contentContainerStyle={styles.screen}>
      <Text style={[styles.title, { color: t.text }]}>{challenge.title}</Text>
      {!!challenge.description && <Text style={{ color: t.textMuted }}>{challenge.description}</Text>}
      <Text style={[styles.meta, { color: t.textMuted }]}>
        {statusText} · {challenge.start_on} → {challenge.end_on}
      </Text>

      {isParticipant && (
        <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
          <Text style={{ color: t.text, fontWeight: '600' }}>
            {tr('challenges.myProgress', { done: myDays, total })}
          </Text>
          <View style={[styles.track, { backgroundColor: t.surfaceMuted }]}>
            <View style={[styles.fill, { backgroundColor: t.accent, width: `${Math.min(100, (myDays / total) * 100)}%` }]} />
          </View>
        </View>
      )}

      {isParticipant && status === 'active' && (
        <Pressable
          style={[
            styles.primary,
            { backgroundColor: doneToday ? t.success : t.accent, opacity: busy ? 0.6 : 1 },
          ]}
          disabled={busy || doneToday}
          onPress={onCheckIn}
          accessibilityRole="button"
        >
          <Text style={[styles.primaryText, { color: t.onAccent }]}>
            {doneToday ? tr('challenges.checkedIn') : tr('challenges.checkIn')}
          </Text>
        </Pressable>
      )}

      {!isParticipant && status !== 'ended' && (
        <Pressable
          style={[styles.primary, { backgroundColor: t.accent, opacity: busy ? 0.6 : 1 }]}
          disabled={busy}
          onPress={() => run(() => joinChallenge(challengeId))}
          accessibilityRole="button"
        >
          <Text style={[styles.primaryText, { color: t.onAccent }]}>{tr('challenges.join')}</Text>
        </Pressable>
      )}

      <Text style={[styles.section, { color: t.text }]}>
        {tr('challenges.participants')} ({visible.length})
      </Text>
      {visible.map((p) => (
        <View key={p.user_id} style={[styles.row, { borderColor: t.border, backgroundColor: t.surface }]}>
          <Text style={{ color: t.text, flex: 1 }}>{p.display_name}</Text>
          <Text style={{ color: t.textMuted }}>
            {p.days} / {total}
          </Text>
        </View>
      ))}

      {isParticipant && status !== 'ended' && (
        <Pressable onPress={onLeave} disabled={busy} accessibilityRole="button" style={styles.textBtn}>
          <Text style={{ color: t.warning }}>{tr('challenges.leave')}</Text>
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
  card: { borderWidth: 1, borderRadius: radius.lg, padding: space.md, gap: space.sm, marginTop: space.md },
  track: { height: 8, borderRadius: radius.pill, overflow: 'hidden' },
  fill: { height: 8, borderRadius: radius.pill },
  section: { fontSize: 16, fontWeight: '600', marginTop: space.lg },
  primary: { borderRadius: radius.pill, paddingVertical: 16, alignItems: 'center', marginTop: space.md },
  primaryText: { fontSize: 16, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: radius.md, padding: space.md },
  textBtn: { alignItems: 'center', paddingVertical: space.md },
});
