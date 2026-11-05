import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { font, gradients, lightTheme as t, palette, radius } from '@together/ui/tokens';
import { Avatar } from '../components/Avatar';
import { Backdrop } from '../components/Backdrop';
import { FadeIn, PressableScale } from '../components/motion';
import { Segmented } from '../components/ui';
import { timeAgo } from '../lib/time';
import {
  adminErrorKey,
  adminHideContent,
  adminOverview,
  adminReports,
  adminSetBan,
  adminSetReportStatus,
  adminTeachers,
  adminVerifyTeacher,
  compact,
  type AdminOverview,
  type AdminReport,
  type AdminTeacher,
} from '../lib/social';

type Tab = 'reports' | 'teachers';
type Filter = 'open' | 'resolved' | 'dismissed' | 'all';

const TYPE_ICON: Record<AdminReport['target_type'], keyof typeof Ionicons.glyphMap> = {
  profile: 'person',
  group: 'people',
  goal: 'flag',
  post: 'document-text',
  comment: 'chatbubble',
  review: 'star',
  message: 'mail',
};
const HIDEABLE = new Set(['post', 'comment', 'review', 'message']);

// Админ самбар: тойм, гомдол (нуух, хориглох, хэрэгсэхгүй), багш баталгаажуулах.
export default function Admin() {
  const { t: tr } = useTranslation();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('reports');
  const [filter, setFilter] = useState<Filter>('open');
  const [pendingOnly, setPendingOnly] = useState(true);
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [teachers, setTeachers] = useState<AdminTeacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const fail = (e: unknown) => {
    const key = adminErrorKey(e);
    Alert.alert(tr('common.error'), key ? tr(key) : String((e as any)?.message ?? e));
  };

  const load = useCallback(async () => {
    try {
      const [o, r, te] = await Promise.all([adminOverview(), adminReports(filter), adminTeachers(pendingOnly)]);
      setOverview(o);
      setReports(r);
      setTeachers(te);
      setForbidden(false);
    } catch (e) {
      if (adminErrorKey(e) === 'admin.errors.forbidden') setForbidden(true);
      else fail(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, pendingOnly]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const act = async (id: string, fn: () => Promise<void>) => {
    setBusyId(id);
    try {
      await fn();
      await load();
    } catch (e) {
      fail(e);
    } finally {
      setBusyId(null);
    }
  };

  const confirmBan = (r: AdminReport) => {
    if (!r.target_owner) return;
    const banning = !r.owner_banned;
    Alert.alert(
      banning ? tr('admin.banTitle', { name: r.target_owner_name ?? '—' }) : tr('admin.unbanTitle', { name: r.target_owner_name ?? '—' }),
      banning ? tr('admin.banBody') : undefined,
      [
        { text: tr('common.cancel'), style: 'cancel' },
        {
          text: banning ? tr('admin.ban') : tr('admin.unban'),
          style: banning ? 'destructive' : 'default',
          onPress: () => act(r.id, () => adminSetBan(r.target_owner!, banning)),
        },
      ],
    );
  };

  const openTarget = (r: AdminReport) => {
    if (r.target_type === 'post') router.push(`/post/${r.target_id}` as never);
    else if (r.target_type === 'group') router.push(`/group/${r.target_id}` as never);
    else if (r.target_type === 'profile') router.push(`/user/${r.target_id}` as never);
    else if (r.target_owner) router.push(`/user/${r.target_owner}` as never);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: tr('admin.title') }} />
        <ActivityIndicator color={t.accent} />
      </View>
    );
  }

  if (forbidden) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: tr('admin.title') }} />
        <Ionicons name="lock-closed-outline" size={34} color={t.textMuted} />
        <Text style={[styles.muted, { marginTop: 10, textAlign: 'center', paddingHorizontal: 30 }]}>{tr('admin.errors.forbidden')}</Text>
      </View>
    );
  }

  const tiles: { key: keyof AdminOverview; icon: keyof typeof Ionicons.glyphMap; colors: readonly [string, string] }[] = [
    { key: 'open_reports', icon: 'flag', colors: ['#FB7185', '#EC4899'] },
    { key: 'pending_teachers', icon: 'school', colors: ['#FF8A3D', '#F0568C'] },
    { key: 'users', icon: 'people', colors: ['#A855F7', '#7C3AED'] },
    { key: 'new_users_7d', icon: 'person-add', colors: ['#34D399', '#0EA5E9'] },
    { key: 'groups', icon: 'grid', colors: ['#3B82F6', '#7C3AED'] },
    { key: 'posts_7d', icon: 'document-text', colors: ['#EC4899', '#8B5CF6'] },
    { key: 'messages_7d', icon: 'chatbubbles', colors: ['#0EA5E9', '#8B5CF6'] },
    { key: 'banned', icon: 'ban', colors: ['#64748B', '#334155'] },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <Stack.Screen options={{ title: tr('admin.title') }} />
      <Backdrop />
      <ScrollView
        contentContainerStyle={styles.screen}
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
        {/* Тойм */}
        <FadeIn index={0}>
          <View style={styles.grid}>
            {tiles.map((tile) => (
              <View key={tile.key} style={styles.tile}>
                <LinearGradient colors={tile.colors} style={styles.tileIcon}>
                  <Ionicons name={tile.icon} size={16} color="#FFFFFF" />
                </LinearGradient>
                <Text style={styles.tileValue}>{compact(Number(overview?.[tile.key] ?? 0))}</Text>
                <Text style={styles.tileLabel} numberOfLines={2}>
                  {tr(`admin.stats.${tile.key}`)}
                </Text>
              </View>
            ))}
          </View>
        </FadeIn>

        <FadeIn index={1}>
          <Segmented<Tab>
            options={[
              { value: 'reports', label: `${tr('admin.reports')} · ${overview?.open_reports ?? 0}` },
              { value: 'teachers', label: `${tr('admin.teachers')} · ${overview?.pending_teachers ?? 0}` },
            ]}
            value={tab}
            onChange={setTab}
          />
        </FadeIn>

        {tab === 'reports' && (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {(['open', 'resolved', 'dismissed', 'all'] as Filter[]).map((f) => (
                <PressableScale key={f} onPress={() => setFilter(f)} accessibilityRole="radio" accessibilityState={{ selected: filter === f }}>
                  {filter === f ? (
                    <LinearGradient colors={gradients.violet} style={styles.chip}>
                      <Text style={[styles.chipText, { fontFamily: font.bold }]}>{tr(`admin.filter.${f}`)}</Text>
                    </LinearGradient>
                  ) : (
                    <View style={[styles.chip, styles.chipOff]}>
                      <Text style={styles.chipText}>{tr(`admin.filter.${f}`)}</Text>
                    </View>
                  )}
                </PressableScale>
              ))}
            </ScrollView>

            {reports.length === 0 && (
              <View style={styles.empty}>
                <Text style={{ fontSize: 34 }}>🎉</Text>
                <Text style={styles.muted}>{tr('admin.noReports')}</Text>
              </View>
            )}

            {reports.map((r, i) => {
              const busy = busyId === r.id;
              const isOpen = r.status === 'open' || r.status === 'reviewing';
              return (
                <FadeIn key={r.id} index={i + 2}>
                  <View style={styles.card}>
                    <View style={styles.cardHead}>
                      <View style={styles.typeTag}>
                        <Ionicons name={TYPE_ICON[r.target_type]} size={13} color={palette.lilac} />
                        <Text style={styles.typeText}>{tr(`admin.type.${r.target_type}`)}</Text>
                      </View>
                      {r.reports_on_target > 1 && (
                        <View style={[styles.typeTag, { backgroundColor: 'rgba(251,113,133,0.16)' }]}>
                          <Text style={[styles.typeText, { color: palette.rose }]}>×{r.reports_on_target}</Text>
                        </View>
                      )}
                      <View style={{ flex: 1 }} />
                      <Text style={[styles.status, isOpen ? { color: palette.amber } : r.status === 'resolved' ? { color: palette.mint } : null]}>
                        {tr(`admin.status.${r.status}`)}
                      </Text>
                    </View>

                    <Text style={styles.reason}>“{r.reason}”</Text>

                    <PressableScale onPress={() => openTarget(r)} accessibilityRole="button" style={styles.target}>
                      {!!r.target_title && (
                        <Text style={styles.targetTitle} numberOfLines={1}>
                          {r.target_title}
                        </Text>
                      )}
                      <Text style={styles.targetBody} numberOfLines={4}>
                        {r.target_body ?? tr('admin.noPreview')}
                      </Text>
                      {r.target_hidden && (
                        <Text style={[styles.meta, { color: palette.rose }]}>👁‍🗨 {tr('admin.hiddenLabel')}</Text>
                      )}
                    </PressableScale>

                    <View style={styles.people}>
                      {!!r.target_owner && (
                        <PressableScale onPress={() => router.push(`/user/${r.target_owner}` as never)} accessibilityRole="button" style={styles.owner}>
                          <Avatar name={r.target_owner_name} size={22} />
                          <Text style={styles.ownerText} numberOfLines={1}>
                            {r.target_owner_name ?? '—'}
                          </Text>
                          {r.owner_banned && <Text style={[styles.meta, { color: palette.rose }]}>· {tr('admin.bannedLabel')}</Text>}
                        </PressableScale>
                      )}
                      <Text style={styles.meta} numberOfLines={1}>
                        {tr('admin.reportedBy', { name: r.reporter_name ?? '—' })} · {timeAgo(r.created_at)}
                      </Text>
                    </View>

                    <View style={styles.actions}>
                      {HIDEABLE.has(r.target_type) && (
                        <ActionBtn
                          icon={r.target_hidden ? 'eye' : 'eye-off'}
                          label={r.target_hidden ? tr('admin.unhide') : tr('admin.hide')}
                          danger={!r.target_hidden}
                          disabled={busy}
                          onPress={() => act(r.id, () => adminHideContent(r.target_type, r.target_id, !r.target_hidden))}
                        />
                      )}
                      {!!r.target_owner && (
                        <ActionBtn
                          icon={r.owner_banned ? 'refresh' : 'ban'}
                          label={r.owner_banned ? tr('admin.unban') : tr('admin.ban')}
                          danger={!r.owner_banned}
                          disabled={busy}
                          onPress={() => confirmBan(r)}
                        />
                      )}
                      {isOpen ? (
                        <>
                          <ActionBtn icon="close" label={tr('admin.dismiss')} disabled={busy} onPress={() => act(r.id, () => adminSetReportStatus(r.id, 'dismissed'))} />
                          <ActionBtn icon="checkmark" label={tr('admin.resolve')} ok disabled={busy} onPress={() => act(r.id, () => adminSetReportStatus(r.id, 'resolved'))} />
                        </>
                      ) : (
                        <ActionBtn icon="refresh" label={tr('admin.reopen')} disabled={busy} onPress={() => act(r.id, () => adminSetReportStatus(r.id, 'open'))} />
                      )}
                      {busy && <ActivityIndicator size="small" color={t.accent} />}
                    </View>
                  </View>
                </FadeIn>
              );
            })}
          </>
        )}

        {tab === 'teachers' && (
          <>
            <Segmented<boolean>
              options={[
                { value: true, label: tr('admin.pendingTeachers') },
                { value: false, label: tr('admin.allTeachers') },
              ]}
              value={pendingOnly}
              onChange={setPendingOnly}
            />
            <Text style={styles.meta}>{tr('admin.teacherHint')}</Text>
            {teachers.length === 0 && (
              <View style={styles.empty}>
                <Text style={{ fontSize: 34 }}>👩‍🏫</Text>
                <Text style={styles.muted}>{tr('admin.noTeachers')}</Text>
              </View>
            )}
            {teachers.map((te, i) => {
              const busy = busyId === te.user_id;
              return (
                <FadeIn key={te.user_id} index={i + 2}>
                  <View style={styles.card}>
                    <PressableScale onPress={() => router.push(`/teacher/${te.user_id}` as never)} accessibilityRole="button" style={styles.teacherHead}>
                      <Avatar name={te.display_name} url={te.avatar_url} size={48} />
                      <View style={{ flex: 1, gap: 2 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Text style={styles.targetTitle} numberOfLines={1}>
                            {te.display_name}
                          </Text>
                          {!!te.verified_at && <Ionicons name="checkmark-circle" size={15} color={palette.violet} />}
                        </View>
                        <Text style={styles.meta}>
                          @{te.username} · {timeAgo(te.created_at)}
                        </Text>
                      </View>
                    </PressableScale>
                    {!!te.headline && <Text style={styles.reason}>{te.headline}</Text>}
                    {te.subjects.length > 0 && (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                        {te.subjects.map((s) => (
                          <View key={s} style={styles.subject}>
                            <Text style={styles.subjectText}>{s}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                    {!!te.intro && (
                      <Text style={styles.targetBody} numberOfLines={3}>
                        {te.intro}
                      </Text>
                    )}
                    <Text style={styles.meta}>
                      {tr('admin.teacherStats', { courses: te.courses, rating: te.rating_avg ?? '—', count: te.rating_count })}
                    </Text>
                    <View style={styles.actions}>
                      {te.verified_at ? (
                        <ActionBtn
                          icon="close-circle"
                          label={tr('admin.unverify')}
                          danger
                          disabled={busy}
                          onPress={() => act(te.user_id, () => adminVerifyTeacher(te.user_id, false))}
                        />
                      ) : (
                        <ActionBtn
                          icon="checkmark-circle"
                          label={tr('admin.verify')}
                          ok
                          disabled={busy}
                          onPress={() => act(te.user_id, () => adminVerifyTeacher(te.user_id, true))}
                        />
                      )}
                      {busy && <ActivityIndicator size="small" color={t.accent} />}
                    </View>
                  </View>
                </FadeIn>
              );
            })}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function ActionBtn({
  icon,
  label,
  onPress,
  danger,
  ok,
  disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  danger?: boolean;
  ok?: boolean;
  disabled?: boolean;
}) {
  const color = danger ? palette.rose : ok ? palette.mint : t.text;
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={[
        styles.action,
        danger && { borderColor: 'rgba(251,113,133,0.45)', backgroundColor: 'rgba(251,113,133,0.10)' },
        ok && { borderColor: 'rgba(52,211,153,0.45)', backgroundColor: 'rgba(52,211,153,0.10)' },
        disabled && { opacity: 0.5 },
      ]}
    >
      <Ionicons name={icon} size={15} color={color} />
      <Text style={[styles.actionText, { color }]}>{label}</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.background },
  screen: { padding: 16, gap: 14, paddingBottom: 48 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: {
    width: '23.5%', flexGrow: 1, minWidth: 76, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border,
    borderRadius: 18, padding: 10, gap: 4,
  },
  tileIcon: { width: 28, height: 28, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  tileValue: { fontFamily: font.extrabold, fontSize: 20, color: t.text },
  tileLabel: { fontFamily: font.medium, fontSize: 11, color: t.textMuted, lineHeight: 14 },
  chip: { borderRadius: radius.pill, paddingVertical: 8, paddingHorizontal: 14 },
  chipOff: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border },
  chipText: { fontFamily: font.semibold, fontSize: 13, color: '#FFFFFF' },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 30 },
  muted: { fontFamily: font.medium, fontSize: 14, color: t.textMuted },
  card: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 22, padding: 14, gap: 10 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  typeTag: {
    flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(139,92,246,0.18)',
    borderRadius: radius.pill, paddingVertical: 4, paddingHorizontal: 9,
  },
  typeText: { fontFamily: font.bold, fontSize: 11, color: palette.lilac },
  status: { fontFamily: font.bold, fontSize: 12, color: t.textMuted },
  reason: { fontFamily: font.semibold, fontSize: 14, color: t.text, lineHeight: 20 },
  target: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14, borderWidth: 1, borderColor: t.borderSoft, padding: 10, gap: 4 },
  targetTitle: { fontFamily: font.bold, fontSize: 14, color: t.text, flexShrink: 1 },
  targetBody: { fontFamily: font.medium, fontSize: 13, color: 'rgba(255,255,255,0.8)', lineHeight: 18 },
  people: { gap: 6 },
  owner: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ownerText: { fontFamily: font.semibold, fontSize: 13, color: t.text, flexShrink: 1 },
  meta: { fontFamily: font.medium, fontSize: 12, color: t.textMuted },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  action: {
    flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: radius.pill, paddingVertical: 7, paddingHorizontal: 12,
    borderWidth: 1, borderColor: t.border, backgroundColor: 'rgba(255,255,255,0.05)',
  },
  actionText: { fontFamily: font.bold, fontSize: 12 },
  teacherHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  subject: { backgroundColor: 'rgba(255,138,61,0.14)', borderRadius: radius.pill, paddingVertical: 4, paddingHorizontal: 10 },
  subjectText: { fontFamily: font.semibold, fontSize: 12, color: '#FDBA74' },
});
