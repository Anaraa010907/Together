import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { lightTheme as t, radius, space } from '@together/ui/tokens';
import { fetchMyGroups, fetchPublicGroups, type GroupSummary } from '../../lib/groups';

// Миний group-ууд + нийтийн group-ууд (Discover).
export default function Groups() {
  const { t: tr } = useTranslation();
  const router = useRouter();
  const [mine, setMine] = useState<GroupSummary[]>([]);
  const [discover, setDiscover] = useState<GroupSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [m, d] = await Promise.all([fetchMyGroups(), fetchPublicGroups()]);
      setMine(m);
      const mineIds = new Set(m.map((g) => g.id));
      setDiscover(d.filter((g) => !mineIds.has(g.id)));
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

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: t.background }]}>
        <ActivityIndicator color={t.accent} />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: t.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: t.text }]}>{tr('groups.title')}</Text>
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <Pressable
            style={[styles.createBtn, { borderWidth: 1, borderColor: t.border }]}
            onPress={() => router.push('/join' as never)}
            accessibilityRole="button"
          >
            <Text style={[styles.createText, { color: t.text }]}>{tr('groups.joinByCode')}</Text>
          </Pressable>
          <Pressable
            style={[styles.createBtn, { backgroundColor: t.accent }]}
            onPress={() => router.push('/group/new' as never)}
            accessibilityRole="button"
          >
            <Text style={[styles.createText, { color: t.onAccent }]}>{tr('groups.create')}</Text>
          </Pressable>
        </View>
      </View>

      <Pressable
        onPress={() => router.push('/teachers' as never)}
        accessibilityRole="button"
        style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}
      >
        <Text style={[styles.cardTitle, { color: t.text }]}>👩‍🏫 {tr('teachers.title')}</Text>
        <Text style={{ color: t.textMuted, fontSize: 13 }}>{tr('teachers.subtitle')}</Text>
      </Pressable>

      <Text style={[styles.section, { color: t.text }]}>{tr('groups.mine')}</Text>
      <GroupList
        data={mine}
        empty={tr('groups.noMine')}
        onOpen={(g) => router.push(`/group/${g.id}` as never)}
      />

      <Text style={[styles.section, { color: t.text }]}>{tr('groups.discover')}</Text>
      <GroupList
        data={discover}
        empty={tr('groups.noDiscover')}
        onOpen={(g) => router.push(`/group/${g.id}` as never)}
      />
    </View>
  );
}

function GroupList({
  data,
  empty,
  onOpen,
}: {
  data: GroupSummary[];
  empty: string;
  onOpen: (g: GroupSummary) => void;
}) {
  const { t: tr } = useTranslation();
  return (
    <FlatList
      data={data}
      keyExtractor={(g) => g.id}
      style={{ flexGrow: 0 }}
      contentContainerStyle={{ gap: space.sm, paddingBottom: space.md }}
      ListEmptyComponent={<Text style={{ color: t.textMuted }}>{empty}</Text>}
      renderItem={({ item }) => (
        <Pressable
          onPress={() => onOpen(item)}
          accessibilityRole="button"
          style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}
        >
          <Text style={[styles.cardTitle, { color: t.text }]}>
            {item.kind === 'course' ? '📚 ' : ''}
            {item.name}
          </Text>
          <Text style={{ color: t.textMuted, fontSize: 13 }}>
            {item.visibility === 'private' ? tr('groups.private') : tr('groups.public')}
            {item.description ? ` · ${item.description}` : ''}
          </Text>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: space.lg, gap: space.md, paddingTop: 64 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: '700' },
  createBtn: { borderRadius: radius.pill, paddingVertical: 10, paddingHorizontal: space.md },
  createText: { fontWeight: '600' },
  section: { fontSize: 16, fontWeight: '600', marginTop: space.sm },
  card: { borderWidth: 1, borderRadius: radius.md, padding: space.md, gap: 4 },
  cardTitle: { fontSize: 16, fontWeight: '600' },
});
