import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { font, gradients, lightTheme as t, palette } from '@together/ui/tokens';
import { Avatar } from '../components/Avatar';
import { Backdrop } from '../components/Backdrop';
import { FadeIn, PressableScale } from '../components/motion';
import { useSession } from '../lib/session';
import { chatTime, fetchConversations, subscribeInbox, type ConversationSummary } from '../lib/chat';

// Чатууд: шууд болон группын харилцаа, сүүлийн мессеж, уншаагүй тоо.
export default function Chats() {
  const { t: tr } = useTranslation();
  const router = useRouter();
  const { session } = useSession();
  const myId = session?.user.id;
  const [items, setItems] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems(await fetchConversations());
    } catch (e: any) {
      Alert.alert(tr('common.error'), String(e?.message ?? e));
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

  // Шинэ мессеж ирэхэд жагсаалтыг шинэчилнэ.
  useEffect(() => subscribeInbox(() => load()), [load]);

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <Stack.Screen
        options={{
          title: tr('chat.title'),
          headerRight: () => (
            <PressableScale onPress={() => router.push('/search' as never)} accessibilityRole="button" accessibilityLabel={tr('chat.new')} style={styles.newBtn}>
              <Ionicons name="create-outline" size={20} color={t.text} />
            </PressableScale>
          ),
        }}
      />
      <Backdrop />
      {loading ? (
        <ActivityIndicator color={t.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.list}
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
          ListEmptyComponent={
            <FadeIn index={0}>
              <View style={styles.empty}>
                <LinearGradient colors={['rgba(139,92,246,0.35)', 'rgba(236,72,153,0.2)']} style={styles.emptyIcon}>
                  <Ionicons name="chatbubbles-outline" size={34} color="#FFFFFF" />
                </LinearGradient>
                <Text style={styles.emptyTitle}>{tr('chat.emptyTitle')}</Text>
                <Text style={styles.emptyText}>{tr('chat.emptyText')}</Text>
                <PressableScale onPress={() => router.push('/search' as never)} accessibilityRole="button">
                  <LinearGradient colors={gradients.violet} style={styles.emptyBtn}>
                    <Ionicons name="search" size={16} color="#FFFFFF" />
                    <Text style={styles.emptyBtnText}>{tr('chat.findPeople')}</Text>
                  </LinearGradient>
                </PressableScale>
              </View>
            </FadeIn>
          }
          renderItem={({ item, index }) => {
            const mine = item.last_sender_id === myId;
            return (
              <FadeIn index={index}>
                <PressableScale onPress={() => router.push(`/chat/${item.id}` as never)} accessibilityRole="button" style={[styles.row, item.unread > 0 && styles.rowUnread]}>
                  {item.kind === 'group' ? (
                    <LinearGradient colors={gradients.violet} style={styles.groupAvatar}>
                      <Ionicons name="people" size={22} color="#FFFFFF" />
                    </LinearGradient>
                  ) : (
                    <Avatar name={item.title} url={item.avatar_url} size={52} />
                  )}
                  <View style={{ flex: 1, gap: 3 }}>
                    <View style={styles.titleRow}>
                      <Text style={styles.title} numberOfLines={1}>
                        {item.title ?? '—'}
                      </Text>
                      <Text style={[styles.time, item.unread > 0 && { color: palette.lilac }]}>{chatTime(item.last_at)}</Text>
                    </View>
                    <View style={styles.titleRow}>
                      <Text style={[styles.preview, item.unread > 0 && styles.previewUnread]} numberOfLines={1}>
                        {mine ? `${tr('chat.you')}: ` : ''}
                        {item.last_body}
                      </Text>
                      {item.unread > 0 && (
                        <LinearGradient colors={gradients.sunset} style={styles.badge}>
                          <Text style={styles.badgeText}>{item.unread > 99 ? '99+' : item.unread}</Text>
                        </LinearGradient>
                      )}
                    </View>
                  </View>
                </PressableScale>
              </FadeIn>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 8, paddingBottom: 40 },
  newBtn: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border,
    alignItems: 'center', justifyContent: 'center',
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 20,
    backgroundColor: t.surface, borderWidth: 1, borderColor: t.border,
  },
  rowUnread: { borderColor: 'rgba(139,92,246,0.5)', backgroundColor: 'rgba(139,92,246,0.10)' },
  groupAvatar: { width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, fontFamily: font.bold, fontSize: 15, color: t.text },
  time: { fontFamily: font.medium, fontSize: 12, color: t.textFaint },
  preview: { flex: 1, fontFamily: font.medium, fontSize: 13, color: t.textMuted },
  previewUnread: { color: t.text, fontFamily: font.semibold },
  badge: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontFamily: font.bold, fontSize: 11, color: '#FFFFFF' },
  empty: { alignItems: 'center', gap: 12, marginTop: 60, paddingHorizontal: 24 },
  emptyIcon: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontFamily: font.extrabold, fontSize: 18, color: t.text },
  emptyText: { fontFamily: font.medium, fontSize: 14, color: t.textMuted, textAlign: 'center', lineHeight: 20 },
  emptyBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingVertical: 11, paddingHorizontal: 18, marginTop: 4 },
  emptyBtnText: { fontFamily: font.bold, fontSize: 14, color: '#FFFFFF' },
});
