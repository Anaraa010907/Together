import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import i18n from './i18n';

// Төхөөрөмж дээрх local сануулга: push сервер шаардахгүй.
const KEY = (sessionId: string) => `reminder:${sessionId}`;
const LEAD_MS = 15 * 60_000;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function ensurePermission() {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

// Эхлэхээс 15 минутын өмнө. Хэтэрсэн бол сануулга тавихгүй. Буцаах: тавьсан эсэх.
export async function scheduleSessionReminder(sessionId: string, title: string, startsAt: string) {
  const fireAt = new Date(new Date(startsAt).getTime() - LEAD_MS);
  if (fireAt.getTime() <= Date.now()) return false;
  if (!(await ensurePermission())) return false;

  await cancelSessionReminder(sessionId);
  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: i18n.t('sessions.reminderTitle'),
      body: i18n.t('sessions.reminderBody', { title }),
      data: { sessionId },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireAt },
  });
  await AsyncStorage.setItem(KEY(sessionId), id);
  return true;
}

export async function cancelSessionReminder(sessionId: string) {
  const id = await AsyncStorage.getItem(KEY(sessionId));
  if (id) {
    await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
    await AsyncStorage.removeItem(KEY(sessionId));
  }
}
