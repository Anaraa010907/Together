import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { lightTheme as t, radius, space } from '@together/ui/tokens';
import { createSession, sessionErrorKey } from '../../lib/sessions';
import { scheduleSessionReminder } from '../../lib/reminders';

const DURATIONS = [30, 60, 90, 120];
const DAYS_AHEAD = 14;

// Сешн товлох: өдөр (дараагийн 14 хоног), цаг (HH:MM), үргэлжлэх хугацаа, линк.
export default function NewSession() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const { t: tr } = useTranslation();
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dayOffset, setDayOffset] = useState(0);
  const [time, setTime] = useState('20:00');
  const [duration, setDuration] = useState(60);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);

  const days = useMemo(
    () =>
      Array.from({ length: DAYS_AHEAD }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() + i);
        return d;
      }),
    [],
  );

  const onCreate = async () => {
    const name = title.trim();
    const link = url.trim();
    const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(time.trim());
    if (name.length < 2 || name.length > 100) return Alert.alert(tr('common.error'), tr('sessions.errors.invalid_title'));
    if (!m) return Alert.alert(tr('common.error'), tr('sessions.timeInvalid'));
    if (link && !/^https:\/\/\S+$/i.test(link)) return Alert.alert(tr('common.error'), tr('sessions.errors.invalid_url'));

    const start = new Date(days[dayOffset]);
    start.setHours(Number(m[1]), Number(m[2]), 0, 0);
    if (start.getTime() < Date.now()) return Alert.alert(tr('common.error'), tr('sessions.errors.invalid_start'));

    setBusy(true);
    try {
      const id = await createSession({
        groupId: String(groupId),
        title: name,
        description: description.trim() || undefined,
        startsAt: start,
        durationMin: duration,
        meetingUrl: link || undefined,
      });
      // Хөтлөгч автоматаар "Очно" тул сануулга тавина.
      await scheduleSessionReminder(id, name, start.toISOString()).catch(() => false);
      router.replace(`/session/${id}` as never);
    } catch (e: any) {
      const key = sessionErrorKey(e);
      Alert.alert(tr('common.error'), key ? tr(key) : String(e.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={{ backgroundColor: t.background }} contentContainerStyle={styles.screen}>
      <Text style={[styles.title, { color: t.text }]}>{tr('sessions.createTitle')}</Text>

      <Text style={[styles.label, { color: t.textMuted }]}>{tr('sessions.name')}</Text>
      <TextInput
        style={[styles.input, { borderColor: t.border, backgroundColor: t.surface, color: t.text }]}
        value={title}
        onChangeText={setTitle}
        maxLength={100}
        placeholder={tr('sessions.namePlaceholder')}
        placeholderTextColor={t.textMuted}
        accessibilityLabel={tr('sessions.name')}
      />

      <Text style={[styles.label, { color: t.textMuted }]}>{tr('sessions.description')}</Text>
      <TextInput
        style={[styles.input, styles.multiline, { borderColor: t.border, backgroundColor: t.surface, color: t.text }]}
        value={description}
        onChangeText={setDescription}
        multiline
        maxLength={1000}
        accessibilityLabel={tr('sessions.description')}
      />

      <Text style={[styles.label, { color: t.textMuted }]}>{tr('sessions.day')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
        {days.map((d, i) => {
          const active = i === dayOffset;
          const label =
            i === 0 ? tr('challenges.today') : i === 1 ? tr('challenges.tomorrow') : `${d.getMonth() + 1}/${d.getDate()}`;
          return (
            <Pressable
              key={i}
              onPress={() => setDayOffset(i)}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              style={[styles.dayChip, { borderColor: t.border, backgroundColor: active ? t.accent : t.surface }]}
            >
              <Text style={{ color: active ? t.onAccent : t.textMuted, fontSize: 12 }}>{tr(`time.wd${d.getDay()}`)}</Text>
              <Text style={{ color: active ? t.onAccent : t.text, fontWeight: '700' }}>{label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Text style={[styles.label, { color: t.textMuted }]}>{tr('sessions.time')}</Text>
      <TextInput
        style={[styles.input, { borderColor: t.border, backgroundColor: t.surface, color: t.text }]}
        value={time}
        onChangeText={setTime}
        keyboardType="numbers-and-punctuation"
        maxLength={5}
        placeholder="20:00"
        placeholderTextColor={t.textMuted}
        accessibilityLabel={tr('sessions.time')}
      />

      <Text style={[styles.label, { color: t.textMuted }]}>{tr('sessions.duration')}</Text>
      <View style={styles.chips}>
        {DURATIONS.map((d) => {
          const active = d === duration;
          return (
            <Pressable
              key={d}
              onPress={() => setDuration(d)}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              style={[styles.chip, { borderColor: t.border, backgroundColor: active ? t.accent : t.surface }]}
            >
              <Text style={{ color: active ? t.onAccent : t.text, fontWeight: '600' }}>
                {tr('sessions.minutes', { n: d })}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={[styles.label, { color: t.textMuted }]}>{tr('sessions.link')}</Text>
      <TextInput
        style={[styles.input, { borderColor: t.border, backgroundColor: t.surface, color: t.text }]}
        value={url}
        onChangeText={setUrl}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        placeholder="https://meet.google.com/…"
        placeholderTextColor={t.textMuted}
        accessibilityLabel={tr('sessions.link')}
      />
      <Text style={[styles.hint, { color: t.textMuted }]}>{tr('sessions.linkHint')}</Text>

      <Pressable
        style={[styles.primary, { backgroundColor: t.accent, opacity: busy ? 0.6 : 1 }]}
        disabled={busy}
        onPress={onCreate}
        accessibilityRole="button"
      >
        {busy ? (
          <ActivityIndicator color={t.onAccent} />
        ) : (
          <Text style={[styles.primaryText, { color: t.onAccent }]}>{tr('sessions.createAction')}</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { padding: space.lg, gap: space.sm, paddingBottom: space.xl },
  title: { fontSize: 24, fontWeight: '700', marginBottom: space.sm },
  label: { fontSize: 13, marginTop: space.sm },
  hint: { fontSize: 12 },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: 12, fontSize: 16 },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  dayChip: { borderWidth: 1, borderRadius: radius.md, paddingVertical: 8, paddingHorizontal: space.md, alignItems: 'center', minWidth: 64 },
  chips: { flexDirection: 'row', gap: space.sm },
  chip: { flex: 1, borderWidth: 1, borderRadius: radius.pill, paddingVertical: 10, alignItems: 'center' },
  primary: { borderRadius: radius.pill, paddingVertical: 16, alignItems: 'center', marginTop: space.lg },
  primaryText: { fontSize: 16, fontWeight: '600' },
});
