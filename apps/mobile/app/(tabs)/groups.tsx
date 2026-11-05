import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { font, gradients, lightTheme as t, palette, radius, shadow } from '@together/ui/tokens';
import { SectionHeader } from '../../components/ui';
import { AvatarStack } from '../../components/Avatar';
import { Backdrop } from '../../components/Backdrop';
import { FadeIn, PressableScale } from '../../components/motion';
import { TAB_BAR_SPACE } from '../../components/TabBar';
import { useSession } from '../../lib/session';
import { fetchMyGroups, fetchPublicGroups, joinGroup, type GroupSummary } from '../../lib/groups';
import { categoryColor, categoryName, fetchCategories, fetchSuggestedGroups, type Category } from '../../lib/interests';
import { compact, fetchGroupStats, type GroupStat } from '../../lib/social';
import { promptDeclareAge } from '../../lib/teaching';

const PREVIEW = 3;

// Группууд: хайлт, ангилал, онцлох бүлэг, миний группууд, нээлттэй группууд.
// Нүүрнээс ?category=<id> параметрээр ирвэл тэр ангиллаар шүүгдэнэ.
export default function Groups() {
  const { t: tr } = useTranslation();
  const router = useRouter();
  const { session } = useSession();
  const myId = session?.user.id;
  const params = useLocalSearchParams<{ category?: string }>();
  const [mine, setMine] = useState<GroupSummary[]>([]);
  const [discover, setDiscover] = useState<GroupSummary[]>([]);
  const [suggestedIds, setSuggestedIds] = useState<Set<string>>(new Set());
  const [stats, setStats] = useState<Record<string, GroupStat>>({});
  const [cats, setCats] = useState<Category[]>([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [catsOpen, setCatsOpen] = useState(false);
  const [allMine, setAllMine] = useState(false);
  const [allDiscover, setAllDiscover] = useState(false);
  const [joining, setJoining] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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
      fetchGroupStats([...m, ...d].map((g) => g.id))
        .then(setStats)
        .catch(() => {});
    } catch (e: any) {
      Alert.alert(tr('common.error'), String(e.message ?? e));
    } finally {
      setLoading(false);
      setRefreshing(false);
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

  const members = (g: GroupSummary) => stats[g.id]?.members ?? 0;
  const mineFiltered = mine.filter(matches);
  // Санал болгосон нь эхэнд, дараа нь гишүүдийн тоогоор.
  const discoverFiltered = discover
    .filter(matches)
    .sort((a, b) => Number(suggestedIds.has(b.id)) - Number(suggestedIds.has(a.id)) || members(b) - members(a));
  const featured = discoverFiltered[0] ?? null;
  const others = discoverFiltered.slice(featured ? 1 : 0);

  const open = (g: GroupSummary) => router.push(`/group/${g.id}` as never);

  const onJoin = async (g: GroupSummary) => {
    setJoining(g.id);
    try {
      const status = await joinGroup(g.id);
      Alert.alert(tr('groups.joinedTitle'), status === 'active' ? tr('groups.joinedNow') : tr('groups.joinPending'));
      await load();
    } catch (e: any) {
      const msg = String(e.message ?? e);
      if (msg.includes('course_adults_only')) {
        promptDeclareAge(() => onJoin(g));
        return;
      }
      Alert.alert(tr('common.error'), msg.includes('invite_only') ? tr('groups.inviteOnly') : msg.includes('banned') ? tr('groups.banned') : msg);
    } finally {
      setJoining(null);
    }
  };

  const chipCats = catsOpen ? cats : cats.slice(0, 4);
  let row = 0;

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <Backdrop />
      <ScrollView
        contentContainerStyle={styles.screen}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            tintColor={t.accent}
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
          />
        }
      >
        <FadeIn index={row++}>
          <View style={styles.header}>
            <PressableScale
              onPress={() => router.push('/join' as never)}
              accessibilityRole="button"
              accessibilityLabel={tr('groups.joinByCode')}
              style={styles.roundBtn}
            >
              <Ionicons name="key-outline" size={19} color={t.text} />
            </PressableScale>
            <Text style={styles.title}>{tr('groups.title')}</Text>
            <PressableScale onPress={() => router.push('/group/new' as never)} accessibilityRole="button" style={shadow.glow}>
              <LinearGradient colors={gradients.violet} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.createBtn}>
                <Ionicons name="add" size={18} color="#FFFFFF" />
                <Text style={styles.createText}>{tr('groups.createShort')}</Text>
              </LinearGradient>
            </PressableScale>
          </View>
        </FadeIn>

        <FadeIn index={row++}>
          <View style={styles.search}>
            <Ionicons name="search" size={19} color={t.textMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={tr('groups.search')}
              placeholderTextColor={t.textFaint}
              style={styles.searchInput}
              accessibilityLabel={tr('groups.search')}
            />
            {!!query && (
              <Pressable onPress={() => setQuery('')} hitSlop={10} accessibilityLabel={tr('common.cancel')}>
                <Ionicons name="close-circle" size={18} color={t.textFaint} />
              </Pressable>
            )}
          </View>
        </FadeIn>

        <FadeIn index={row++}>
          <View style={styles.chipsRow}>
            <ScrollView
              horizontal={!catsOpen}
              showsHorizontalScrollIndicator={false}
              style={{ flex: 1 }}
              contentContainerStyle={[styles.chips, catsOpen && { flexWrap: 'wrap' }]}
            >
              <CatChip label={tr('groups.all')} selected={category === null} onPress={() => setCategory(null)} />
              {chipCats.map((c) => (
                <CatChip
                  key={c.id}
                  icon={c.icon}
                  label={categoryName(c)}
                  selected={category === c.id}
                  onPress={() => setCategory(category === c.id ? null : c.id)}
                />
              ))}
            </ScrollView>
            {cats.length > 4 && (
              <PressableScale
                onPress={() => setCatsOpen((v) => !v)}
                accessibilityRole="button"
                accessibilityLabel={tr('groups.allCats')}
                style={styles.chevBtn}
              >
                <Ionicons name={catsOpen ? 'chevron-up' : 'chevron-down'} size={17} color={t.text} />
              </PressableScale>
            )}
          </View>
        </FadeIn>

        {loading ? (
          <ActivityIndicator color={t.accent} style={{ marginTop: 30 }} />
        ) : (
          <>
            {featured && (
              <FadeIn index={row++}>
                <FeaturedCard
                  group={featured}
                  cat={featured.category_id ? catById[featured.category_id] : undefined}
                  stat={stats[featured.id]}
                  onOpen={open}
                />
              </FadeIn>
            )}

            <FadeIn index={row++}>
              <SectionHeader
                title={tr('groups.mine')}
                action={mineFiltered.length > PREVIEW ? (allMine ? tr('groups.less') : tr('home.seeAll')) : undefined}
                onAction={() => setAllMine((v) => !v)}
              />
            </FadeIn>
            {mineFiltered.length === 0 && (
              <FadeIn index={row++}>
                <View style={styles.empty}>
                  <Text style={styles.meta}>{tr('groups.noMine')}</Text>
                </View>
              </FadeIn>
            )}
            {(allMine ? mineFiltered : mineFiltered.slice(0, PREVIEW)).map((g) => (
              <FadeIn key={g.id} index={row++}>
                <GroupCard
                  group={g}
                  cat={g.category_id ? catById[g.category_id] : undefined}
                  stat={stats[g.id]}
                  role={g.owner_id === myId ? tr('groups.owner') : tr('groups.memberRole')}
                  onOpen={open}
                />
              </FadeIn>
            ))}

            <FadeIn index={row++}>
              <SectionHeader
                title={tr('groups.discover')}
                action={others.length > PREVIEW ? (allDiscover ? tr('groups.less') : tr('home.seeAll')) : undefined}
                onAction={() => setAllDiscover((v) => !v)}
              />
            </FadeIn>
            {others.length === 0 && (
              <FadeIn index={row++}>
                <View style={styles.empty}>
                  <Text style={styles.meta}>{tr('groups.noDiscover')}</Text>
                </View>
              </FadeIn>
            )}
            {(allDiscover ? others : others.slice(0, PREVIEW)).map((g) => (
              <FadeIn key={g.id} index={row++}>
                <GroupCard
                  group={g}
                  cat={g.category_id ? catById[g.category_id] : undefined}
                  stat={stats[g.id]}
                  role={suggestedIds.has(g.id) ? tr('groups.forYou') : undefined}
                  onOpen={open}
                  onJoin={g.join_policy === 'invite_only' ? undefined : () => onJoin(g)}
                  joining={joining === g.id}
                />
              </FadeIn>
            ))}

            <FadeIn index={row++}>
              <PressableScale onPress={() => router.push('/teachers' as never)} accessibilityRole="button" style={styles.teachers}>
                <LinearGradient colors={['#FF8A3D', '#EC4899']} style={styles.teachersIcon}>
                  <Text style={{ fontSize: 22 }}>👩‍🏫</Text>
                </LinearGradient>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{tr('teachers.title')}</Text>
                  <Text style={styles.meta}>{tr('teachers.subtitle')}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={t.textFaint} />
              </PressableScale>
            </FadeIn>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function CatChip({ label, icon, selected, onPress }: { label: string; icon?: string; selected: boolean; onPress: () => void }) {
  return (
    <PressableScale onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected }}>
      {selected ? (
        <LinearGradient colors={gradients.violet} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.chip, styles.chipOn]}>
          {!!icon && <Text style={{ fontSize: 13 }}>{icon}</Text>}
          <Text style={[styles.chipText, { fontFamily: font.bold }]}>{label}</Text>
        </LinearGradient>
      ) : (
        <View style={styles.chip}>
          {!!icon && <Text style={{ fontSize: 13 }}>{icon}</Text>}
          <Text style={styles.chipText}>{label}</Text>
        </View>
      )}
    </PressableScale>
  );
}

// Онцлох бүлэг: нүүр зураг (эсвэл градиент), "Онцлох" шошго, гишүүд, сум.
function FeaturedCard({
  group: g,
  cat,
  stat,
  onOpen,
}: {
  group: GroupSummary;
  cat?: Category;
  stat?: GroupStat;
  onOpen: (g: GroupSummary) => void;
}) {
  const { t: tr } = useTranslation();
  return (
    <PressableScale onPress={() => onOpen(g)} accessibilityRole="button" scaleTo={0.98} style={styles.featured}>
      {g.cover_url ? (
        <Image source={{ uri: g.cover_url }} style={StyleSheet.absoluteFill} />
      ) : (
        <LinearGradient colors={categoryColor(g.category_id)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill}>
          <Text style={styles.featuredEmoji}>{g.kind === 'course' ? '📚' : cat?.icon ?? '👥'}</Text>
        </LinearGradient>
      )}
      <LinearGradient colors={['rgba(12,10,28,0)', 'rgba(12,10,28,0.85)']} style={StyleSheet.absoluteFill} />
      <View style={styles.featuredTag}>
        <Ionicons name="star" size={12} color={palette.amber} />
        <Text style={styles.featuredTagText}>{tr('groups.featured')}</Text>
      </View>
      <View style={styles.featuredBottom}>
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={styles.featuredTitle} numberOfLines={1}>
            {g.name}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <AvatarStack people={stat?.preview ?? []} total={stat?.members ?? 0} size={22} />
            <Text style={styles.featuredMeta}>
              {compact(stat?.members ?? 0)} {tr('groups.members')}
            </Text>
          </View>
        </View>
        <LinearGradient colors={gradients.violet} style={styles.featuredArrow}>
          <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
        </LinearGradient>
      </View>
    </PressableScale>
  );
}

function GroupCard({
  group: g,
  cat,
  stat,
  role,
  onOpen,
  onJoin,
  joining,
}: {
  group: GroupSummary;
  cat?: Category;
  stat?: GroupStat;
  role?: string;
  onOpen: (g: GroupSummary) => void;
  onJoin?: () => void;
  joining?: boolean;
}) {
  const { t: tr } = useTranslation();
  const count = stat?.members ?? 0;
  return (
    <PressableScale onPress={() => onOpen(g)} accessibilityRole="button" style={styles.card}>
      <LinearGradient colors={categoryColor(g.category_id)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.cardIcon}>
        {g.cover_url ? (
          <Image source={{ uri: g.cover_url }} style={{ width: '100%', height: '100%', borderRadius: 16 }} />
        ) : (
          <Text style={{ fontSize: 26 }}>{g.kind === 'course' ? '📚' : cat?.icon ?? '👥'}</Text>
        )}
      </LinearGradient>
      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Text style={[styles.cardTitle, { flexShrink: 1 }]} numberOfLines={1}>
            {g.name}
          </Text>
          {g.kind === 'course' && <Ionicons name="checkmark-circle" size={15} color={palette.violet} />}
          {g.visibility === 'private' && <Ionicons name="lock-closed" size={12} color={t.textFaint} />}
        </View>
        <Text style={styles.meta} numberOfLines={1}>
          {[`${compact(count)} ${tr('groups.members')}`, role, cat ? categoryName(cat) : null].filter(Boolean).join(' · ')}
        </Text>
        {(stat?.preview.length ?? 0) > 0 && <AvatarStack people={stat!.preview} total={count} size={22} />}
      </View>
      {onJoin ? (
        <PressableScale
          onPress={onJoin}
          disabled={joining}
          accessibilityRole="button"
          accessibilityLabel={tr('groups.join')}
          style={styles.joinBtn}
        >
          {joining ? <ActivityIndicator size="small" color={t.text} /> : <Ionicons name="add" size={20} color={t.text} />}
        </PressableScale>
      ) : (
        <Ionicons name="chevron-forward" size={18} color={t.textFaint} />
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 20, paddingTop: 58, gap: 14, paddingBottom: TAB_BAR_SPACE },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontFamily: font.extrabold, fontSize: 20, color: t.text },
  roundBtn: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border,
    alignItems: 'center', justifyContent: 'center',
  },
  createBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.pill, paddingVertical: 9, paddingHorizontal: 14 },
  createText: { fontFamily: font.bold, fontSize: 14, color: '#FFFFFF' },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: 10, height: 52, borderRadius: radius.pill,
    backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, paddingHorizontal: 18,
  },
  searchInput: { flex: 1, fontFamily: font.medium, fontSize: 15, color: t.text },
  chipsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  chips: { gap: 8, paddingRight: 4 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border,
    borderRadius: radius.pill, paddingVertical: 8, paddingHorizontal: 14,
  },
  chipOn: { borderColor: 'rgba(196,181,253,0.5)' },
  chipText: { fontFamily: font.semibold, fontSize: 13, color: t.text },
  chevBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border,
    alignItems: 'center', justifyContent: 'center',
  },
  featured: {
    height: 170, borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(196,181,253,0.25)',
    justifyContent: 'space-between', padding: 14,
  },
  featuredEmoji: { position: 'absolute', right: 26, top: 22, fontSize: 70, opacity: 0.9 },
  featuredTag: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(251,191,36,0.18)',
    borderWidth: 1, borderColor: 'rgba(251,191,36,0.45)', borderRadius: radius.pill, paddingVertical: 4, paddingHorizontal: 10,
  },
  featuredTagText: { fontFamily: font.bold, fontSize: 12, color: palette.amber },
  featuredBottom: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  featuredTitle: { fontFamily: font.extrabold, fontSize: 20, color: '#FFFFFF' },
  featuredMeta: { fontFamily: font.semibold, fontSize: 13, color: 'rgba(255,255,255,0.85)' },
  featuredArrow: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  card: {
    backgroundColor: t.surface, borderRadius: 22, borderWidth: 1, borderColor: t.border,
    padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  cardIcon: {
    width: 60, height: 60, borderRadius: 18, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  cardTitle: { fontFamily: font.bold, fontSize: 16, color: t.text },
  meta: { fontFamily: font.medium, fontSize: 12, color: t.textMuted },
  joinBtn: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(139,92,246,0.18)', borderWidth: 1,
    borderColor: 'rgba(196,181,253,0.4)', alignItems: 'center', justifyContent: 'center',
  },
  empty: { borderRadius: 20, borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.18)', padding: 16 },
  teachers: {
    backgroundColor: t.surface, borderRadius: 22, borderWidth: 1, borderColor: t.border,
    padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6,
  },
  teachersIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
