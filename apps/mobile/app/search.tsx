import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { font, lightTheme as t, palette, radius } from '@together/ui/tokens';
import { Avatar } from '../components/Avatar';
import { Backdrop } from '../components/Backdrop';
import { FadeIn, PressableScale } from '../components/motion';
import { SectionHeader } from '../components/ui';
import { FollowButton } from '../components/FollowButton';
import { fetchPublicGroups, joinGroup, type GroupSummary } from '../lib/groups';
import { categoryColor, categoryName, fetchCategories, fetchSuggestedGroups, type Category, type SuggestedGroup } from '../lib/interests';
import { compact, follow, searchPeople, unfollow, type Person } from '../lib/social';
import { promptDeclareAge } from '../lib/teaching';

// Хайх: хүмүүс (дагах) ба группууд. Хоосон үед онцлох хүмүүс + санал болгох группууд.
export default function Search() {
  const { t: tr } = useTranslation();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [people, setPeople] = useState<Person[]>([]);
  const [featured, setFeatured] = useState<Person[]>([]);
  const [suggested, setSuggested] = useState<SuggestedGroup[]>([]);
  const [publicGroups, setPublicGroups] = useState<GroupSummary[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [joined, setJoined] = useState<Set<string>>(new Set());

  useEffect(() => {
    Promise.all([
      searchPeople('', 12).catch(() => [] as Person[]),
      fetchSuggestedGroups(8).catch(() => [] as SuggestedGroup[]),
      fetchPublicGroups().catch(() => [] as GroupSummary[]),
      fetchCategories().catch(() => [] as Category[]),
    ])
      .then(([p, s, g, c]) => {
        setFeatured(p);
        setSuggested(s);
        setPublicGroups(g);
        setCats(c);
      })
      .finally(() => setLoading(false));
  }, []);

  // 300ms debounce.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setPeople([]);
      return;
    }
    setSearching(true);
    const h = setTimeout(() => {
      searchPeople(q, 30)
        .then(setPeople)
        .catch(() => setPeople([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(h);
  }, [query]);

  const catById = useMemo(() => Object.fromEntries(cats.map((c) => [c.id, c])), [cats]);
  const q = query.trim().toLowerCase();
  const groupResults = q
    ? publicGroups.filter((g) => g.name.toLowerCase().includes(q) || (g.description ?? '').toLowerCase().includes(q)).slice(0, 10)
    : [];

  const setPerson = (id: string, patch: Partial<Person>) => {
    const f = (list: Person[]) => list.map((p) => (p.id === id ? { ...p, ...patch } : p));
    setPeople(f);
    setFeatured(f);
  };

  const onFollow = async (p: Person) => {
    setBusyId(p.id);
    try {
      if (p.i_follow) {
        await unfollow(p.id);
        setPerson(p.id, { i_follow: false, followers: Math.max(0, p.followers - 1) });
      } else {
        await follow(p.id);
        setPerson(p.id, { i_follow: true, followers: p.followers + 1 });
      }
    } catch (e: any) {
      Alert.alert(tr('common.error'), String(e?.message ?? e));
    } finally {
      setBusyId(null);
    }
  };

  const onJoin = async (id: string) => {
    setBusyId(id);
    try {
      const status = await joinGroup(id);
      setJoined((s) => new Set(s).add(id));
      Alert.alert(tr('groups.joinedTitle'), status === 'active' ? tr('groups.joinedNow') : tr('groups.joinPending'));
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (msg.includes('course_adults_only')) {
        promptDeclareAge(() => onJoin(id));
        return;
      }
      Alert.alert(tr('common.error'), msg.includes('invite_only') ? tr('groups.inviteOnly') : msg);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <Stack.Screen options={{ title: tr('search.title') }} />
      <Backdrop />
      <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
        <FadeIn index={0}>
          <View style={styles.search}>
            <Ionicons name="search" size={19} color={t.textMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={tr('search.placeholder')}
              placeholderTextColor={t.textFaint}
              style={styles.searchInput}
              autoFocus
              autoCapitalize="none"
              returnKeyType="search"
              accessibilityLabel={tr('search.placeholder')}
            />
            {searching && <ActivityIndicator size="small" color={t.accent} />}
          </View>
        </FadeIn>

        {loading ? (
          <ActivityIndicator color={t.accent} style={{ marginTop: 30 }} />
        ) : q ? (
          <>
            <FadeIn index={1}>
              <SectionHeader title={tr('search.people')} />
            </FadeIn>
            {!searching && people.length === 0 && <Text style={styles.muted}>{tr('search.noPeople')}</Text>}
            {people.map((p, i) => (
              <FadeIn key={p.id} index={i + 2}>
                <PersonRow person={p} busy={busyId === p.id} onFollow={() => onFollow(p)} onOpen={() => router.push(`/user/${p.id}` as never)} />
              </FadeIn>
            ))}
            {groupResults.length > 0 && (
              <FadeIn index={people.length + 2}>
                <SectionHeader title={tr('search.groups')} />
              </FadeIn>
            )}
            {groupResults.map((g, i) => (
              <FadeIn key={g.id} index={people.length + 3 + i}>
                <GroupRow
                  name={g.name}
                  icon={g.kind === 'course' ? '📚' : (g.category_id && catById[g.category_id]?.icon) || '👥'}
                  categoryId={g.category_id}
                  meta={g.category_id && catById[g.category_id] ? categoryName(catById[g.category_id]) : tr('groups.public')}
                  joined={joined.has(g.id)}
                  busy={busyId === g.id}
                  onJoin={g.join_policy === 'invite_only' ? undefined : () => onJoin(g.id)}
                  onOpen={() => router.push(`/group/${g.id}` as never)}
                />
              </FadeIn>
            ))}
          </>
        ) : (
          <>
            {featured.length > 0 && (
              <FadeIn index={1} style={{ gap: 12 }}>
                <SectionHeader title={tr('search.featured')} />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: 20 }} style={{ marginHorizontal: -20 }}>
                  {featured.map((p) => (
                    <PressableScale key={p.id} onPress={() => router.push(`/user/${p.id}` as never)} accessibilityRole="button" style={styles.personCard}>
                      <Avatar name={p.display_name} url={p.avatar_url} size={72} ring />
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Text style={styles.personName} numberOfLines={1}>
                          {p.display_name}
                        </Text>
                        {p.verified && <Ionicons name="checkmark-circle" size={14} color={palette.violet} />}
                      </View>
                      <Text style={styles.meta}>
                        {compact(p.followers)} {tr('me.followersLower')}
                      </Text>
                      <FollowButton following={p.i_follow} busy={busyId === p.id} onPress={() => onFollow(p)} small />
                    </PressableScale>
                  ))}
                </ScrollView>
              </FadeIn>
            )}

            {suggested.length > 0 && (
              <FadeIn index={2}>
                <SectionHeader title={tr('search.suggested')} action={tr('home.seeAll')} onAction={() => router.push('/groups' as never)} />
              </FadeIn>
            )}
            {suggested.map((g, i) => (
              <FadeIn key={g.id} index={i + 3}>
                <GroupRow
                  name={g.name}
                  icon={g.kind === 'course' ? '📚' : (g.category_id && catById[g.category_id]?.icon) || '👥'}
                  categoryId={g.category_id}
                  meta={[g.category_id && catById[g.category_id] ? categoryName(catById[g.category_id]) : null, `${compact(g.members)} ${tr('groups.members')}`]
                    .filter(Boolean)
                    .join(' · ')}
                  joined={joined.has(g.id)}
                  busy={busyId === g.id}
                  onJoin={g.join_policy === 'invite_only' ? undefined : () => onJoin(g.id)}
                  onOpen={() => router.push(`/group/${g.id}` as never)}
                />
              </FadeIn>
            ))}
            {featured.length === 0 && suggested.length === 0 && <Text style={styles.muted}>{tr('search.emptyHint')}</Text>}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function PersonRow({ person: p, busy, onFollow, onOpen }: { person: Person; busy: boolean; onFollow: () => void; onOpen: () => void }) {
  const { t: tr } = useTranslation();
  return (
    <PressableScale onPress={onOpen} accessibilityRole="button" style={styles.row}>
      <Avatar name={p.display_name} url={p.avatar_url} size={48} />
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {p.display_name}
          </Text>
          {p.verified && <Ionicons name="checkmark-circle" size={14} color={palette.violet} />}
        </View>
        <Text style={styles.meta}>
          @{p.username} · {compact(p.followers)} {tr('me.followersLower')}
        </Text>
      </View>
      <FollowButton following={p.i_follow} busy={busy} onPress={onFollow} small />
    </PressableScale>
  );
}

function GroupRow({
  name,
  icon,
  categoryId,
  meta,
  joined,
  busy,
  onJoin,
  onOpen,
}: {
  name: string;
  icon: string;
  categoryId: string | null;
  meta: string;
  joined: boolean;
  busy: boolean;
  onJoin?: () => void;
  onOpen: () => void;
}) {
  const { t: tr } = useTranslation();
  return (
    <PressableScale onPress={onOpen} accessibilityRole="button" style={styles.row}>
      <LinearGradient colors={categoryColor(categoryId)} style={styles.groupIcon}>
        <Text style={{ fontSize: 22 }}>{icon}</Text>
      </LinearGradient>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {meta}
        </Text>
      </View>
      {onJoin && !joined && (
        <PressableScale onPress={onJoin} disabled={busy} accessibilityRole="button" style={styles.joinBtn}>
          {busy ? <ActivityIndicator size="small" color={t.text} /> : <Text style={styles.joinText}>{tr('groups.join')}</Text>}
        </PressableScale>
      )}
      {joined && <Ionicons name="checkmark-circle" size={22} color={palette.mint} />}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 20, paddingTop: 16, gap: 14, paddingBottom: 48 },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: 10, height: 52, borderRadius: radius.pill,
    backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, paddingHorizontal: 18,
  },
  searchInput: { flex: 1, fontFamily: font.medium, fontSize: 15, color: t.text },
  muted: { fontFamily: font.medium, fontSize: 14, color: t.textMuted },
  meta: { fontFamily: font.medium, fontSize: 12, color: t.textMuted },
  personCard: {
    width: 128, alignItems: 'center', gap: 6, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border,
    borderRadius: 22, paddingVertical: 14, paddingHorizontal: 10,
  },
  personName: { fontFamily: font.bold, fontSize: 14, color: t.text, maxWidth: 92 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border,
    borderRadius: 20, padding: 12,
  },
  rowTitle: { fontFamily: font.bold, fontSize: 15, color: t.text, flexShrink: 1 },
  groupIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  joinBtn: {
    borderRadius: radius.pill, paddingVertical: 8, paddingHorizontal: 16, backgroundColor: 'rgba(139,92,246,0.25)',
    borderWidth: 1, borderColor: 'rgba(196,181,253,0.45)', minWidth: 80, alignItems: 'center',
  },
  joinText: { fontFamily: font.bold, fontSize: 13, color: '#FFFFFF' },
});
