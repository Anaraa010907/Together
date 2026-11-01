import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { font, lightTheme as t, radius, space } from '@together/ui/tokens';
import { fetchBlockedIds } from '../lib/account';
import { fetchTeachers, type TeacherProfile } from '../lib/teaching';

// Багш нар: сэдэв, нэрээр хайна. Баталгаажсан багш эхэнд.
export default function Teachers() {
  const { t: tr } = useTranslation();
  const router = useRouter();
  const [teachers, setTeachers] = useState<TeacherProfile[]>([]);
  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [list, b] = await Promise.all([fetchTeachers(), fetchBlockedIds().catch(() => new Set<string>())]);
      setTeachers(list);
      setBlocked(b);
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

  const q = query.trim().toLowerCase();
  const visible = teachers.filter(
    (x) =>
      !blocked.has(x.user_id) &&
      (!q ||
        (x.display_name ?? '').toLowerCase().includes(q) ||
        (x.headline ?? '').toLowerCase().includes(q) ||
        x.subjects.some((s) => s.toLowerCase().includes(q))),
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <FlatList
        data={visible}
        keyExtractor={(x) => x.user_id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <TextInput
            style={[styles.search, { borderColor: t.border, backgroundColor: t.surface, color: t.text }]}
            value={query}
            onChangeText={setQuery}
            placeholder={tr('teachers.search')}
            placeholderTextColor={t.textMuted}
            accessibilityLabel={tr('teachers.search')}
          />
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={t.accent} />
          ) : (
            <Text style={{ color: t.textMuted, textAlign: 'center' }}>{tr('teachers.empty')}</Text>
          )
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/teacher/${item.user_id}` as never)}
            accessibilityRole="button"
            style={[styles.card, { borderColor: t.border, backgroundColor: t.surface }]}
          >
            <Text style={{ color: t.text, fontSize: 16, fontFamily: font.bold }}>
              {item.display_name} {item.verified_at ? '✓' : ''}
            </Text>
            {!!item.headline && <Text style={{ color: t.text }}>{item.headline}</Text>}
            <View style={styles.tags}>
              {item.subjects.map((s) => (
                <Text key={s} style={[styles.tag, { backgroundColor: t.surfaceMuted, color: t.text }]}>
                  {s}
                </Text>
              ))}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  list: { padding: space.lg, gap: space.sm },
  search: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: 10, fontSize: 15, marginBottom: space.sm },
  card: { borderWidth: 1, borderRadius: radius.lg, padding: space.md, gap: 4 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginTop: 4 },
  tag: { borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 2, fontSize: 12, overflow: 'hidden' },
});
