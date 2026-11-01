import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { lightTheme as t, radius, space } from '@together/ui/tokens';
import { useSession } from '../../lib/session';
import { fetchBlockedIds } from '../../lib/account';
import { promptMemberActions, promptReport } from '../../lib/moderation';
import {
  createInvite,
  fetchGroup,
  fetchMembers,
  fetchMyMembership,
  joinGroup,
  leaveGroup,
  reviewJoinRequest,
  type GroupSummary,
  type MemberRow,
} from '../../lib/groups';

// Group дэлгэрэнгүй: гишүүд, нэгдэх/гарах, эзэнд хүсэлт + урилга, report/block.
export default function GroupDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const groupId = String(id);
  const { t: tr } = useTranslation();
  const router = useRouter();
  const { session } = useSession();
  const myId = session?.user.id;

  const [group, setGroup] = useState<GroupSummary | null>(null);
  const [membership, setMembership] = useState<{ role: string; status: string } | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [g, m, b] = await Promise.all([
        fetchGroup(groupId),
        fetchMyMembership(groupId),
        fetchBlockedIds().catch(() => new Set<string>()),
      ]);
      setGroup(g);
      setMembership(m);
      setBlockedIds(b);
      // Гишүүдийн жагсаалт зөвхөн харах эрхтэй үед (RLS шалгана).
      setMembers(await fetchMembers(groupId).catch(() => []));
    } catch (e: any) {
      Alert.alert(tr('common.error'), String(e.message ?? e));
    } finally {
      setLoading(false);
    }
  }, [groupId, tr]);

  useEffect(() => {
    load();
  }, [load]);

  const isActive = membership?.status === 'active';
  const isOwner = membership?.role === 'owner' && isActive;
  const isPending = membership?.status === 'pending';

  const onJoin = async () => {
    setBusy(true);
    try {
      const status = await joinGroup(groupId);
      Alert.alert(tr('groups.joinedTitle'), status === 'active' ? tr('groups.joinedNow') : tr('groups.joinPending'));
      await load();
    } catch (e: any) {
      const msg = String(e.message ?? e);
      Alert.alert(
        tr('common.error'),
        msg.includes('invite_only') ? tr('groups.inviteOnly') : msg.includes('banned') ? tr('groups.banned') : msg,
      );
    } finally {
      setBusy(false);
    }
  };

  const onLeave = () => {
    Alert.alert(tr('groups.leaveConfirmTitle'), tr('groups.leaveConfirm'), [
      { text: tr('common.cancel'), style: 'cancel' },
      {
        text: tr('groups.leave'),
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await leaveGroup(groupId);
            router.back();
          } catch (e: any) {
            Alert.alert(tr('common.error'), String(e.message ?? e));
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  const onReview = async (userId: string, approve: boolean) => {
    setBusy(true);
    try {
      await reviewJoinRequest(groupId, userId, approve);
      await load();
    } catch (e: any) {
      Alert.alert(tr('common.error'), String(e.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const onInvite = async () => {
    if (!group) return;
    setBusy(true);
    try {
      const code = await createInvite(groupId);
      await Share.share({ message: tr('groups.inviteShare', { name: group.name, code }) });
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

  if (!group) {
    return (
      <View style={[styles.center, { backgroundColor: t.background }]}>
        <Text style={{ color: t.textMuted }}>{tr('groups.notFound')}</Text>
      </View>
    );
  }

  // Блоклосон хэрэглэгчдийг жагсаалтаас нууна.
  const visible = members.filter((m) => !blockedIds.has(m.user_id));
  const pending = visible.filter((m) => m.status === 'pending');
  const active = visible.filter((m) => m.status === 'active');

  return (
    <ScrollView style={{ backgroundColor: t.background }} contentContainerStyle={styles.screen}>
      <Text style={[styles.title, { color: t.text }]}>{group.name}</Text>
      {!!group.description && <Text style={{ color: t.textMuted }}>{group.description}</Text>}
      <Text style={[styles.meta, { color: t.textMuted }]}>
        {group.visibility === 'private' ? tr('groups.private') : tr('groups.public')} · {active.length}{' '}
        {tr('groups.members')}
      </Text>

      {!isActive && !isPending && (
        <Pressable
          style={[styles.primary, { backgroundColor: t.accent, opacity: busy ? 0.6 : 1 }]}
          disabled={busy || group.join_policy === 'invite_only'}
          onPress={onJoin}
          accessibilityRole="button"
        >
          <Text style={[styles.primaryText, { color: t.onAccent }]}>
            {group.join_policy === 'invite_only'
              ? tr('groups.inviteOnly')
              : group.join_policy === 'approval' || group.visibility === 'private'
                ? tr('groups.requestJoin')
                : tr('groups.join')}
          </Text>
        </Pressable>
      )}

      {isPending && <Text style={[styles.meta, { color: t.textMuted }]}>{tr('groups.pendingLabel')}</Text>}

      {isOwner && (
        <Pressable
          style={[styles.secondary, { borderColor: t.border }]}
          onPress={onInvite}
          disabled={busy}
          accessibilityRole="button"
        >
          <Text style={{ color: t.text, fontWeight: '600' }}>{tr('groups.invite')}</Text>
        </Pressable>
      )}

      {isOwner && pending.length > 0 && (
        <>
          <Text style={[styles.section, { color: t.text }]}>{tr('groups.requests')}</Text>
          {pending.map((m) => (
            <View key={m.user_id} style={[styles.row, { borderColor: t.border, backgroundColor: t.surface }]}>
              <Text style={{ color: t.text, flex: 1 }}>{m.profiles?.display_name ?? '—'}</Text>
              <Pressable onPress={() => onReview(m.user_id, true)} disabled={busy} accessibilityRole="button">
                <Text style={{ color: t.text, fontWeight: '700', paddingHorizontal: space.sm }}>✓</Text>
              </Pressable>
              <Pressable onPress={() => onReview(m.user_id, false)} disabled={busy} accessibilityRole="button">
                <Text style={{ color: t.warning, fontWeight: '700', paddingHorizontal: space.sm }}>✕</Text>
              </Pressable>
            </View>
          ))}
        </>
      )}

      {isActive && (
        <>
          <Text style={[styles.section, { color: t.text }]}>{tr('groups.membersTitle')}</Text>
          <Text style={[styles.hint, { color: t.textMuted }]}>{tr('groups.memberHint')}</Text>
          {active.map((item) => (
            <Pressable
              key={item.user_id}
              onLongPress={() =>
                item.user_id !== myId &&
                promptMemberActions(item.profiles?.display_name ?? '—', item.user_id, load)
              }
              style={[styles.row, { borderColor: t.border, backgroundColor: t.surface }]}
            >
              <Text style={{ color: t.text, flex: 1 }}>{item.profiles?.display_name ?? '—'}</Text>
              {item.role === 'owner' && <Text style={{ color: t.textMuted, fontSize: 12 }}>{tr('groups.owner')}</Text>}
            </Pressable>
          ))}
          {!isOwner && (
            <Pressable onPress={onLeave} disabled={busy} accessibilityRole="button" style={styles.textBtn}>
              <Text style={{ color: t.warning }}>{tr('groups.leave')}</Text>
            </Pressable>
          )}
        </>
      )}

      {!isOwner && (
        <Pressable onPress={() => promptReport('group', groupId)} accessibilityRole="button" style={styles.textBtn}>
          <Text style={{ color: t.textMuted }}>{tr('groups.reportGroup')}</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { padding: space.lg, gap: space.sm, paddingBottom: space.xl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 26, fontWeight: '700' },
  meta: { fontSize: 13 },
  hint: { fontSize: 12 },
  section: { fontSize: 16, fontWeight: '600', marginTop: space.md },
  primary: { borderRadius: radius.pill, paddingVertical: 14, alignItems: 'center', marginTop: space.md },
  primaryText: { fontSize: 16, fontWeight: '600' },
  secondary: { borderWidth: 1, borderRadius: radius.pill, paddingVertical: 12, alignItems: 'center', marginTop: space.md },
  row: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: radius.md, padding: space.md },
  textBtn: { alignItems: 'center', paddingVertical: space.md },
});
