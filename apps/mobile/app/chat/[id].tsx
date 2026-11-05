import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { font, gradients, lightTheme as t, palette } from '@together/ui/tokens';
import { Avatar } from '../../components/Avatar';
import { Backdrop } from '../../components/Backdrop';
import { useSession } from '../../lib/session';
import { fetchBlockedIds } from '../../lib/account';
import { promptMemberActions, promptReport } from '../../lib/moderation';
import { supabase } from '../../lib/supabase';
import {
  chatErrorKey,
  clockTime,
  deleteMessage,
  fetchConversationInfo,
  fetchMessages,
  markRead,
  sendMessage,
  subscribeMessages,
  type ConversationInfo,
  type Message,
} from '../../lib/chat';

type Person = { name: string; avatar: string | null };

// Харилцаа: мессежүүд шууд (realtime) ирнэ, өөрийн мессеж баруун талд градиент бөмбөлгөөр.
export default function ChatRoom() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const conversationId = String(id);
  const { t: tr } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const myId = session?.user.id ?? '';
  const [info, setInfo] = useState<ConversationInfo | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [people, setPeople] = useState<Record<string, Person>>({});
  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [older, setOlder] = useState(false);
  const [done, setDone] = useState(false);
  const [sending, setSending] = useState(false);
  const peopleRef = useRef(people);
  peopleRef.current = people;

  const remember = (list: Message[]) => {
    const add: Record<string, Person> = {};
    for (const m of list) if (m.sender_name) add[m.sender_id] = { name: m.sender_name, avatar: m.sender_avatar ?? null };
    if (Object.keys(add).length) setPeople((p) => ({ ...p, ...add }));
  };

  // Realtime-аар ирсэн мессежийн илгээгчийг танихгүй бол нэг удаа татна.
  const ensurePerson = async (uid: string) => {
    if (peopleRef.current[uid]) return;
    const { data } = await supabase.from('profiles').select('display_name, avatar_url').eq('id', uid).maybeSingle();
    if (data) setPeople((p) => ({ ...p, [uid]: { name: data.display_name, avatar: data.avatar_url } }));
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [i, ms, b] = await Promise.all([
          fetchConversationInfo(conversationId, myId),
          fetchMessages(conversationId),
          fetchBlockedIds().catch(() => new Set<string>()),
        ]);
        if (!alive) return;
        setInfo(i);
        setMessages(ms);
        setBlocked(b);
        remember(ms);
        setDone(ms.length < 40);
        markRead(conversationId).catch(() => {});
      } catch (e: any) {
        Alert.alert(tr('common.error'), String(e?.message ?? e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    const unsub = subscribeMessages(conversationId, (m) => {
      setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [m, ...prev]));
      ensurePerson(m.sender_id);
      if (m.sender_id !== myId) markRead(conversationId).catch(() => {});
    });
    return () => {
      alive = false;
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, myId]);

  const loadOlder = async () => {
    if (older || done || messages.length === 0) return;
    setOlder(true);
    try {
      const more = await fetchMessages(conversationId, messages[messages.length - 1].created_at);
      remember(more);
      setMessages((prev) => [...prev, ...more.filter((m) => !prev.some((x) => x.id === m.id))]);
      if (more.length < 40) setDone(true);
    } catch {
      // дараа дахин оролдоно
    } finally {
      setOlder(false);
    }
  };

  const onSend = async () => {
    const body = text.trim();
    if (!body || sending) return;
    if (body.length > 2000) {
      Alert.alert(tr('common.error'), tr('chat.tooLong'));
      return;
    }
    const tempId = `tmp-${Date.now()}`;
    const temp: Message = { id: tempId, conversation_id: conversationId, sender_id: myId, body, created_at: new Date().toISOString() };
    setMessages((prev) => [temp, ...prev]);
    setText('');
    setSending(true);
    try {
      const saved = await sendMessage(conversationId, myId, body);
      // Realtime түрүүлж ирсэн байж магадгүй тул давхардлыг арилгана.
      setMessages((prev) => {
        const without = prev.filter((m) => m.id !== tempId);
        return without.some((m) => m.id === saved.id) ? without : [saved, ...without];
      });
    } catch (e) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setText(body);
      const key = chatErrorKey(e);
      Alert.alert(tr('common.error'), key ? tr(key) : String((e as any)?.message ?? e));
    } finally {
      setSending(false);
    }
  };

  const onLongPress = (m: Message) => {
    if (m.id.startsWith('tmp-')) return;
    if (m.sender_id === myId) {
      Alert.alert(tr('chat.deleteTitle'), undefined, [
        { text: tr('common.cancel'), style: 'cancel' },
        {
          text: tr('feed.delete'),
          style: 'destructive',
          onPress: () =>
            deleteMessage(m.id)
              .then(() => setMessages((prev) => prev.filter((x) => x.id !== m.id)))
              .catch((e) => Alert.alert(tr('common.error'), String(e?.message ?? e))),
        },
      ]);
    } else {
      promptReport('message', m.id);
    }
  };

  const openHeader = () => {
    if (!info) return;
    if (info.kind === 'group' && info.group_id) router.push(`/group/${info.group_id}` as never);
    else if (info.other_id) router.push(`/user/${info.other_id}` as never);
  };

  const visible = messages.filter((m) => !blocked.has(m.sender_id));
  const isGroup = info?.kind === 'group';

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <Stack.Screen
        options={{
          headerTitle: () => (
            <Pressable onPress={openHeader} accessibilityRole="button" style={styles.header}>
              {isGroup ? (
                <LinearGradient colors={gradients.violet} style={styles.headerGroup}>
                  <Ionicons name="people" size={16} color="#FFFFFF" />
                </LinearGradient>
              ) : (
                <Avatar name={info?.title} url={info?.avatar_url} size={34} />
              )}
              <View>
                <Text style={styles.headerTitle} numberOfLines={1}>
                  {info?.title ?? ''}
                </Text>
                <Text style={styles.headerSub}>{isGroup ? tr('chat.groupChat') : tr('chat.direct')}</Text>
              </View>
            </Pressable>
          ),
          headerTitleAlign: 'left',
          headerRight: () =>
            info?.kind === 'direct' && info.other_id ? (
              <Pressable
                onPress={() => promptMemberActions(info.title, info.other_id!, () => router.back())}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={tr('common.more')}
              >
                <Ionicons name="ellipsis-horizontal" size={22} color={t.text} />
              </Pressable>
            ) : null,
        }}
      />
      <Backdrop />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
        {loading ? (
          <ActivityIndicator color={t.accent} style={{ marginTop: 40 }} />
        ) : (
          <FlatList
            data={visible}
            inverted
            keyExtractor={(m) => m.id}
            contentContainerStyle={styles.list}
            onEndReached={loadOlder}
            onEndReachedThreshold={0.3}
            ListFooterComponent={older ? <ActivityIndicator color={t.accent} style={{ marginVertical: 12 }} /> : null}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={{ fontSize: 36 }}>👋</Text>
                <Text style={styles.emptyText}>{tr('chat.sayHi')}</Text>
              </View>
            }
            renderItem={({ item, index }) => {
              const mine = item.sender_id === myId;
              // inverted: index+1 нь өмнөх (дээрх) мессеж.
              const prev = visible[index + 1];
              const next = visible[index - 1];
              const firstOfRun = !prev || prev.sender_id !== item.sender_id;
              const lastOfRun = !next || next.sender_id !== item.sender_id;
              const person = people[item.sender_id];
              return (
                <Bubble
                  message={item}
                  mine={mine}
                  showName={isGroup && !mine && firstOfRun}
                  showAvatar={isGroup && !mine && lastOfRun}
                  showTime={lastOfRun}
                  name={person?.name ?? item.sender_name ?? ''}
                  avatar={person?.avatar ?? item.sender_avatar ?? null}
                  pending={item.id.startsWith('tmp-')}
                  onLongPress={() => onLongPress(item)}
                  onAvatar={() => router.push(`/user/${item.sender_id}` as never)}
                  indent={isGroup && !mine}
                />
              );
            }}
          />
        )}

        <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={tr('chat.placeholder')}
            placeholderTextColor={t.textFaint}
            style={styles.input}
            multiline
            maxLength={2000}
            accessibilityLabel={tr('chat.placeholder')}
          />
          <Pressable onPress={onSend} disabled={!text.trim()} accessibilityRole="button" accessibilityLabel={tr('chat.send')}>
            <LinearGradient
              colors={text.trim() ? gradients.violet : ['rgba(255,255,255,0.10)', 'rgba(255,255,255,0.06)']}
              style={styles.send}
            >
              <Ionicons name="send" size={18} color="#FFFFFF" style={{ marginLeft: 2 }} />
            </LinearGradient>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function Bubble({
  message,
  mine,
  showName,
  showAvatar,
  showTime,
  name,
  avatar,
  pending,
  onLongPress,
  onAvatar,
  indent,
}: {
  message: Message;
  mine: boolean;
  showName: boolean;
  showAvatar: boolean;
  showTime: boolean;
  name: string;
  avatar: string | null;
  pending: boolean;
  onLongPress: () => void;
  onAvatar: () => void;
  indent: boolean;
}) {
  // Шинэ мессеж доороос "pop" хийж гарна.
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(v, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 8 }).start();
  }, [v]);
  const anim = {
    opacity: v,
    transform: [
      { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) },
      { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
    ],
  };
  return (
    <Animated.View style={[styles.bubbleRow, mine ? styles.rowMine : styles.rowOther, anim]}>
      {indent && (
        <View style={{ width: 30 }}>
          {showAvatar && (
            <Pressable onPress={onAvatar} accessibilityRole="button" accessibilityLabel={name}>
              <Avatar name={name} url={avatar} size={28} />
            </Pressable>
          )}
        </View>
      )}
      <View style={{ maxWidth: '78%', alignItems: mine ? 'flex-end' : 'flex-start', gap: 3 }}>
        {showName && <Text style={styles.name}>{name}</Text>}
        <Pressable onLongPress={onLongPress} delayLongPress={300}>
          {mine ? (
            <LinearGradient
              colors={['#A855F7', '#7C3AED']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.bubble, styles.bubbleMine, pending && { opacity: 0.6 }]}
            >
              <Text style={styles.textMine}>{message.body}</Text>
            </LinearGradient>
          ) : (
            <View style={[styles.bubble, styles.bubbleOther]}>
              <Text style={styles.textOther}>{message.body}</Text>
            </View>
          )}
        </Pressable>
        {showTime && (
          <Text style={styles.time}>
            {pending ? '…' : clockTime(message.created_at)}
            {mine && !pending ? '  ✓' : ''}
          </Text>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, maxWidth: 240 },
  headerGroup: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: font.bold, fontSize: 16, color: t.text, maxWidth: 190 },
  headerSub: { fontFamily: font.medium, fontSize: 11, color: t.textMuted },
  list: { paddingHorizontal: 14, paddingVertical: 12, gap: 2 },
  empty: { alignItems: 'center', gap: 8, transform: [{ scaleY: -1 }], marginTop: 60 },
  emptyText: { fontFamily: font.medium, fontSize: 14, color: t.textMuted },
  bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginVertical: 2 },
  rowMine: { justifyContent: 'flex-end' },
  rowOther: { justifyContent: 'flex-start' },
  name: { fontFamily: font.semibold, fontSize: 12, color: palette.lilac, marginLeft: 4 },
  bubble: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 20 },
  bubbleMine: { borderBottomRightRadius: 6 },
  bubbleOther: { backgroundColor: 'rgba(255,255,255,0.09)', borderWidth: 1, borderColor: t.border, borderBottomLeftRadius: 6 },
  textMine: { fontFamily: font.medium, fontSize: 15, color: '#FFFFFF', lineHeight: 21 },
  textOther: { fontFamily: font.medium, fontSize: 15, color: t.text, lineHeight: 21 },
  time: { fontFamily: font.medium, fontSize: 10, color: t.textFaint, marginHorizontal: 6, marginBottom: 4 },
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: 12, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: t.borderSoft, backgroundColor: 'rgba(12,10,28,0.92)',
  },
  input: {
    flex: 1, minHeight: 46, maxHeight: 130, borderRadius: 23, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12,
    backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, fontFamily: font.medium, fontSize: 15, color: t.text,
  },
  send: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
});
