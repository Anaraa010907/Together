import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import i18n from './i18n';

// GPS бүртгэл: дэлгэц түгжээтэй үед ч (Android foreground service / iOS background location) цэг цуглуулна.
// Цэгүүдийг AsyncStorage-д хадгална — апп арын төлөвт эсвэл хаагдаад дахин нээгдсэн ч алдагдахгүй.
// Анхаар: TaskManager.defineTask нь апп ачаалахад (module scope) бүртгэгдэх ёстой — _layout энэ файлыг import хийнэ.

export const TRACK_TASK = 'together-activity-tracking';
const POINTS_KEY = 'together:track:points';
const SESSION_KEY = 'together:track:session';

export type ActivityKind = 'run' | 'walk' | 'ride' | 'place' | 'focus';
export type TrackPoint = { lat: number; lng: number; t: number; acc: number; mocked?: boolean };
export type TrackSession = {
  activityId: string;
  // Challenge эсвэл (target = 'goal' үед) өдрийн зорилгын id.
  challengeId: string | null;
  target?: 'challenge' | 'goal';
  kind: ActivityKind;
  startedAt: string;
  background: boolean;
  // Серверийн цаг − утасны цаг (мс). Цэгийн цагийг серверийн цагт тааруулахад.
  offsetMs?: number;
};

const listeners = new Set<(points: TrackPoint[]) => void>();
let foregroundSub: Location.LocationSubscription | null = null;
let queue: Promise<void> = Promise.resolve();

const toPoint = (l: Location.LocationObject): TrackPoint => ({
  lat: l.coords.latitude,
  lng: l.coords.longitude,
  t: l.timestamp,
  acc: l.coords.accuracy ?? 999,
  mocked: l.mocked === true ? true : undefined,
});

// Бичилтийг дараалуулна (нэг зэрэг хоёр бичилт өгөгдөл дарахаас сэргийлнэ).
function appendPoints(points: TrackPoint[]) {
  queue = queue.then(async () => {
    const raw = await AsyncStorage.getItem(POINTS_KEY);
    const all: TrackPoint[] = raw ? JSON.parse(raw) : [];
    for (const p of points) {
      const last = all[all.length - 1];
      if (!last || p.t > last.t) all.push(p);
    }
    await AsyncStorage.setItem(POINTS_KEY, JSON.stringify(all));
    listeners.forEach((l) => l(all));
  });
  return queue;
}

if (Platform.OS !== 'web') {
  TaskManager.defineTask(TRACK_TASK, async ({ data, error }) => {
    if (error || !data) return;
    const { locations } = data as { locations: Location.LocationObject[] };
    if (locations?.length) await appendPoints(locations.map(toPoint));
  });
}

export function subscribePoints(listener: (points: TrackPoint[]) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function getPoints(): Promise<TrackPoint[]> {
  const raw = await AsyncStorage.getItem(POINTS_KEY);
  return raw ? JSON.parse(raw) : [];
}

export async function getActiveSession(): Promise<TrackSession | null> {
  const raw = await AsyncStorage.getItem(SESSION_KEY);
  return raw ? JSON.parse(raw) : null;
}

// Зөвшөөрөл: эхлээд "апп ашиглах үед", дараа нь "үргэлж" (дэлгэц түгжээтэй үед хянахад).
export async function requestLocationPermissions(): Promise<{ granted: boolean; background: boolean }> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') return { granted: false, background: false };
  let background = false;
  try {
    const bg = await Location.requestBackgroundPermissionsAsync();
    background = bg.status === 'granted';
  } catch {
    background = false;
  }
  return { granted: true, background };
}

function optionsFor(kind: ActivityKind): Location.LocationTaskOptions {
  // Байршлын check-in: минут тутам; GPS идэвхжил: 3 сек / 5 м тутам.
  return kind === 'place'
    ? { accuracy: Location.Accuracy.High, timeInterval: 60_000, distanceInterval: 0 }
    : { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 3000, distanceInterval: 5 };
}

function backgroundOptions(session: TrackSession): Location.LocationTaskOptions {
  return {
    ...optionsFor(session.kind),
    activityType: Location.ActivityType.Fitness,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: i18n.t('track.notifTitle'),
      notificationBody: i18n.t(`track.notifBody.${session.kind}`),
      notificationColor: '#8B5CF6',
    },
  };
}

// Шинэ бүртгэл эхлүүлнэ. Арын горим амжилтгүй бол урд талын горимд шилжиж, хэрэглэсэн горимыг буцаана.
export async function startTracking(session: TrackSession): Promise<TrackSession> {
  await stopUpdates();
  await AsyncStorage.multiSet([
    [SESSION_KEY, JSON.stringify(session)],
    [POINTS_KEY, '[]'],
  ]);
  let used = session;
  if (session.background) {
    try {
      await Location.startLocationUpdatesAsync(TRACK_TASK, backgroundOptions(session));
    } catch {
      used = { ...session, background: false };
      await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(used));
    }
  }
  if (!used.background) {
    foregroundSub = await Location.watchPositionAsync(optionsFor(session.kind), (l) => {
      appendPoints([toPoint(l)]);
    });
  }
  // Эхний цэгийг шууд авна (хүлээлгүй).
  Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
    .then((l) => appendPoints([toPoint(l)]))
    .catch(() => {});
  return used;
}

// Апп дахин нээгдэхэд бүртгэлийг сэргээнэ (цуглуулсан цэгүүдийг устгахгүй).
export async function ensureTracking(session: TrackSession) {
  const opts = optionsFor(session.kind);
  if (session.background && Platform.OS !== 'web') {
    try {
      if (await Location.hasStartedLocationUpdatesAsync(TRACK_TASK)) return;
      await Location.startLocationUpdatesAsync(TRACK_TASK, backgroundOptions(session));
      return;
    } catch {
      // арын горим эхлэхгүй бол урд талын горимд шилжинэ
    }
  }
  if (foregroundSub) return;
  foregroundSub = await Location.watchPositionAsync(opts, (l) => {
    appendPoints([toPoint(l)]);
  });
}

// Яг одоогийн байршлыг нэмнэ (дуусгахын өмнө сүүлийн цэг).
export async function captureNow() {
  try {
    const l = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    await appendPoints([toPoint(l)]);
  } catch {
    // байршил авч чадсангүй — байгаа цэгүүдээр үргэлжилнэ
  }
}

async function stopUpdates() {
  foregroundSub?.remove();
  foregroundSub = null;
  if (Platform.OS === 'web') return;
  try {
    if (await Location.hasStartedLocationUpdatesAsync(TRACK_TASK)) await Location.stopLocationUpdatesAsync(TRACK_TASK);
  } catch {
    // ажиллаагүй байсан
  }
}

// Бүртгэлийг зогсоож цэгүүдийг буцаана — хадгалсан өгөгдлийг устгахгүй (илгээлт амжилтгүй бол дахин оролдоно).
export async function haltTracking(): Promise<TrackPoint[]> {
  await stopUpdates();
  await queue;
  return getPoints();
}

export async function clearTracking() {
  await stopUpdates();
  await queue;
  await AsyncStorage.multiRemove([SESSION_KEY, POINTS_KEY]);
}

export async function stopTracking(): Promise<TrackPoint[]> {
  const points = await haltTracking();
  await clearTracking();
  return points;
}

// ---------- Тооцоо (апп дээрх шууд харагдах статистик; эцсийн дүнг сервер дахин тооцно) ----------
export function haversine(a: TrackPoint, b: TrackPoint) {
  const R = 6371008.8;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function computeStats(points: TrackPoint[]) {
  let distance = 0;
  let moving = 0;
  let prev: TrackPoint | null = null;
  for (const p of points) {
    if (p.acc > 50) continue;
    if (prev) {
      const dt = (p.t - prev.t) / 1000;
      if (dt > 0 && dt <= 120) {
        distance += haversine(prev, p);
        moving += dt;
      }
    }
    prev = p;
  }
  const last = points[points.length - 1];
  return {
    distance,
    moving,
    accuracy: last?.acc ?? null,
    speed: moving > 0 ? distance / moving : 0,
  };
}

// Сервер 3000 цэг хүртэл авна — илүү бол жигд сийрүүлнэ (эхний, сүүлийн цэг үлдэнэ).
export function downsample(points: TrackPoint[], max = 2500) {
  if (points.length <= max) return points;
  const step = points.length / max;
  const out: TrackPoint[] = [];
  for (let i = 0; i < max - 1; i++) out.push(points[Math.floor(i * step)]);
  out.push(points[points.length - 1]);
  return out;
}

// 5:42 /км хэлбэрийн хурд.
export function pace(speedMps: number) {
  if (!speedMps || speedMps < 0.3) return '–';
  const secPerKm = 1000 / speedMps;
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function clock(totalSec: number) {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${m}:${String(ss).padStart(2, '0')}`;
}
