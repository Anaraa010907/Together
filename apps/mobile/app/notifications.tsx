import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { font, lightTheme as t } from '@together/ui/tokens';
import { Avatar } from '../components/Avatar';
import { timeAgo } from '../lib/time';
import { clearNotifications, fetchNotifications, markAllRead, targetOf, type AppNotification } from '../lib/notifications';

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
    <FlatList
      style={{ backgroundColor: t.background }}
      contentContainerStyle={styles.list}
      data={items}
      keyExtractor={(n) => n.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.title}>{tr('notifications.title')}</Text>
          {items.length > 0 && (
            <Pressable onPress={onClear} accessibilityRole="button" hitSlop={8}>
              <Text style={styles.clear}>{tr('notifications.clear')}</Text>
            </Pressable>
          )}
        </View>
      }
      ListEmptyComponent={<Text style={styles.empty}>{tr('notifications.empty')}</Text>}
      renderItem={({ item }) => {
        const target = targetOf(item);
        return (
          <Pressable
            onPress={() => target && router.push(target as never)}
            accessibilityRole="button"
            style={[styles.row, !item.read_at && styles.unread]}
          >
            <Avatar name={item.actor_name} url={item.actor_avatar} size={42} />
            <View style={{ flex: 1, gap: 2 }}>
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
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.background },
  list: { padding: 20, gap: 8, paddingBottom: 32 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  title: { fontFamily: font.extrabold, fontSize: 26, color: t.text },
  clear: { fontFamily: font.semibold, fontSize: 14, color: '#5B6573' },
  empty: { fontFamily: font.medium, fontSize: 15, color: '#5B6573', textAlign: 'center', marginTop: 40 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16,
    backgroundColor: t.surface, borderWidth: 1, borderColor: '#EFEAE0',
  },
  unread: { borderColor: t.accent, backgroundColor: '#FBF7EE' },
  text: { fontFamily: font.semibold, fontSize: 15, color: t.text, lineHeight: 20 },
  meta: { fontFamily: font.medium, fontSize: 13, color: '#5B6573' },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: t.accent },
});
