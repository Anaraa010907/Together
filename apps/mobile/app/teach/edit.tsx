import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { font, lightTheme as t, radius, space } from '@together/ui/tokens';
import { fetchMyTeacherProfile, parseSubjects, saveTeacherProfile, type TeacherProfile } from '../../lib/teaching';
import { useSession } from '../../lib/session';

// Багшийн профайл засах: заах сонирхолтой эсэх, сэдвүүд, товч тайлбар, танилцуулга.
export default function TeachEdit() {
  const { t: tr } = useTranslation();
  const router = useRouter();
  const { session } = useSession();
  const [profile, setProfile] = useState<TeacherProfile | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [headline, setHeadline] = useState('');
  const [subjects, setSubjects] = useState('');
  const [intro, setIntro] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const p = await fetchMyTeacherProfile();
      setProfile(p);
      if (p) {
        setEnabled(p.enabled);
        setHeadline(p.headline ?? '');
        setSubjects(p.subjects.join(', '));
        setIntro(p.intro ?? '');
      }
    } catch (e: any) {
      Alert.alert(tr('common.error'), String(e.message ?? e));
    } finally {
      setLoading(false);
    }
  }, [tr]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onSave = async () => {
    const list = parseSubjects(subjects);
    if (enabled && list.length === 0) return Alert.alert(tr('common.error'), tr('teach.subjectsRequired'));
    setBusy(true);
    try {
      await saveTeacherProfile({ enabled, headline, subjects: list, intro });
      Alert.alert(tr('settings.saved'));
      await load();
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

  return (
    <ScrollView style={{ backgroundColor: t.background }} contentContainerStyle={styles.screen}>
      <Text style={[styles.title, { color: t.text }]}>{tr('teach.title')}</Text>
      <Text style={{ color: t.textMuted, lineHeight: 20 }}>{tr('teach.intro')}</Text>

      <View style={styles.row}>
        <Text style={{ color: t.text, fontSize: 16, flex: 1 }}>{tr('teach.enabled')}</Text>
        <Switch value={enabled} onValueChange={setEnabled} />
      </View>

      {profile?.verified_at ? (
        <Text style={{ color: t.text, fontFamily: font.semibold }}>✓ {tr('teach.verified')}</Text>
      ) : (
        <Text style={{ color: t.textMuted, fontSize: 12 }}>{tr('teach.notVerified')}</Text>
      )}

      <Text style={[styles.label, { color: t.textMuted }]}>{tr('teach.headline')}</Text>
      <TextInput
        style={[styles.input, { borderColor: t.border, backgroundColor: t.surface, color: t.text }]}
        value={headline}
        onChangeText={setHeadline}
        maxLength={120}
        placeholder={tr('teach.headlinePlaceholder')}
        placeholderTextColor={t.textMuted}
        accessibilityLabel={tr('teach.headline')}
      />

      <Text style={[styles.label, { color: t.textMuted }]}>{tr('teach.subjects')}</Text>
      <TextInput
        style={[styles.input, { borderColor: t.border, backgroundColor: t.surface, color: t.text }]}
        value={subjects}
        onChangeText={setSubjects}
        placeholder={tr('teach.subjectsPlaceholder')}
        placeholderTextColor={t.textMuted}
        accessibilityLabel={tr('teach.subjects')}
      />

      <Text style={[styles.label, { color: t.textMuted }]}>{tr('teach.about')}</Text>
      <TextInput
        style={[styles.input, styles.multiline, { borderColor: t.border, backgroundColor: t.surface, color: t.text }]}
        value={intro}
        onChangeText={setIntro}
        multiline
        maxLength={1000}
        accessibilityLabel={tr('teach.about')}
      />

      <Pressable
        style={[styles.primary, { backgroundColor: t.accent, opacity: busy ? 0.6 : 1 }]}
        disabled={busy}
        onPress={onSave}
        accessibilityRole="button"
      >
        <Text style={[styles.primaryText, { color: t.onAccent }]}>{tr('settings.save')}</Text>
      </Pressable>

      {profile?.enabled && (
        <>
          <Pressable
            style={[styles.secondary, { borderColor: t.border }]}
            onPress={() => router.push('/group/new?course=1' as never)}
            accessibilityRole="button"
          >
            <Text style={{ color: t.text, fontFamily: font.semibold }}>📚 {tr('teach.newCourse')}</Text>
          </Pressable>
          {!!session && (
            <Pressable
              style={styles.textBtn}
              onPress={() => router.push(`/teacher/${session.user.id}` as never)}
              accessibilityRole="button"
            >
              <Text style={{ color: t.textMuted }}>{tr('teach.viewPublic')}</Text>
            </Pressable>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  screen: { padding: space.lg, gap: space.sm, paddingBottom: space.xl },
  title: { fontSize: 24, fontFamily: font.bold },
  row: { flexDirection: 'row', alignItems: 'center', marginTop: space.md },
  label: { fontSize: 13, marginTop: space.sm },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: 12, fontSize: 16 },
  multiline: { minHeight: 110, textAlignVertical: 'top' },
  primary: { borderRadius: radius.pill, paddingVertical: 16, alignItems: 'center', marginTop: space.lg },
  primaryText: { fontSize: 16, fontFamily: font.semibold },
  secondary: { borderWidth: 1, borderRadius: radius.pill, paddingVertical: 14, alignItems: 'center', marginTop: space.sm },
  textBtn: { alignItems: 'center', paddingVertical: space.md },
});
