import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { font, lightTheme as t, radius } from '@together/ui/tokens';
import { Body, Button, Field, Screen } from '../../components/ui';
import { createGoal, type GoalConfig } from '../../lib/goals';

type Mode = 'manual' | 'run' | 'walk' | 'ride' | 'focus';
const MODES: { key: Mode; icon: string }[] = [
  { key: 'manual', icon: '✅' },
  { key: 'run', icon: '🏃' },
  { key: 'walk', icon: '🚶' },
  { key: 'ride', icon: '🚴' },
  { key: 'focus', icon: '⏱️' },
];
const DISTANCES: Record<'run' | 'walk' | 'ride', number[]> = { run: [2, 3, 5, 10], walk: [2, 3, 5, 8], ride: [5, 10, 20, 40] };
const FOCUS_MINUTES = [10, 25, 30, 60];

// Санал болгох зорилгууд — хэмжиж болохыг нь утсаар баталгаажуулна.
type Idea = { mn: string; en: string; mode: Mode; km?: number; min?: number };
const IDEAS: Idea[] = [
  { mn: '🏃 5 км гүйх', en: '🏃 Run 5 km', mode: 'run', km: 5 },
  { mn: '🚶 3 км алхах', en: '🚶 Walk 3 km', mode: 'walk', km: 3 },
  { mn: '📚 30 мин ном унших', en: '📚 Read 30 min', mode: 'focus', min: 30 },
  { mn: '🧘 10 мин бясалгах', en: '🧘 Meditate 10 min', mode: 'focus', min: 10 },
  { mn: '💻 1 цаг код бичих', en: '💻 Code for 1 hour', mode: 'focus', min: 60 },
  { mn: '💧 2 л ус уух', en: '💧 Drink 2 L water', mode: 'manual' },
  { mn: '🇬🇧 20 шинэ үг цээжлэх', en: '🇬🇧 Learn 20 new words', mode: 'manual' },
];

// Шинэ өдөр тутмын зорилго (+ товчноос).
export default function NewGoal() {
  const { t: tr, i18n } = useTranslation();
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [mode, setMode] = useState<Mode>('manual');
  const [km, setKm] = useState(5);
  const [minutes, setMinutes] = useState(30);
  const [busy, setBusy] = useState(false);
  const en = i18n.language === 'en';

  const pickMode = (m: Mode) => {
    setMode(m);
    if (m === 'run' || m === 'walk' || m === 'ride') setKm(DISTANCES[m][1]);
    if (m === 'focus') setMinutes(25);
  };

  const pickIdea = (idea: Idea) => {
    setTitle(en ? idea.en : idea.mn);
    setMode(idea.mode);
    if (idea.km) setKm(idea.km);
    if (idea.min) setMinutes(idea.min);
  };

  const config = (): GoalConfig =>
    mode === 'manual'
      ? { verification: 'manual' }
      : mode === 'focus'
        ? { verification: 'focus', minMinutes: minutes }
        : { verification: 'gps', activity: mode, minDistanceM: Math.round(km * 1000) };

  const onSave = async () => {
    const v = title.trim();
    if (v.length < 1 || v.length > 120) {
      Alert.alert(tr('common.error'), tr('goals.titleInvalid'));
      return;
    }
    setBusy(true);
    try {
      await createGoal(v, config());
      router.back();
    } catch (e: any) {
      Alert.alert(tr('common.error'), String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const distances = mode === 'run' || mode === 'walk' || mode === 'ride' ? DISTANCES[mode] : null;

  return (
    <Screen underHeader>
      <Stack.Screen options={{ title: tr('create.goal') }} />
      <Body muted>{tr('goals.newHint')}</Body>
      <Field
        label={tr('goals.title')}
        value={title}
        onChangeText={setTitle}
        placeholder={tr('home.addPlaceholder')}
        maxLength={120}
        returnKeyType="done"
      />
      <Text style={styles.label}>{tr('goals.ideas')}</Text>
      <View style={styles.wrap}>
        {IDEAS.map((idea) => {
          const label = en ? idea.en : idea.mn;
          return (
            <Pressable key={idea.mn} onPress={() => pickIdea(idea)} accessibilityRole="button" style={[styles.idea, title === label && styles.on]}>
              <Text style={styles.ideaText}>{label}</Text>
              {idea.mode !== 'manual' && <Text style={styles.badge}>{idea.mode === 'focus' ? '⏱' : 'GPS'}</Text>}
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.label}>{tr('track.howVerified')}</Text>
      <View style={styles.modes}>
        {MODES.map((m) => {
          const on = mode === m.key;
          return (
            <Pressable
              key={m.key}
              onPress={() => pickMode(m.key)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              style={[styles.mode, on && styles.on]}
            >
              <Text style={{ fontSize: 20 }}>{m.icon}</Text>
              <Text style={[styles.modeText, on && { color: '#FFFFFF', fontFamily: font.bold }]}>{tr(`track.mode.${m.key}`)}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.hint}>{tr(`goals.modeHint.${mode}`)}</Text>

      {distances && (
        <View style={styles.chips}>
          {distances.map((d) => (
            <Pressable key={d} onPress={() => setKm(d)} accessibilityRole="radio" accessibilityState={{ selected: km === d }} style={[styles.chip, km === d && styles.on]}>
              <Text style={[styles.chipText, km === d && { color: '#FFFFFF' }]}>{d} км</Text>
            </Pressable>
          ))}
        </View>
      )}
      {mode === 'focus' && (
        <View style={styles.chips}>
          {FOCUS_MINUTES.map((m) => (
            <Pressable key={m} onPress={() => setMinutes(m)} accessibilityRole="radio" accessibilityState={{ selected: minutes === m }} style={[styles.chip, minutes === m && styles.on]}>
              <Text style={[styles.chipText, minutes === m && { color: '#FFFFFF' }]}>{tr('track.min', { n: m })}</Text>
            </Pressable>
          ))}
        </View>
      )}

      <View style={{ marginTop: 8 }}>
        <Button label={tr('goals.create')} icon="add" onPress={onSave} loading={busy} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: font.bold, fontSize: 14, color: t.textMuted, marginTop: 4 },
  hint: { fontFamily: font.medium, fontSize: 12, lineHeight: 17, color: t.textMuted },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  idea: {
    flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border,
    borderRadius: 999, paddingVertical: 8, paddingHorizontal: 13,
  },
  ideaText: { fontFamily: font.semibold, fontSize: 13, color: t.text },
  badge: { fontFamily: font.bold, fontSize: 10, color: '#C4B5FD' },
  on: { backgroundColor: 'rgba(139,92,246,0.30)', borderColor: 'rgba(196,181,253,0.7)' },
  modes: { flexDirection: 'row', gap: 8 },
  mode: {
    flex: 1, alignItems: 'center', gap: 4, paddingVertical: 10, borderRadius: 16,
    backgroundColor: t.surface, borderWidth: 1, borderColor: t.border,
  },
  modeText: { fontFamily: font.semibold, fontSize: 11, color: t.textMuted },
  chips: { flexDirection: 'row', gap: 8 },
  chip: { flex: 1, borderWidth: 1, borderColor: t.border, backgroundColor: t.surface, borderRadius: radius.pill, paddingVertical: 10, alignItems: 'center' },
  chipText: { fontFamily: font.semibold, fontSize: 13, color: t.textMuted },
});
