import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { useTranslation } from 'react-i18next';
import { font, lightTheme as t, palette, radius, space } from '@together/ui/tokens';
import { Backdrop } from '../../components/Backdrop';
import { Button } from '../../components/ui';
import { todayIso } from '../../lib/goals';
import { addDays, challengeErrorKey, createChallenge } from '../../lib/challenges';
import { activityErrorKey, setChallengeVerification, type VerificationConfig } from '../../lib/activities';

const DURATIONS = [7, 14, 30];
const DISTANCES = { run: [1, 3, 5, 10], walk: [2, 5, 8, 10], ride: [5, 10, 20, 40] } as const;
const PLACE_MINUTES = [30, 45, 60, 90];
const FOCUS_MINUTES = [25, 45, 60, 90];
const RADII = [50, 100, 200];

type Mode = 'manual' | 'run' | 'walk' | 'ride' | 'place' | 'focus';
const MODES: { key: Mode; icon: string }[] = [
  { key: 'manual', icon: '✅' },
  { key: 'run', icon: '🏃' },
  { key: 'walk', icon: '🚶' },
  { key: 'ride', icon: '🚴' },
  { key: 'place', icon: '📍' },
  { key: 'focus', icon: '⏱️' },
];

// Group дотор challenge үүсгэх: нэр, тайлбар, хугацаа, эхлэх өдөр, баталгаажуулалт.
export default function NewChallenge() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const { t: tr } = useTranslation();
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [days, setDays] = useState(30);
  const [startTomorrow, setStartTomorrow] = useState(false);
  const [mode, setMode] = useState<Mode>('manual');
  const [km, setKm] = useState<number>(3);
  const [minutes, setMinutes] = useState(45);
  const [placeName, setPlaceName] = useState('');
  const [place, setPlace] = useState<{ lat: number; lng: number } | null>(null);
  const [radiusM, setRadiusM] = useState(100);
  const [locating, setLocating] = useState(false);
  const [busy, setBusy] = useState(false);

  const pickMode = (m: Mode) => {
    setMode(m);
    if (m === 'run' || m === 'walk' || m === 'ride') setKm(DISTANCES[m][1]);
    if (m === 'place') setMinutes(45);
    if (m === 'focus') setMinutes(25);
  };

  const useCurrentPlace = async () => {
    setLocating(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        Alert.alert(tr('track.permTitle'), tr('track.permBody'));
        return;
      }
      const l = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setPlace({ lat: l.coords.latitude, lng: l.coords.longitude });
    } catch (e: any) {
      Alert.alert(tr('common.error'), String(e?.message ?? e));
    } finally {
      setLocating(false);
    }
  };

  const config = (): VerificationConfig | null => {
    if (mode === 'manual') return { verification: 'manual' };
    if (mode === 'run' || mode === 'walk' || mode === 'ride') return { verification: 'gps', activity: mode, minDistanceM: Math.round(km * 1000) };
    if (mode === 'focus') return { verification: 'focus', minMinutes: minutes };
    if (!place) return null;
    return { verification: 'place', placeName: placeName.trim() || tr('track.placeDefault'), lat: place.lat, lng: place.lng, radiusM, minMinutes: minutes };
  };

  const onCreate = async () => {
    const name = title.trim();
    if (name.length < 2 || name.length > 80) return Alert.alert(tr('challenges.titleInvalidTitle'), tr('challenges.titleInvalid'));
    const cfg = config();
    if (!cfg) return Alert.alert(tr('track.placeMissingTitle'), tr('track.placeMissing'));
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
      if (cfg.verification !== 'manual') await setChallengeVerification(id, cfg);
      router.replace(`/challenge/${id}` as never);
    } catch (e: any) {
      const key = challengeErrorKey(e) ?? activityErrorKey(e);
      Alert.alert(tr('common.error'), key ? tr(key) : String(e.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <Stack.Screen options={{ title: tr('challenges.createTitle') }} />
      <Backdrop />
      <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>{tr('challenges.name')}</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          maxLength={80}
          placeholder={tr('challenges.namePlaceholder')}
          placeholderTextColor={t.textFaint}
          accessibilityLabel={tr('challenges.name')}
        />

        <Text style={styles.label}>{tr('challenges.description')}</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          value={description}
          onChangeText={setDescription}
          multiline
          maxLength={500}
          placeholderTextColor={t.textFaint}
          accessibilityLabel={tr('challenges.description')}
        />

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
                style={[styles.mode, on && styles.modeOn]}
              >
                <Text style={{ fontSize: 22 }}>{m.icon}</Text>
                <Text style={[styles.modeText, on && { color: '#FFFFFF', fontFamily: font.bold }]}>{tr(`track.mode.${m.key}`)}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.hint}>{tr(`track.modeHint.${mode}`)}</Text>

        {(mode === 'run' || mode === 'walk' || mode === 'ride') && (
          <>
            <Text style={styles.label}>{tr('track.minDistance')}</Text>
            <View style={styles.chips}>
              {DISTANCES[mode].map((d) => (
                <Chip key={d} label={`${d} км`} active={km === d} onPress={() => setKm(d)} />
              ))}
            </View>
          </>
        )}

        {mode === 'place' && (
          <>
            <Text style={styles.label}>{tr('track.placeName')}</Text>
            <TextInput
              style={styles.input}
              value={placeName}
              onChangeText={setPlaceName}
              maxLength={80}
              placeholder={tr('track.placeNamePlaceholder')}
              placeholderTextColor={t.textFaint}
              accessibilityLabel={tr('track.placeName')}
            />
            <Pressable onPress={useCurrentPlace} disabled={locating} accessibilityRole="button" style={[styles.placeBtn, place && styles.placeBtnOn]}>
              {locating ? (
                <ActivityIndicator color={t.text} />
              ) : (
                <Ionicons name={place ? 'checkmark-circle' : 'locate'} size={20} color={place ? palette.mint : palette.lilac} />
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.placeTitle}>{place ? tr('track.placeSet') : tr('track.useHere')}</Text>
                <Text style={styles.hint}>{place ? `${place.lat.toFixed(5)}, ${place.lng.toFixed(5)}` : tr('track.useHereHint')}</Text>
              </View>
            </Pressable>
            <Text style={styles.label}>{tr('track.radius')}</Text>
            <View style={styles.chips}>
              {RADII.map((r) => (
                <Chip key={r} label={`${r} м`} active={radiusM === r} onPress={() => setRadiusM(r)} />
              ))}
            </View>
            <Text style={styles.label}>{tr('track.stayMinutes')}</Text>
            <View style={styles.chips}>
              {PLACE_MINUTES.map((m) => (
                <Chip key={m} label={tr('track.min', { n: m })} active={minutes === m} onPress={() => setMinutes(m)} />
              ))}
            </View>
          </>
        )}

        {mode === 'focus' && (
          <>
            <Text style={styles.label}>{tr('track.focusMinutes')}</Text>
            <View style={styles.chips}>
              {FOCUS_MINUTES.map((m) => (
                <Chip key={m} label={tr('track.min', { n: m })} active={minutes === m} onPress={() => setMinutes(m)} />
              ))}
            </View>
          </>
        )}

        <Text style={styles.label}>{tr('challenges.duration')}</Text>
        <View style={styles.chips}>
          {DURATIONS.map((d) => (
            <Chip key={d} label={tr('challenges.days', { count: d })} active={days === d} onPress={() => setDays(d)} />
          ))}
        </View>

        <Text style={styles.label}>{tr('challenges.start')}</Text>
        <View style={styles.chips}>
          <Chip label={tr('challenges.today')} active={!startTomorrow} onPress={() => setStartTomorrow(false)} />
          <Chip label={tr('challenges.tomorrow')} active={startTomorrow} onPress={() => setStartTomorrow(true)} />
        </View>

        <LinearGradient colors={['rgba(251,191,36,0.14)', 'rgba(255,138,61,0.08)']} style={styles.reward}>
          <Text style={{ fontSize: 18 }}>🏆</Text>
          <Text style={styles.rewardText}>{tr('challenges.rewardHint')}</Text>
        </LinearGradient>

        <View style={{ marginTop: space.md }}>
          <Button label={tr('challenges.createAction')} onPress={onCreate} loading={busy} />
        </View>
      </ScrollView>
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      style={[styles.chip, active ? styles.chipOn : null]}
    >
      <Text style={{ color: active ? '#FFFFFF' : t.textMuted, fontFamily: active ? font.bold : font.semibold, fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { padding: space.lg, gap: space.sm, paddingBottom: 48 },
  label: { fontSize: 14, fontFamily: font.bold, color: t.text, marginTop: space.md },
  hint: { fontSize: 12, fontFamily: font.medium, color: t.textMuted, lineHeight: 17 },
  input: {
    borderWidth: 1, borderColor: t.border, backgroundColor: t.surface, color: t.text, borderRadius: 18,
    paddingHorizontal: space.md, paddingVertical: 14, fontSize: 16, fontFamily: font.medium,
  },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  modes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  mode: {
    width: '31.5%', alignItems: 'center', gap: 4, paddingVertical: 12, borderRadius: 18,
    backgroundColor: t.surface, borderWidth: 1, borderColor: t.border,
  },
  modeOn: { backgroundColor: 'rgba(139,92,246,0.30)', borderColor: 'rgba(196,181,253,0.7)' },
  modeText: { fontFamily: font.semibold, fontSize: 12, color: t.textMuted },
  chips: { flexDirection: 'row', gap: space.sm },
  chip: { flex: 1, borderWidth: 1, borderColor: t.border, backgroundColor: t.surface, borderRadius: radius.pill, paddingVertical: 10, alignItems: 'center' },
  chipOn: { backgroundColor: 'rgba(139,92,246,0.35)', borderColor: 'rgba(196,181,253,0.6)' },
  placeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 18, borderWidth: 1,
    borderStyle: 'dashed', borderColor: 'rgba(196,181,253,0.45)', marginTop: 8,
  },
  placeBtnOn: { borderStyle: 'solid', borderColor: 'rgba(52,211,153,0.5)', backgroundColor: 'rgba(52,211,153,0.08)' },
  placeTitle: { fontFamily: font.bold, fontSize: 15, color: t.text },
  reward: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 18, marginTop: space.md },
  rewardText: { flex: 1, fontFamily: font.medium, fontSize: 13, color: t.text, lineHeight: 18 },
});
