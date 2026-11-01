import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { font, lightTheme as t, radius, shadow } from '@together/ui/tokens';
import { Chip } from '../../components/ui';
import { fetchMyGroups, fetchPublicGroups, type GroupSummary } from '../../lib/groups';
import { categoryName, fetchCategories, fetchSuggestedGroups, type Category } from '../../lib/interests';

// Группууд: хайлт, ангиллын шүүлт, миний группууд, санал болгох, нээлттэй группууд.
export default function Groups() {
  const { t: tr } = useTranslation();
  const router = useRouter();
  const [mine, setMine] = useState<GroupSummary[]>([]);
  const [discover, setDiscover] = useState<GroupSummary[]>([]);
  const [suggestedIds, setSuggestedIds] = useState<Set<string>>(new Set());
  const [cats, setCats] = useState<Category[]>([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [m, d, c, s] = await Promise.all([
        fetchMyGroups(),
        fetchPublicGroups(),
        fetchCategories().catch(() => [] as Category[]),
        fetchSuggestedGroups(6).catch(() => []),
      ]);
      setMine(m);
      const mineIds = new Set(m.map((g) => g.id));
      setDiscover(d.filter((g) => !mineIds.has(g.id)));
      setCats(c);
      setSuggestedIds(new Set(s.map((x) => x.id)));
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

  const catById = useMemo(() => Object.fromEntries(cats.map((c) => [c.id, c])), [cats]);
  const q = query.trim().toLowerCase();
  const matches = (g: GroupSummary) =>
    (!category || g.category_id === category) &&
    (!q || g.name.toLowerCase().includes(q) || (g.description ?? '').toLowerCase().includes(q));

  const mineFiltered = mine.filter(matches);
  const discoverFiltered = discover.filter(matches);
  const suggested = discoverFiltered.filter((g) => suggestedIds.has(g.id));
  const others = discoverFiltered.filter((g) => !suggestedIds.has(g.id));

  const open = (g: GroupSummary) => router.push(`/group/${g.id}` as never);

  return (
    <ScrollView style={{ backgroundColor: t.background }} contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <Text style={styles.title}>{tr('groups.title')}</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <IconButton icon="key-outline" label={tr('groups.joinByCode')} onPress={() => router.push('/join' as never)} />
          <IconButton icon="add" label={tr('groups.create')} primary onPress={() => router.push('/group/new' as never)} />
        </View>
      </View>

      <View style={styles.search}>
        <Ionicons name="search" size={18} color="#9AA2AD" />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={tr('groups.search')}
          placeholderTextColor="#9AA2AD"
          style={styles.searchInput}
          accessibilityLabel={tr('groups.search')}
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        <Chip label={tr('groups.all')} selected={category === null} onPress={() => setCategory(null)} />
        {cats.map((c) => (
          <Chip
            key={c.id}
            icon={c.icon}
            label={categoryName(c)}
            selected={category === c.id}
            onPress={() => setCategory(category === c.id ? null : c.id)}
          />
        ))}
      </ScrollView>

      <Pressable onPress={() => router.push('/teachers' as never)} accessibilityRole="button" style={[styles.teachers, shadow.card]}>
        <Text style={{ fontSize: 26 }}>👩‍🏫</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.teachersTitle}>{tr('teachers.title')}</Text>
          <Text style={styles.teachersSub}>{tr('teachers.subtitle')}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color="rgba(244,240,231,0.8)" />
      </Pressable>

      {loading ? (
        <ActivityIndicator color={t.accent} style={{ marginTop: 24 }} />
      ) : (
        <>
          <Section title={tr('groups.mine')} empty={tr('groups.noMine')} groups={mineFiltered} cats={catById} onOpen={open} />
          {suggested.length > 0 && (
            <Section title={tr('groups.suggested')} groups={suggested} cats={catById} onOpen={open} />
          )}
          <Section title={tr('groups.discover')} empty={tr('groups.noDiscover')} groups={others} cats={catById} onOpen={open} />
        </>
      )}
    </ScrollView>
  );
}

function IconButton({
  icon,
  label,
  onPress,
  primary,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  primary?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.iconBtn, primary ? { backgroundColor: t.accent, borderColor: t.accent } : null]}
    >
      <Ionicons name={icon} size={16} color={t.text} />
      <Text style={styles.iconBtnText}>{label}</Text>
    </Pressable>
  );
}

function Section({
  title,
  empty,
  groups,
  cats,
  onOpen,
}: {
  title: string;
  empty?: string;
  groups: GroupSummary[];
  cats: Record<string, Category>;
  onOpen: (g: GroupSummary) => void;
}) {
  const { t: tr } = useTranslation();
  return (
    <View style={{ gap: 10 }}>
      <Text style={styles.section}>{title}</Text>
      {groups.length === 0 && !!empty && <Text style={styles.meta}>{empty}</Text>}
      {groups.map((g) => {
        const cat = g.category_id ? cats[g.category_id] : undefined;
        return (
          <Pressable key={g.id} onPress={() => onOpen(g)} accessibilityRole="button" style={[styles.card, shadow.card]}>
            <View style={styles.cardIcon}>
              <Text style={{ fontSize: 22 }}>{g.kind === 'course' ? '📚' : cat?.icon ?? '👥'}</Text>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {g.name}
              </Text>
              <Text style={styles.meta} numberOfLines={1}>
                {[
                  g.kind === 'course' ? tr('courses.badge') : null,
                  g.visibility === 'private' ? tr('groups.private') : tr('groups.public'),
                  cat ? categoryName(cat) : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
              {!!g.description && (
                <Text style={styles.meta} numberOfLines={1}>
                  {g.description}
                </Text>
              )}
            </View>
            <Ionicons name="chevron-forward" size={18} color="#9AA2AD" />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 20, paddingTop: 60, gap: 16, paddingBottom: 32 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontFamily: font.extrabold, fontSize: 28, color: t.text },
  iconBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: '#E3DDCF',
    backgroundColor: t.surface, borderRadius: radius.pill, paddingVertical: 8, paddingHorizontal: 12,
  },
  iconBtnText: { fontFamily: font.bold, fontSize: 13, color: t.text },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: 8, height: 48, borderRadius: radius.pill,
    backgroundColor: t.surface, borderWidth: 1, borderColor: '#E3DDCF', paddingHorizontal: 16,
  },
  searchInput: { flex: 1, fontFamily: font.medium, fontSize: 15, color: t.text },
  teachers: { backgroundColor: t.text, borderRadius: radius.lg, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  teachersTitle: { fontFamily: font.bold, fontSize: 16, color: t.background },
  teachersSub: { fontFamily: font.medium, fontSize: 13, color: 'rgba(244,240,231,0.75)' },
  section: { fontFamily: font.bold, fontSize: 18, color: t.text, marginTop: 4 },
  card: {
    backgroundColor: t.surface, borderRadius: 16, borderWidth: 1, borderColor: '#EFEAE0',
    padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  cardIcon: { width: 46, height: 46, borderRadius: 14, backgroundColor: '#F4ECDC', alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontFamily: font.bold, fontSize: 16, color: t.text },
  meta: { fontFamily: font.medium, fontSize: 13, color: '#5B6573' },
});
