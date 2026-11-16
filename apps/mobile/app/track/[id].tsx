import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Platform, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Polyline } from 'react-native-svg';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useTranslation } from 'react-i18next';
import { font, gradients, lightTheme as t, palette, radius, space } from '@together/ui/tokens';
import { Backdrop } from '../../components/Backdrop';
import { Button, HEADER_SPACE, ProgressRing } from '../../components/ui';
import { FadeIn, Pop } from '../../components/motion';
import { todayIso } from '../../lib/goals';
import { fetchChallenge, fetchMyCheckinsOn, statusOf, trackKind, type Challenge } from '../../lib/challenges';
import { activityErrorKey, cancelActivity, finishActivity, KIND_ICON, startActivity, type FinishResult } from '../../lib/activities';
import {
  captureNow,
  clearTracking,
  clock,
  computeStats,
  downsample,
  ensureTracking,
  getActiveSession,
  getPoints,
  haltTracking,
  haversine,
  pace,
  requestLocationPermissions,
  startTracking,
  stopTracking,
  subscribePoints,
  type ActivityKind,
  type TrackPoint,
  type TrackSession,
} from '../../lib/tracking';

type Phase = 'loading' | 'ready' | 'running' | 'finishing' | 'retry' | 'result';

// Апп-аас түр гарахыг (мэдэгдэл харах гэх мэт) тасалдал гэж үзэхгүй хугацаа.
const FOCUS_GRACE_MS = 15_000;

// Серверийн timestamptz (микросекундтэй) → мс. Hermes 3-аас олон бутархай оронтойг уншдаггүй.
const parseTs = (s: string) => Date.parse(s.replace(/(\.\d{3})\d+/, '$1'));

const ask = (title: string, body: string, ok: string, cancel: string) =>
  new Promise<boolean>((resolve) =>
    Alert.alert(title, body, [
      { text: cancel, style: 'cancel', onPress: () => resolve(false) },
      { text: ok, onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) }),
  );

// Баталгаажуулалттай challenge-ийн хянагч: GPS (гүйлт/алхалт/дугуй), байршил, фокус таймер.
export default function Tracker() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const challengeId = String(id);
  const { t: tr } = useTranslation();
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>('loading');
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [doneToday, setDoneToday] = useState(false);
  const [session, setSession] = useState<TrackSession | null>(null);
  const [other, setOther] = useState<TrackSession | null>(null);
  const [points, setPoints] = useState<TrackPoint[]>([]);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<FinishResult | null>(null);
  const finishing = useRef(false);
  const leftAt = useRef<number | null>(null);

  const kind: ActivityKind | null = challenge ? trackKind(challenge) : null;
  const isGps = kind === 'run' || kind === 'walk' || kind === 'ride';
  const today = todayIso();

  // ---------- ачаалах / идэвхтэй бүртгэлийг сэргээх ----------
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [c, checked] = await Promise.all([
          fetchChallenge(challengeId),
          fetchMyCheckinsOn(today).catch(() => new Set<string>()),
        ]);
        if (!alive) return;
        setChallenge(c);
        setDoneToday(checked.has(challengeId));
        const k = c ? trackKind(c) : null;
        if (k && k !== 'focus') {
          const s = await getActiveSession();
          if (s && s.challengeId === challengeId) {
            setSession(s);
            setPoints(await getPoints());
            await ensureTracking(s).catch(() => {});
            if (alive) setPhase('running');
            return;
          }
          if (s) setOther(s);
        }
        if (alive) setPhase('ready');
      } catch (e: any) {
        Alert.alert(tr('common.error'), String(e?.message ?? e));
        if (alive) setPhase('ready');
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [challengeId]);

  // ---------- цаг ----------
  useEffect(() => {
    if (phase !== 'running') return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [phase]);

  // ---------- GPS цэгүүд ----------
  useEffect(() => {
    if (phase !== 'running' || !kind || kind === 'focus') return;
    const unsub = subscribePoints(setPoints);
    const poll = setInterval(() => getPoints().then(setPoints).catch(() => {}), 5000);
    const app = AppState.addEventListener('change', (st) => {
      if (st === 'active') getPoints().then(setPoints).catch(() => {});
    });
    return () => {
      unsub();
      clearInterval(poll);
      app.remove();
    };
  }, [phase, kind]);

  const offset = session?.offsetMs ?? 0;
  const startLocal = session ? parseTs(session.startedAt) - offset : now;
  const elapsed = session ? Math.max(0, (now - startLocal) / 1000) : 0;
  const stats = useMemo(() => computeStats(points), [points]);
  const requiredSec = (challenge?.min_minutes ?? 0) * 60;
  const goalM = challenge?.min_distance_m ?? 0;

  // ---------- дуусгах ----------
  const finish = useCallback(
    async (interrupted = false) => {
      if (!session || finishing.current) return;
      finishing.current = true;
      setPhase('finishing');
      try {
        let send: TrackPoint[] = [];
        if (session.kind !== 'focus') {
          await captureNow();
          const raw = await haltTracking();
          const serverStart = parseTs(session.startedAt);
          const serverNow = Date.now() + (session.offsetMs ?? 0);
          // Серверийн цагт тааруулж, эхлэхээс өмнөх (кэшлэгдсэн) цэгүүдийг хасна.
          send = downsample(
            raw
              .map((p) => ({ ...p, t: p.t + (session.offsetMs ?? 0) }))
              .filter((p) => p.t >= serverStart - 5000 && p.t <= serverNow + 5000),
          );
        }
        const r = await finishActivity(session.activityId, send, interrupted);
        if (session.kind !== 'focus') await clearTracking();
        if (r.checked_in) setDoneToday(true);
        setResult(r);
        setPhase('result');
      } catch (e: any) {
        if (String(e?.message ?? e).includes('activity_closed')) {
          await clearTracking().catch(() => {});
          Alert.alert(tr('common.error'), tr('track.errors.activity_closed'));
          setSession(null);
          setPhase('ready');
        } else {
          setPhase('retry');
        }
      } finally {
        finishing.current = false;
      }
    },
    [session, tr],
  );
  const finishRef = useRef(finish);
  finishRef.current = finish;

  // ---------- фокус: дэлгэц асаалттай, апп-аас гарвал тасарна, хугацаа дуусахад автоматаар ----------
  useEffect(() => {
    if (phase !== 'running' || kind !== 'focus') return;
    activateKeepAwakeAsync('together-focus').catch(() => {});
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'background') leftAt.current = Date.now();
      else if (st === 'active' && leftAt.current !== null) {
        const away = Date.now() - leftAt.current;
        leftAt.current = null;
        if (away > FOCUS_GRACE_MS) finishRef.current(true);
      }
    });
    return () => {
      sub.remove();
      deactivateKeepAwake('together-focus');
    };
  }, [phase, kind]);

  useEffect(() => {
    if (phase === 'running' && kind === 'focus' && requiredSec > 0 && elapsed >= requiredSec + 1) finishRef.current(false);
  }, [phase, kind, elapsed, requiredSec]);

  // ---------- эхлүүлэх ----------
  const begin = async () => {
    if (!challenge || !kind || busy) return;
    setBusy(true);
    try {
      if (other) {
        const go = await ask(tr('track.otherTitle'), tr('track.otherBody'), tr('track.otherReplace'), tr('common.cancel'));
        if (!go) return;
        await stopTracking();
        setOther(null);
      }
      let background = false;
      if (kind !== 'focus' && Platform.OS !== 'web') {
        const perm = await requestLocationPermissions();
        if (!perm.granted) {
          Alert.alert(tr('track.permTitle'), tr('track.permBody'));
          return;
        }
        background = perm.background;
        if (!background) {
          const go = await ask(tr('track.fgOnlyTitle'), tr('track.fgOnlyBody'), tr('track.startAnyway'), tr('common.cancel'));
          if (!go) return;
        }
      }
      const a = await startActivity(challengeId, kind);
      const serverMs = parseTs(a.started_at);
      const offsetMs = Number.isFinite(serverMs) ? serverMs - Date.now() : 0;
      let s: TrackSession = { activityId: a.id, challengeId, kind, startedAt: a.started_at, background, offsetMs };
      if (kind !== 'focus') {
        try {
          s = await startTracking(s);
        } catch (e) {
          await cancelActivity(a.id).catch(() => {});
          throw e;
        }
      }
      finishing.current = false;
      setSession(s);
      setPoints([]);
      setResult(null);
      setPhase('running');
    } catch (e: any) {
      const key = activityErrorKey(e);
      Alert.alert(tr('common.error'), key ? tr(key) : String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const onFinishPress = async () => {
    if (!session) return;
    if (isGps && stats.distance < goalM) {
      const go = await ask(
        tr('track.shortTitle'),
        tr('track.shortBody', { done: km(stats.distance), goal: km(goalM) }),
        tr('track.finish'),
        tr('track.keepGoing'),
      );
      if (!go) return;
    }
    if (kind === 'place' && elapsed < requiredSec) {
      const go = await ask(
        tr('track.shortTitle'),
        tr('track.placeShortBody', { left: Math.ceil((requiredSec - elapsed) / 60) }),
        tr('track.finish'),
        tr('track.keepGoing'),
      );
      if (!go) return;
    }
    finish(false);
  };

  const onCancel = async () => {
    if (!session) return;
    const go = await ask(tr('track.cancelTitle'), tr('track.cancelBody'), tr('track.cancelYes'), tr('track.keepGoing'));
    if (!go) return;
    if (session.kind !== 'focus') await stopTracking().catch(() => {});
    await cancelActivity(session.activityId).catch(() => {});
    setSession(null);
    setPhase('ready');
  };

  // ---------- дэлгэц ----------
  if (phase === 'loading') {
    return (
      <View style={[styles.center, { backgroundColor: t.background }]}>
        <ActivityIndicator color={t.accent} />
      </View>
    );
  }
  if (!challenge || !kind) {
    return (
      <View style={[styles.center, { backgroundColor: t.background }]}>
        <Backdrop />
        <Text style={styles.muted}>{tr('challenges.errors.challenge_not_found')}</Text>
      </View>
    );
  }

  const status = statusOf(challenge, today);
  const title = tr(`track.title.${kind}`);

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <Stack.Screen
        options={{
          title: '',
          headerTransparent: true,
          headerStyle: { backgroundColor: 'transparent' },
          headerBackVisible: phase !== 'finishing',
        }}
      />
      <Backdrop />
      <ScrollView contentContainerStyle={styles.screen}>
        <FadeIn index={0}>
          <Text style={styles.kicker}>{title}</Text>
          <Text style={styles.title} numberOfLines={2}>
            {challenge.title}
          </Text>
          <Text style={styles.muted}>{requirement(challenge, kind, tr)}</Text>
        </FadeIn>

        {phase === 'ready' && (
          <ReadyView
            kind={kind}
            canStart={status === 'active'}
            status={status}
            doneToday={doneToday}
            other={other}
            busy={busy}
            onStart={begin}
            onOpenOther={() => other?.challengeId && router.replace(`/track/${other.challengeId}` as never)}
          />
        )}

        {(phase === 'running' || phase === 'finishing' || phase === 'retry') && session && (
          <>
            {isGps && <GpsView kind={kind} elapsed={elapsed} stats={stats} goalM={goalM} points={points} background={session.background} />}
            {kind === 'place' && (
              <PlaceView challenge={challenge} elapsed={elapsed} requiredSec={requiredSec} points={points} background={session.background} />
            )}
            {kind === 'focus' && <FocusView elapsed={elapsed} requiredSec={requiredSec} />}

            {phase === 'retry' ? (
              <View style={styles.retry}>
                <Ionicons name="cloud-offline" size={20} color={palette.rose} />
                <Text style={[styles.note, { flex: 1 }]}>{tr('track.sendFailed')}</Text>
              </View>
            ) : null}

            <View style={{ gap: 10, marginTop: space.md }}>
              {kind !== 'focus' || phase === 'retry' ? (
                <Button
                  label={phase === 'retry' ? tr('track.retry') : tr('track.finish')}
                  icon={phase === 'retry' ? 'refresh' : 'stop'}
                  onPress={phase === 'retry' ? () => finish(false) : onFinishPress}
                  loading={phase === 'finishing'}
                />
              ) : (
                phase === 'finishing' && <ActivityIndicator color={t.accent} />
              )}
              {phase !== 'finishing' && (
                <Button label={kind === 'focus' ? tr('track.giveUp') : tr('track.cancel')} variant="ghost" onPress={onCancel} />
              )}
            </View>
          </>
        )}

        {phase === 'result' && result && (
          <ResultView
            kind={kind}
            result={result}
            goalM={goalM}
            onDone={() => router.back()}
            onAgain={() => {
              setSession(null);
              setPoints([]);
              setPhase('ready');
            }}
          />
        )}
      </ScrollView>
    </View>
  );
}

// ---------- туслах ----------
const km = (m: number) => (m / 1000).toFixed(2);

function requirement(c: Challenge, kind: ActivityKind, tr: (k: string, o?: any) => string) {
  if (kind === 'place') return tr('track.req.place', { name: c.place_name ?? '', min: c.min_minutes ?? 0, r: c.place_radius_m ?? 0 });
  if (kind === 'focus') return tr('track.req.focus', { min: c.min_minutes ?? 0 });
  return tr(`track.req.${kind}`, { km: ((c.min_distance_m ?? 0) / 1000).toString() });
}

function ReadyView({
  kind,
  canStart,
  status,
  doneToday,
  other,
  busy,
  onStart,
  onOpenOther,
}: {
  kind: ActivityKind;
  canStart: boolean;
  status: 'upcoming' | 'active' | 'ended';
  doneToday: boolean;
  other: TrackSession | null;
  busy: boolean;
  onStart: () => void;
  onOpenOther: () => void;
}) {
  const { t: tr } = useTranslation();
  const rules = tr(`track.rules.${kind}`, { returnObjects: true }) as unknown as string[];
  return (
    <>
      <FadeIn index={1} style={styles.heroWrap}>
        <LinearGradient colors={gradients.card} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <Text style={{ fontSize: 64 }}>{KIND_ICON[kind]}</Text>
        </LinearGradient>
      </FadeIn>

      <FadeIn index={2} style={styles.card}>
        <Text style={styles.cardTitle}>{tr('track.howItWorks')}</Text>
        {(Array.isArray(rules) ? rules : []).map((r, i) => (
          <View key={i} style={styles.rule}>
            <Ionicons name="shield-checkmark" size={16} color={palette.lilac} style={{ marginTop: 2 }} />
            <Text style={[styles.note, { flex: 1 }]}>{r}</Text>
          </View>
        ))}
      </FadeIn>

      {other && (
        <FadeIn index={3} style={[styles.card, { borderColor: 'rgba(251,191,36,0.4)' }]}>
          <Text style={styles.cardTitle}>{tr('track.otherTitle')}</Text>
          <Text style={styles.note}>{tr('track.otherHint')}</Text>
          <Button label={tr('track.openOther')} variant="secondary" icon="navigate" onPress={onOpenOther} />
        </FadeIn>
      )}

      {doneToday && (
        <View style={styles.doneBanner}>
          <Ionicons name="checkmark-circle" size={18} color={palette.mint} />
          <Text style={[styles.note, { flex: 1 }]}>{tr('track.doneToday')}</Text>
        </View>
      )}

      {!canStart && (
        <Text style={[styles.note, { textAlign: 'center' }]}>
          {status === 'upcoming' ? tr('track.notStarted') : tr('challenges.statusEnded')}
        </Text>
      )}

      <View style={{ marginTop: space.sm }}>
        <Button label={tr('track.start')} icon="play" onPress={onStart} loading={busy} disabled={!canStart} />
      </View>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function LiveBadge({ background }: { background: boolean }) {
  const { t: tr } = useTranslation();
  return (
    <View style={styles.badges}>
      <View style={[styles.badge, { backgroundColor: 'rgba(251,113,133,0.16)', borderColor: 'rgba(251,113,133,0.4)' }]}>
        <View style={styles.liveDot} />
        <Text style={styles.badgeText}>{tr('track.recording')}</Text>
      </View>
      <View style={styles.badge}>
        <Ionicons name={background ? 'lock-closed' : 'phone-portrait'} size={12} color={background ? palette.mint : palette.amber} />
        <Text style={styles.badgeText}>{background ? tr('track.bgOn') : tr('track.bgOff')}</Text>
      </View>
    </View>
  );
}

function GpsBadge({ accuracy }: { accuracy: number | null }) {
  const { t: tr } = useTranslation();
  const color = accuracy === null || accuracy > 50 ? palette.rose : accuracy > 15 ? palette.amber : palette.mint;
  return (
    <View style={styles.badge}>
      <Ionicons name="radio" size={12} color={color} />
      <Text style={styles.badgeText}>
        {accuracy === null ? tr('track.gpsSearching') : accuracy > 50 ? tr('track.gpsWeak') : `GPS ±${Math.round(accuracy)} м`}
      </Text>
    </View>
  );
}

function GpsView({
  kind,
  elapsed,
  stats,
  goalM,
  points,
  background,
}: {
  kind: ActivityKind;
  elapsed: number;
  stats: ReturnType<typeof computeStats>;
  goalM: number;
  points: TrackPoint[];
  background: boolean;
}) {
  const { t: tr } = useTranslation();
  const { width } = useWindowDimensions();
  const pct = goalM > 0 ? Math.min(1, stats.distance / goalM) : 0;
  const reached = goalM > 0 && stats.distance >= goalM;
  return (
    <>
      <LiveBadge background={background} />
      <View style={styles.bigWrap}>
        <Pop trigger={reached}>
          <Text style={styles.big}>{km(stats.distance)}</Text>
        </Pop>
        <Text style={styles.bigUnit}>{tr('track.km')}</Text>
      </View>
      <View style={styles.stats}>
        <Stat label={tr('track.time')} value={clock(elapsed)} />
        {kind === 'ride' ? (
          <Stat label={tr('track.speed')} value={`${(stats.speed * 3.6).toFixed(1)}`} />
        ) : (
          <Stat label={tr('track.pace')} value={pace(stats.speed)} />
        )}
        <View style={styles.stat}>
          <GpsBadge accuracy={stats.accuracy} />
        </View>
      </View>
      <View style={{ gap: 6 }}>
        <View style={styles.trackBar}>
          <LinearGradient
            colors={reached ? [palette.mint, '#10B981'] : gradients.brand}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={[styles.fill, { width: `${Math.max(2, pct * 100)}%` }]}
          />
        </View>
        <Text style={styles.note}>
          {reached ? tr('track.goalReached') : tr('track.goalLeft', { done: km(stats.distance), goal: km(goalM) })}
        </Text>
      </View>
      <RouteCard points={points} width={width - 40} />
    </>
  );
}

function RouteCard({ points, width }: { points: TrackPoint[]; width: number }) {
  const { t: tr } = useTranslation();
  const h = 200;
  const route = useMemo(() => project(points, width, h), [points, width]);
  return (
    <View style={[styles.card, { padding: 0, overflow: 'hidden', height: h }]}>
      {route ? (
        <Svg width={width} height={h}>
          <Polyline points={route.path} fill="none" stroke={palette.violet} strokeWidth={10} strokeOpacity={0.25} strokeLinejoin="round" strokeLinecap="round" />
          <Polyline points={route.path} fill="none" stroke={palette.lilac} strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" />
          <Circle cx={route.start[0]} cy={route.start[1]} r={6} fill={palette.mint} />
          <Circle cx={route.end[0]} cy={route.end[1]} r={8} fill={palette.orange} stroke="#FFFFFF" strokeWidth={2} />
        </Svg>
      ) : (
        <View style={styles.center}>
          <Ionicons name="map-outline" size={28} color={t.textFaint} />
          <Text style={[styles.note, { marginTop: 6 }]}>{tr('track.routeEmpty')}</Text>
        </View>
      )}
    </View>
  );
}

// Газрын зураггүйгээр маршрутыг хайрцагт багтааж зурна (equirectangular).
function project(points: TrackPoint[], w: number, h: number, pad = 18) {
  const good = downsample(points.filter((p) => p.acc <= 50), 400);
  if (good.length < 2) return null;
  const k = Math.cos((good[0].lat * Math.PI) / 180);
  const xs = good.map((p) => p.lng * k);
  const ys = good.map((p) => p.lat);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = Math.max(maxX - minX, 1e-6);
  const spanY = Math.max(maxY - minY, 1e-6);
  const scale = Math.min((w - pad * 2) / spanX, (h - pad * 2) / spanY);
  const ox = (w - spanX * scale) / 2;
  const oy = (h - spanY * scale) / 2;
  const xy = good.map((_, i) => [ox + (xs[i] - minX) * scale, h - (oy + (ys[i] - minY) * scale)] as const);
  return {
    path: xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' '),
    start: xy[0],
    end: xy[xy.length - 1],
  };
}

function PlaceView({
  challenge,
  elapsed,
  requiredSec,
  points,
  background,
}: {
  challenge: Challenge;
  elapsed: number;
  requiredSec: number;
  points: TrackPoint[];
  background: boolean;
}) {
  const { t: tr } = useTranslation();
  const center = { lat: challenge.place_lat ?? 0, lng: challenge.place_lng ?? 0, t: 0, acc: 0 };
  const r = challenge.place_radius_m ?? 100;
  const usable = points.filter((p) => p.acc <= 100);
  const last = usable[usable.length - 1];
  const dist = last ? haversine(center, last) : null;
  const inside = dist !== null && dist <= r + Math.min(last?.acc ?? 0, 50);
  const insideCount = usable.filter((p) => haversine(center, p) <= r + Math.min(p.acc, 50)).length;
  const done = elapsed >= requiredSec;
  return (
    <>
      <LiveBadge background={background} />
      <View style={{ alignItems: 'center', marginVertical: space.md }}>
        <ProgressRing progress={requiredSec ? elapsed / requiredSec : 0} size={200} stroke={14}>
          <Text style={styles.ringBig}>{clock(elapsed)}</Text>
          <Text style={styles.note}>/ {tr('track.min', { n: Math.round(requiredSec / 60) })}</Text>
        </ProgressRing>
      </View>
      <View
        style={[
          styles.zone,
          dist === null
            ? null
            : inside
              ? { backgroundColor: 'rgba(52,211,153,0.12)', borderColor: 'rgba(52,211,153,0.5)' }
              : { backgroundColor: 'rgba(251,113,133,0.12)', borderColor: 'rgba(251,113,133,0.5)' },
        ]}
      >
        <Ionicons
          name={dist === null ? 'locate' : inside ? 'checkmark-circle' : 'alert-circle'}
          size={22}
          color={dist === null ? palette.lilac : inside ? palette.mint : palette.rose}
        />
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>
            {dist === null ? tr('track.gpsSearching') : inside ? tr('track.inside', { name: challenge.place_name ?? '' }) : tr('track.outside')}
          </Text>
          {dist !== null && <Text style={styles.note}>{tr('track.fromCenter', { m: Math.round(dist) })}</Text>}
        </View>
      </View>
      <View style={styles.stats}>
        <Stat label={tr('track.samples')} value={`${insideCount}/${usable.length}`} />
        <Stat label={tr('track.remaining')} value={done ? '✓' : clock(requiredSec - elapsed)} />
      </View>
    </>
  );
}

function FocusView({ elapsed, requiredSec }: { elapsed: number; requiredSec: number }) {
  const { t: tr } = useTranslation();
  const left = Math.max(0, requiredSec - elapsed);
  return (
    <>
      <View style={{ alignItems: 'center', marginVertical: space.lg }}>
        <ProgressRing progress={requiredSec ? elapsed / requiredSec : 0} size={240} stroke={16}>
          <Text style={[styles.ringBig, { fontSize: 46 }]}>{clock(left)}</Text>
          <Text style={styles.note}>{tr('track.focusLeft')}</Text>
        </ProgressRing>
      </View>
      <View style={styles.card}>
        <View style={styles.rule}>
          <Ionicons name="phone-portrait" size={16} color={palette.amber} style={{ marginTop: 2 }} />
          <Text style={[styles.note, { flex: 1 }]}>{tr('track.focusStay')}</Text>
        </View>
      </View>
    </>
  );
}

function ResultView({
  kind,
  result,
  goalM,
  onDone,
  onAgain,
}: {
  kind: ActivityKind;
  result: FinishResult;
  goalM: number;
  onDone: () => void;
  onAgain: () => void;
}) {
  const { t: tr } = useTranslation();
  const ok = result.verified && result.meets;
  const icon = ok ? 'checkmark' : result.verified ? 'flag' : 'close';
  const colors = ok ? ([palette.mint, '#10B981'] as const) : result.verified ? ([palette.amber, palette.orange] as const) : ([palette.rose, '#E11D48'] as const);
  const headline = ok ? tr('track.okTitle') : result.verified ? tr('track.shortResultTitle') : tr('track.failTitle');
  const body = ok
    ? result.checked_in
      ? tr('track.okBody', { xp: result.checkin?.xp_gained ?? 25 })
      : tr('track.okNoCheckin')
    : result.verified
      ? tr('track.shortResultBody', { done: km(result.distance_m), goal: km(goalM) })
      : tr(`track.reason.${result.reason ?? 'unknown'}`, { defaultValue: tr('track.reason.unknown') });
  return (
    <>
      <View style={{ alignItems: 'center', marginTop: space.lg, gap: space.md }}>
        <Pop trigger={result}>
          <LinearGradient colors={colors} style={styles.resultIcon}>
            <Ionicons name={icon} size={44} color="#FFFFFF" />
          </LinearGradient>
        </Pop>
        <Text style={[styles.title, { textAlign: 'center' }]}>{headline}</Text>
        <Text style={[styles.muted, { textAlign: 'center' }]}>{body}</Text>
      </View>
      <View style={styles.stats}>
        {kind !== 'focus' && kind !== 'place' && <Stat label={tr('track.km')} value={km(result.distance_m)} />}
        <Stat label={tr('track.time')} value={clock(result.duration_s)} />
        {(kind === 'run' || kind === 'walk') && <Stat label={tr('track.pace')} value={pace(result.avg_speed_mps)} />}
        {kind === 'ride' && <Stat label={tr('track.speed')} value={(result.avg_speed_mps * 3.6).toFixed(1)} />}
      </View>
      <View style={{ gap: 10, marginTop: space.md }}>
        <Button label={tr('track.done')} onPress={onDone} />
        {!ok && <Button label={tr('track.tryAgain')} variant="secondary" icon="refresh" onPress={onAgain} />}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 20, paddingTop: HEADER_SPACE, gap: space.md, paddingBottom: 48 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  kicker: { fontFamily: font.bold, fontSize: 13, color: palette.lilac, letterSpacing: 0.6, textTransform: 'uppercase' },
  title: { fontFamily: font.extrabold, fontSize: 26, lineHeight: 32, color: t.text, marginTop: 4 },
  muted: { fontFamily: font.medium, fontSize: 15, lineHeight: 21, color: t.textMuted, marginTop: 4 },
  note: { fontFamily: font.medium, fontSize: 13, lineHeight: 19, color: t.textMuted },
  heroWrap: { alignItems: 'center', marginVertical: space.sm },
  hero: { width: 140, height: 140, borderRadius: 70, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' },
  card: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 22, padding: space.md, gap: 10 },
  cardTitle: { fontFamily: font.bold, fontSize: 15, color: t.text },
  rule: { flexDirection: 'row', gap: 10 },
  doneBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 16,
    backgroundColor: 'rgba(52,211,153,0.10)', borderWidth: 1, borderColor: 'rgba(52,211,153,0.35)',
  },
  badges: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: radius.pill, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border,
  },
  badgeText: { fontFamily: font.semibold, fontSize: 12, color: t.text },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: palette.rose },
  bigWrap: { alignItems: 'center', marginTop: space.sm },
  big: { fontFamily: font.extrabold, fontSize: 76, lineHeight: 84, color: t.text, letterSpacing: -2 },
  bigUnit: { fontFamily: font.semibold, fontSize: 14, color: t.textMuted, marginTop: -4 },
  stats: { flexDirection: 'row', gap: 10 },
  stat: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, paddingVertical: 14, borderRadius: 18,
    backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, minHeight: 68,
  },
  statValue: { fontFamily: font.extrabold, fontSize: 22, color: t.text },
  statLabel: { fontFamily: font.medium, fontSize: 12, color: t.textMuted },
  trackBar: { height: 10, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  fill: { height: 10, borderRadius: radius.pill },
  ringBig: { fontFamily: font.extrabold, fontSize: 38, color: t.text },
  zone: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: t.border, backgroundColor: t.surface },
  retry: {
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 16,
    backgroundColor: 'rgba(251,113,133,0.10)', borderWidth: 1, borderColor: 'rgba(251,113,133,0.35)',
  },
  resultIcon: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center' },
});
