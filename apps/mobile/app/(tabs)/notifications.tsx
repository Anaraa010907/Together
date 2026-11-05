import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { font, lightTheme as t, palette } from '@together/ui/tokens';
import { Avatar } from '../../components/Avatar';
import { Backdrop } from '../../components/Backdrop';
import { FadeIn, PressableScale } from '../../components/motion';
import { TAB_BAR_SPACE } from '../../components/TabBar';
import { timeAgo } from '../../lib/time';
import { clearNotifications, fetchNotifications, markAllRead, targetOf, type AppNotification } from '../../lib/notifications';

// Мэдэгдлүүд: нээхэд бүгд уншсан болно. Дарахад холбогдох хуудас руу.
export default function Notifications() {
  const { t: tr } = useTranslation();
  const router = useRouter();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems(await fetchNotifications());
      await markAllRead();
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

  const onClear = () =>
    Alert.alert(tr('notifications.clearTitle'), undefined, [
      { text: tr('common.cancel'), style: 'cancel' },
      {
        text: tr('notifications.clear'),
        style: 'destructive',
        onPress: () =>
          clearNotifications()
            .then(() => setItems([]))
            .catch((e) => Alert.alert(tr('common.error'), String(e?.message ?? e))),
      },
    ]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={t.accent} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <Backdrop />
      <FlatList
        contentContainerStyle={styles.list}
        data={items}
        keyExtractor={(n) => n.id}
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
        ListHeaderComponent={
          <FadeIn index={0}>
            <View style={styles.header}>
              <View style={{ width: 70 }} />
              <Text style={styles.title}>{tr('notifications.title')}</Text>
              <View style={{ width: 70, alignItems: 'flex-end' }}>
                {items.length > 0 && (
                  <Pressable onPress={onClear} accessibilityRole="button" hitSlop={8}>
                    <Text style={styles.clear}>{tr('notifications.clear')}</Text>
                  </Pressable>
                )}
              </View>
            </View>
          </FadeIn>
        }
        ListEmptyComponent={
          <FadeIn index={1}>
            <View style={styles.emptyBox}>
              <LinearGradient colors={['rgba(139,92,246,0.35)', 'rgba(236,72,153,0.2)']} style={styles.emptyIcon}>
                <Ionicons name="notifications-outline" size={34} color="#FFFFFF" />
              </LinearGradient>
              <Text style={styles.empty}>{tr('notifications.empty')}</Text>
            </View>
          </FadeIn>
        }
        renderItem={({ item, index }) => {
          const target = targetOf(item);
          const [icon, colors] = TYPE_ICON[item.type] ?? TYPE_ICON.comment;
          return (
            <FadeIn index={index + 1}>
              <PressableScale
                onPress={() => target && router.push(target as never)}
                accessibilityRole="button"
                style={[styles.row, !item.read_at && styles.unread]}
              >
                <View>
                  <Avatar name={item.actor_name} url={item.actor_avatar} size={46} />
                  <LinearGradient colors={colors} style={styles.typeBadge}>
                    <Ionicons name={icon} size={11} color="#FFFFFF" />
                  </LinearGradient>
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={styles.text}>
                    {tr(`notifications.type.${item.type}`, {
                      name: item.actor_name,
                      group: item.data?.group ?? '',
                      title: item.data?.title ?? '',
                    })}
                  </Text>
                  {!!item.data?.text && (
                    <Text style={styles.meta} numberOfLines={1}>
                      “{item.data.text}”
                    </Text>
                  )}
                  <Text style={styles.meta}>{timeAgo(item.created_at)}</Text>
                </View>
                {!item.read_at && <View style={styles.dot} />}
              </PressableScale>
            </FadeIn>
          );
        }}
      />
    </View>
  );
}

const TYPE_ICON: Record<string, [keyof typeof Ionicons.glyphMap, readonly [string, string]]> = {
  join_request: ['person-add', ['#A855F7', '#7C3AED']],
  join_approved: ['checkmark', ['#34D399', '#0EA5E9']],
  comment: ['chatbubble', ['#8B5CF6', '#EC4899']],
  helpful: ['heart', ['#FB7185', '#EC4899']],
  proposal: ['bulb', ['#FBBF24', '#FF8A3D']],
  session: ['calendar', ['#0EA5E9', '#8B5CF6']],
  lesson: ['school', ['#FF8A3D', '#EC4899']],
  follow: ['person', ['#EC4899', '#8B5CF6']],
};

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.background },
  list: { padding: 20, paddingTop: 58, gap: 10, paddingBottom: TAB_BAR_SPACE },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  title: { fontFamily: font.extrabold, fontSize: 20, color: t.text },
  clear: { fontFamily: font.semibold, fontSize: 14, color: palette.lilac },
  emptyBox: { alignItems: 'center', gap: 14, marginTop: 60 },
  emptyIcon: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center' },
  empty: { fontFamily: font.medium, fontSize: 15, color: t.textMuted, textAlign: 'center' },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 20,
    backgroundColor: t.surface, borderWidth: 1, borderColor: t.border,
  },
  unread: { borderColor: 'rgba(139,92,246,0.55)', backgroundColor: 'rgba(139,92,246,0.12)' },
  typeBadge: {
    position: 'absolute', right: -3, bottom: -3, width: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: t.background,
  },
  text: { fontFamily: font.semibold, fontSize: 15, color: t.text, lineHeight: 20 },
  meta: { fontFamily: font.medium, fontSize: 13, color: t.textMuted },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: palette.pink },
});
