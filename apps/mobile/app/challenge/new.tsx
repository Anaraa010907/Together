import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { lightTheme as t, radius, space } from '@together/ui/tokens';
import { todayIso } from '../../lib/goals';
import { addDays, challengeErrorKey, createChallenge } from '../../lib/challenges';

const DURATIONS = [7, 14, 30];

// Group дотор challenge үүсгэх: нэр, тайлбар, хугацаа, эхлэх өдөр.
export default function NewChallenge() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const { t: tr } = useTranslation();
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [days, setDays] = useState(7);
  const [startTomorrow, setStartTomorrow] = useState(false);
  const [busy, setBusy] = useState(false);

  const onCreate = async () => {
    const name = title.trim();
    if (name.length < 2 || name.length > 80) return Alert.alert(tr('common.error'), tr('challenges.titleInvalid'));
    setBusy(true);
    try {
      const today = todayIso();
      const id = await createChallenge({
        groupId: String(groupId),
        title: name,
        description: description.trim() || undefined,
        startOn: startTomorrow ? addDays(today, 1) : today,
        days,
      });
      router.replace(`/challenge/${id}` as never);
    } catch (e: any) {
      const key = challengeErrorKey(e);
      Alert.alert(tr('common.error'), key ? tr(key) : String(e.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={{ backgroundColor: t.background }} contentContainerStyle={styles.screen}>
      <Text style={[styles.title, { color: t.text }]}>{tr('challenges.createTitle')}</Text>

      <Text style={[styles.label, { color: t.textMuted }]}>{tr('challenges.name')}</Text>
      <TextInput
        style={[styles.input, { borderColor: t.border, backgroundColor: t.surface, color: t.text }]}
        value={title}
        onChangeText={setTitle}
        maxLength={80}
        placeholder={tr('challenges.namePlaceholder')}
        placeholderTextColor={t.textMuted}
        accessibilityLabel={tr('challenges.name')}
      />

      <Text style={[styles.label, { color: t.textMuted }]}>{tr('challenges.description')}</Text>
      <TextInput
        style={[styles.input, styles.multiline, { borderColor: t.border, backgroundColor: t.surface, color: t.text }]}
        value={description}
        onChangeText={setDescription}
        multiline
        maxLength={500}
        accessibilityLabel={tr('challenges.description')}
      />

      <Text style={[styles.label, { color: t.textMuted }]}>{tr('challenges.duration')}</Text>
      <View style={styles.chips}>
        {DURATIONS.map((d) => (
          <Chip key={d} label={tr('challenges.days', { count: d })} active={days === d} onPress={() => setDays(d)} />
        ))}
      </View>

      <Text style={[styles.label, { color: t.textMuted }]}>{tr('challenges.start')}</Text>
      <View style={styles.chips}>
        <Chip label={tr('challenges.today')} active={!startTomorrow} onPress={() => setStartTomorrow(false)} />
        <Chip label={tr('challenges.tomorrow')} active={startTomorrow} onPress={() => setStartTomorrow(true)} />
      </View>

      <Text style={[styles.hint, { color: t.textMuted }]}>{tr('challenges.rewardHint')}</Text>

      <Pressable
        style={[styles.primary, { backgroundColor: t.accent, opacity: busy ? 0.6 : 1 }]}
        disabled={busy}
        onPress={onCreate}
        accessibilityRole="button"
      >
        {busy ? (
          <ActivityIndicator color={t.onAccent} />
        ) : (
          <Text style={[styles.primaryText, { color: t.onAccent }]}>{tr('challenges.createAction')}</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      style={[styles.chip, { borderColor: t.border, backgroundColor: active ? t.accent : t.surface }]}
    >
      <Text style={{ color: active ? t.onAccent : t.text, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { padding: space.lg, gap: space.sm, paddingBottom: space.xl },
  title: { fontSize: 24, fontWeight: '700', marginBottom: space.sm },
  label: { fontSize: 13, marginTop: space.sm },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: 12, fontSize: 16 },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  chips: { flexDirection: 'row', gap: space.sm },
  chip: { flex: 1, borderWidth: 1, borderRadius: radius.pill, paddingVertical: 10, alignItems: 'center' },
  hint: { fontSize: 12, marginTop: space.sm },
  primary: { borderRadius: radius.pill, paddingVertical: 16, alignItems: 'center', marginTop: space.lg },
  primaryText: { fontSize: 16, fontWeight: '600' },
});
