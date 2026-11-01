import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useTranslation } from 'react-i18next';
import { font, lightTheme as t, radius, space } from '@together/ui/tokens';
import { useSession } from '../../lib/session';
import { fetchBlockedIds } from '../../lib/account';
import { fetchMyMembership } from '../../lib/groups';
import { formatDateTime } from '../../lib/time';
import { cancelSessionReminder, scheduleSessionReminder } from '../../lib/reminders';
import {
  cancelSession,
  fetchAttendees,
  fetchSession,
  rsvpSession,
  sessionErrorKey,
  startsSoon,
  statusOf,
  updateSession,
  type Attendee,
  type Session,
} from '../../lib/sessions';

// Сешн: цаг, линк, "Очно", оролцогчид; хөтлөгч / эзэн тэмдэглэл бичих, цуцлах, feed-д хуваалцах.
export default function SessionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const sessionId = String(id);
  const { t: tr } = useTranslation();
  const router = useRouter();
  const { session: auth } = useSession();
  const myId = auth?.user.id;

  const [s, setS] = useState<Session | null>(null);
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  const [isOwner, setIsOwner] = useState(false);
  const [notes, setNotes] = useState('');
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [data, a, b] = await Promise.all([
        fetchSession(sessionId),
        fetchAttendees(sessionId),
        fetchBlockedIds().catch(() => new Set<string>()),
      ]);
      setS(data);
      setAttendees(a);
      setBlocked(b);
      setNotes(data?.notes ?? '');
      setUrl(data?.meeting_url ?? '');
      if (data) {
        const m = await fetchMyMembership(data.group_id);
        setIsOwner(m?.role === 'owner' && m?.status === 'active');
      }
    } catch (e: any) {
      Alert.alert(tr('common.error'), String(e.message ?? e));
    } finally {
      setLoading(false);
    }
  }, [sessionId, tr]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const fail = (e: any) => {
    const key = sessionErrorKey(e);
    Alert.alert(tr('common.error'), key ? tr(key) : String(e?.message ?? e));
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: t.background }]}>
        <ActivityIndicator color={t.accent} />
      </View>
    );
  }
  if (!s) {
    return (
      <View style={[styles.center, { backgroundColor: t.background }]}>
        <Text style={{ color: t.textMuted }}>{tr('sessions.errors.session_not_found')}</Text>
      </View>
    );
  }

  const status = statusOf(s);
  const going = attendees.some((a) => a.user_id === myId);
  const canManage = s.host_id === myId || isOwner;
  const linkHot = status === 'live' || startsSoon(s);

  const onRsvp = async () => {
    setBusy(true);
    try {
      await rsvpSession(s.id, !going);
      if (going) {
        await cancelSessionReminder(s.id);
      } else {
        const scheduled = await scheduleSessionReminder(s.id, s.title, s.starts_at).catch(() => false);
        if (scheduled) Alert.alert(tr('sessions.reminderSet'));
      }
      setAttendees(await fetchAttendees(s.id));
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const onSave = async () => {
    const link = url.trim();
    if (link && !/^https:\/\/\S+$/i.test(link)) return Alert.alert(tr('common.error'), tr('sessions.errors.invalid_url'));
    setBusy(true);
    try {
      await updateSession(s.id, notes, link);
      Alert.alert(tr('settings.saved'));
      await load();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const onCancel = () =>
    Alert.alert(tr('sessions.cancelTitle'), tr('sessions.cancelConfirm'), [
      { text: tr('common.cancel'), style: 'cancel' },
      {
        text: tr('sessions.cancelSession'),
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await cancelSession(s.id);
            await cancelSessionReminder(s.id);
            await load();
          } catch (e) {
            fail(e);
          } finally {
            setBusy(false);
          }
        },
      },
    ]);

  // Тэмдэглэлийг feed-ийн "Хуваалцах" пост болгож нээнэ.
  const onShareNotes = () => {
    const body = `${s.title} — ${tr('sessions.notes')}\n\n${notes.trim()}`;
    router.push(`/post/new?groupId=${s.group_id}&body=${encodeURIComponent(body.slice(0, 4000))}` as never);
  };

  const visible = attendees.filter((a) => !blocked.has(a.user_id));

  return (
    <ScrollView style={{ backgroundColor: t.background }} contentContainerStyle={styles.screen}>
      <Text style={[styles.badge, { color: status === 'live' ? t.text : t.textMuted }]}>
        {tr(`sessions.status.${status}`)}
      </Text>
      <Text style={[styles.title, { color: t.text }]}>{s.title}</Text>
      <Text style={{ color: t.text, fontFamily: font.semibold }}>
        🗓 {formatDateTime(s.starts_at)} · {tr('sessions.minutes', { n: s.duration_min })}
      </Text>
      <Text style={{ color: t.textMuted }}>{tr('sessions.hostedBy', { name: s.host_name })}</Text>
      {!!s.description && <Text style={{ color: t.text, lineHeight: 21 }}>{s.description}</Text>}

      {!!s.meeting_url && (status === 'upcoming' || status === 'live') && (
        <Pressable
          onPress={() => WebBrowser.openBrowserAsync(s.meeting_url!)}
          accessibilityRole="link"
          style={[
            styles.primary,
            linkHot ? { backgroundColor: t.accent } : { borderWidth: 1, borderColor: t.border },
          ]}
        >
          <Text style={[styles.primaryText, { color: linkHot ? t.onAccent : t.text }]}>▶ {tr('sessions.openLink')}</Text>
        </Pressable>
      )}

      {(status === 'upcoming' || status === 'live') && (
        <Pressable
          onPress={onRsvp}
          disabled={busy}
          accessibilityRole="button"
          accessibilityState={{ selected: going }}
          style={[
            styles.primary,
            { backgroundColor: going ? t.success : t.surface, borderWidth: 1, borderColor: t.border, opacity: busy ? 0.6 : 1 },
          ]}
        >
          <Text style={[styles.primaryText, { color: t.text }]}>{going ? tr('sessions.going') : tr('sessions.rsvp')}</Text>
        </Pressable>
      )}

      <Text style={[styles.section, { color: t.text }]}>
        {tr('sessions.attendees')} ({visible.length})
      </Text>
      <Text style={{ color: t.textMuted }}>{visible.map((a) => a.display_name).join(', ') || '—'}</Text>

      <Text style={[styles.section, { color: t.text }]}>{tr('sessions.notes')}</Text>
      {canManage && status !== 'cancelled' ? (
        <>
          <TextInput
            style={[styles.input, styles.multiline, { borderColor: t.border, backgroundColor: t.surface, color: t.text }]}
            value={notes}
            onChangeText={setNotes}
            multiline
            maxLength={4000}
            placeholder={tr('sessions.notesPlaceholder')}
            placeholderTextColor={t.textMuted}
            accessibilityLabel={tr('sessions.notes')}
          />
          <TextInput
            style={[styles.input, { borderColor: t.border, backgroundColor: t.surface, color: t.text }]}
            value={url}
            onChangeText={setUrl}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            placeholder={tr('sessions.link')}
            placeholderTextColor={t.textMuted}
            accessibilityLabel={tr('sessions.link')}
          />
          <View style={styles.row}>
            <Pressable
              style={[styles.half, { backgroundColor: t.accent, opacity: busy ? 0.6 : 1 }]}
              onPress={onSave}
              disabled={busy}
              accessibilityRole="button"
            >
              <Text style={{ color: t.onAccent, fontFamily: font.semibold }}>{tr('settings.save')}</Text>
            </Pressable>
            <Pressable
              style={[styles.half, { borderWidth: 1, borderColor: t.border, opacity: notes.trim() ? 1 : 0.5 }]}
              onPress={onShareNotes}
              disabled={!notes.trim()}
              accessibilityRole="button"
            >
              <Text style={{ color: t.text, fontFamily: font.semibold }}>{tr('sessions.shareNotes')}</Text>
            </Pressable>
          </View>
        </>
      ) : (
        <Text style={{ color: s.notes ? t.text : t.textMuted, lineHeight: 21 }}>{s.notes || tr('sessions.noNotes')}</Text>
      )}

      {canManage && (status === 'upcoming' || status === 'live') && (
        <Pressable onPress={onCancel} disabled={busy} accessibilityRole="button" style={styles.textBtn}>
          <Text style={{ color: t.warning }}>{tr('sessions.cancelSession')}</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  screen: { padding: space.lg, gap: space.sm, paddingBottom: space.xl },
  badge: { fontSize: 12, fontFamily: font.bold, textTransform: 'uppercase' },
  title: { fontSize: 26, fontFamily: font.bold },
  section: { fontSize: 16, fontFamily: font.semibold, marginTop: space.lg },
  primary: { borderRadius: radius.pill, paddingVertical: 14, alignItems: 'center', marginTop: space.sm },
  primaryText: { fontSize: 16, fontFamily: font.semibold },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: 12, fontSize: 15 },
  multiline: { minHeight: 120, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: space.sm },
  half: { flex: 1, borderRadius: radius.pill, paddingVertical: 12, alignItems: 'center' },
  textBtn: { alignItems: 'center', paddingVertical: space.md },
});
