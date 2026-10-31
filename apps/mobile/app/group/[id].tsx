import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { lightTheme as t, radius, space } from '@together/ui/tokens';
import {
  fetchGroup,
  fetchMembers,
  fetchMyMembership,
  joinGroup,
  leaveGroup,
  reviewJoinRequest,
  type GroupSummary,
  type MemberRow,
} from '../../lib/groups';

// Group дэлгэрэнгүй: гишүүд, нэгдэх/гарах, эзэнд хүсэлтүүд.
export default function GroupDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t: tr } = useTranslation();
  const router = useRouter();

  const [group, setGroup] = useState<GroupSummary | null>(null);
  const [membership, setMembership] = useState<{ role: string; status: string } | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const g = await fetchGroup(String(id));
      setGroup(g);
      const m = await fetchMyMembership(String(id));
      setMembership(m);
      // Гишүүдийн жагсаалт зөвхөн харах эрхтэй үед (RLS шалгана).
      setMembers(await fetchMembers(String(id)).catch(() => []));
    } catch (e: any) {
      Alert.alert(tr('common.error'), String(e.message ?? e));
    } finally {
      setLoading(false);
    }
  }, [id, tr]);

  useEffect(() => {
    load();
  }, [load]);

  const isActive = membership?.status === 'active';
  const isOwner = membership?.role === 'owner' && isActive;
  const isPending = membership?.status === 'pending';

  const onJoin = async () => {
    setBusy(true);
    try {
      const status = await joinGroup(String(id));
      Alert.alert(
        tr('groups.joinedTitle'),
        status === 'active' ? tr('groups.joinedNow') : tr('groups.joinPending'),
      );
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
            await leaveGroup(String(id));
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
      await reviewJoinRequest(String(id), userId, approve);
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

  if (!group) {
    return (
      <View style={[styles.center, { backgroundColor: t.background }]}>
        <Text style={{ color: t.textMuted }}>{tr('groups.notFound')}</Text>
      </View>
    );
  }

  const pending = members.filter((m) => m.status === 'pending');
  const active = members.filter((m) => m.status === 'active');

  return (
    <View style={[styles.screen, { backgroundColor: t.background }]}>
      <Text style={[styles.title, { color: t.text }]}>{group.name}</Text>
      {!!group.description && <Text style={{ color: t.textMuted }}>{group.description}</Text>}
      <Text style={[styles.meta, { color: t.textMuted }]}>
        {group.visibility === 'private' ? tr('groups.private') : tr('groups.public')} · {active.length} {tr('groups.members')}
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
          <FlatList
            data={active}
            keyExtractor={(m) => m.user_id}
            contentContainerStyle={{ gap: space.sm }}
            renderItem={({ item }) => (
              <View style={[styles.row, { borderColor: t.border, backgroundColor: t.surface }]}>
                <Text style={{ color: t.text, flex: 1 }}>{item.profiles?.display_name ?? '—'}</Text>
                {item.role === 'owner' && <Text style={{ color: t.textMuted, fontSize: 12 }}>{tr('groups.owner')}</Text>}
              </View>
            )}
          />
          {!isOwner && (
            <Pressable onPress={onLeave} disabled={busy} accessibilityRole="button" style={styles.leave}>
              <Text style={{ color: t.warning }}>{tr('groups.leave')}</Text>
            </Pressable>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: space.lg, gap: space.sm, paddingTop: 64 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 26, fontWeight: '700' },
  meta: { fontSize: 13 },
  section: { fontSize: 16, fontWeight: '600', marginTop: space.md },
  primary: { borderRadius: radius.pill, paddingVertical: 14, alignItems: 'center', marginTop: space.md },
  primaryText: { fontSize: 16, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: radius.md, padding: space.md },
  leave: { alignItems: 'center', paddingVertical: space.md },
});
