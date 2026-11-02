import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { font, lightTheme as t, palette, radius, shadow } from '@together/ui/tokens';
import { Chip } from '../../components/ui';
import { fetchMyGroups, fetchPublicGroups, type GroupSummary } from '../../lib/groups';
import { categoryColor, categoryName, fetchCategories, fetchSuggestedGroups, type Category } from '../../lib/interests';
import { FadeIn, PressableScale } from '../../components/motion';
import { TAB_BAR_SPACE } from '../../components/TabBar';

// Группууд: хайлт, ангиллын шүүлт, санал болгох (carousel), миний ба нээлттэй группууд.
// Нүүрнээс ?category=<id> параметрээр ирвэл тэр ангиллаар шүүгдэнэ.
export default function Groups() {
  const { t: tr } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ category?: string }>();
  const { width } = useWindowDimensions();
  const [mine, setMine] = useState<GroupSummary[]>([]);
  const [discover, setDiscover] = useState<GroupSummary[]>([]);
  const [suggestedIds, setSuggestedIds] = useState<Set<string>>(new Set());
  const [cats, setCats] = useState<Category[]>([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (params.category) setCategory(params.category);
  }, [params.category]);

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
  const bigCard = Math.min(260, width * 0.66);

  return (
    <ScrollView style={{ backgroundColor: t.background }} contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
      <FadeIn index={0}>
        <View style={styles.header}>
          <Text style={styles.title}>{tr('groups.title')}</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <IconButton icon="key-outline" label={tr('groups.joinByCode')} onPress={() => router.push('/join' as never)} />
            <IconButton icon="add" label={tr('groups.create')} primary onPress={() => router.push('/group/new' as never)} />
          </View>
        </View>
      </FadeIn>

      <FadeIn index={1}>
        <View style={[styles.search, shadow.card]}>
          <Ionicons name="search" size={18} color="#9AA2AD" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={tr('groups.search')}
            placeholderTextColor="#9AA2AD"
            style={styles.searchInput}
            accessibilityLabel={tr('groups.search')}
          />
          {!!query && (
            <Pressable onPress={() => setQuery('')} hitSlop={10} accessibilityLabel={tr('common.cancel')}>
              <Ionicons name="close-circle" size={18} color="#9AA2AD" />
            </Pressable>
          )}
        </View>
      </FadeIn>

      <FadeIn index={2}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 20 }} style={{ marginRight: -20 }}>
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
      </FadeIn>

      <FadeIn index={3}>
        <PressableScale onPress={() => router.push('/teachers' as never)} accessibilityRole="button" scaleTo={0.98}>
          <LinearGradient colors={['#111923', '#2A3B52']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.teachers}>
            <View style={styles.teachersOrb} />
            <View style={styles.teachersIcon}>
              <Text style={{ fontSize: 24 }}>👩‍🏫</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.teachersTitle}>{tr('teachers.title')}</Text>
              <Text style={styles.teachersSub}>{tr('teachers.subtitle')}</Text>
            </View>
            <Ionicons name="arrow-forward-circle" size={28} color={t.accent} />
          </LinearGradient>
        </PressableScale>
      </FadeIn>

      {loading ? (
        <ActivityIndicator color={t.accent} style={{ marginTop: 24 }} />
      ) : (
        <>
          {suggested.length > 0 && (
            <FadeIn index={4} style={{ gap: 12 }}>
              <Text style={styles.section}>{tr('groups.suggested')}</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                snapToInterval={bigCard + 12}
                decelerationRate="fast"
                contentContainerStyle={{ gap: 12, paddingRight: 20 }}
                style={{ marginRight: -20 }}
              >
                {suggested.map((g) => (
                  <BigCard key={g.id} group={g} cat={g.category_id ? catById[g.category_id] : undefined} width={bigCard} onOpen={open} />
                ))}
              </ScrollView>
            </FadeIn>
          )}
          <Section index={5} title={tr('groups.mine')} empty={tr('groups.noMine')} groups={mineFiltered} cats={catById} onOpen={open} />
          <Section index={6} title={tr('groups.discover')} empty={tr('groups.noDiscover')} groups={others} cats={catById} onOpen={open} />
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
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.iconBtn, primary ? { backgroundColor: t.accent, borderColor: t.accent } : null]}
    >
      <Ionicons name={icon} size={16} color={t.text} />
      <Text style={styles.iconBtnText}>{label}</Text>
    </PressableScale>
  );
}

// Санал болгох том карт: градиент cover + том emoji, доор нь нэр/мета.
function BigCard({
  group: g,
  cat,
  width,
  onOpen,
}: {
  group: GroupSummary;
  cat?: Category;
  width: number;
  onOpen: (g: GroupSummary) => void;
}) {
  const { t: tr } = useTranslation();
  return (
    <PressableScale onPress={() => onOpen(g)} accessibilityRole="button" style={[styles.big, shadow.card, { width }]}>
      <LinearGradient colors={categoryColor(g.category_id)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.bigCover}>
        <Text style={{ fontSize: 46 }}>{g.kind === 'course' ? '📚' : cat?.icon ?? '👥'}</Text>
        {g.kind === 'course' && (
          <View style={styles.bigBadge}>
            <Text style={styles.bigBadgeText}>{tr('courses.badge')}</Text>
          </View>
        )}
      </LinearGradient>
      <View style={{ padding: 14, gap: 3 }}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {g.name}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {[cat ? categoryName(cat) : null, g.visibility === 'private' ? tr('groups.private') : tr('groups.public')]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </View>
    </PressableScale>
  );
}

function Section({
  title,
  empty,
  groups,
  cats,
  onOpen,
  index,
}: {
  title: string;
  empty?: string;
  groups: GroupSummary[];
  cats: Record<string, Category>;
  onOpen: (g: GroupSummary) => void;
  index: number;
}) {
  const { t: tr } = useTranslation();
  return (
    <View style={{ gap: 10 }}>
      <FadeIn index={index}>
        <Text style={styles.section}>{title}</Text>
      </FadeIn>
      {groups.length === 0 && !!empty && (
        <FadeIn index={index + 1}>
          <View style={styles.empty}>
            <Text style={styles.meta}>{empty}</Text>
          </View>
        </FadeIn>
      )}
      {groups.map((g, i) => {
        const cat = g.category_id ? cats[g.category_id] : undefined;
        return (
          <FadeIn key={g.id} index={index + 1 + i}>
            <PressableScale onPress={() => onOpen(g)} accessibilityRole="button" style={[styles.card, shadow.card]}>
              <LinearGradient colors={categoryColor(g.category_id)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.cardIcon}>
                <Text style={{ fontSize: 24 }}>{g.kind === 'course' ? '📚' : cat?.icon ?? '👥'}</Text>
              </LinearGradient>
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
              <View style={styles.chev}>
                <Ionicons name="chevron-forward" size={16} color={t.text} />
              </View>
            </PressableScale>
          </FadeIn>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 20, paddingTop: 60, gap: 16, paddingBottom: TAB_BAR_SPACE },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontFamily: font.extrabold, fontSize: 28, color: t.text, letterSpacing: -0.3 },
  iconBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: '#E3DDCF',
    backgroundColor: t.surface, borderRadius: radius.pill, paddingVertical: 8, paddingHorizontal: 12,
  },
  iconBtnText: { fontFamily: font.bold, fontSize: 13, color: t.text },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: 10, height: 52, borderRadius: radius.pill,
    backgroundColor: t.surface, borderWidth: 1, borderColor: '#EFEAE0', paddingHorizontal: 18,
  },
  searchInput: { flex: 1, fontFamily: font.medium, fontSize: 15, color: t.text },
  teachers: { borderRadius: 22, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, overflow: 'hidden' },
  teachersOrb: { position: 'absolute', right: -30, top: -40, width: 120, height: 120, borderRadius: 60, backgroundColor: palette.champagneGold, opacity: 0.16 },
  teachersIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: 'rgba(244,240,231,0.12)', alignItems: 'center', justifyContent: 'center' },
  teachersTitle: { fontFamily: font.bold, fontSize: 16, color: t.background },
  teachersSub: { fontFamily: font.medium, fontSize: 13, color: 'rgba(244,240,231,0.75)' },
  section: { fontFamily: font.extrabold, fontSize: 19, color: t.text, marginTop: 4 },
  big: { backgroundColor: t.surface, borderRadius: 22, borderWidth: 1, borderColor: '#EFEAE0', overflow: 'hidden' },
  bigCover: { height: 120, alignItems: 'center', justifyContent: 'center' },
  bigBadge: { position: 'absolute', top: 10, left: 10, backgroundColor: palette.midnightNavy, borderRadius: radius.pill, paddingVertical: 4, paddingHorizontal: 10 },
  bigBadgeText: { fontFamily: font.bold, fontSize: 11, color: t.accent },
  card: {
    backgroundColor: t.surface, borderRadius: 18, borderWidth: 1, borderColor: '#EFEAE0',
    padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  cardIcon: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontFamily: font.bold, fontSize: 16, color: t.text },
  meta: { fontFamily: font.medium, fontSize: 13, color: '#5B6573' },
  chev: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#F4F0E7', alignItems: 'center', justifyContent: 'center' },
  empty: { backgroundColor: t.surface, borderRadius: 18, borderWidth: 1, borderStyle: 'dashed', borderColor: '#D5CDBD', padding: 16 },
});
