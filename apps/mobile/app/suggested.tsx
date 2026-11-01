import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { font, lightTheme as t } from '@together/ui/tokens';
import { Body, Button, Card, H1, Screen } from '../components/ui';
import { joinGroup } from '../lib/groups';
import { categoryName, fetchCategories, fetchSuggestedGroups, type Category, type SuggestedGroup } from '../lib/interests';

// Onboarding-ийн төгсгөл: сонирхолд тохирох группууд, шууд нэгдэх.
export default function Suggested() {
  const { t: tr } = useTranslation();
  const router = useRouter();
  const [groups, setGroups] = useState<SuggestedGroup[]>([]);
  const [cats, setCats] = useState<Record<string, Category>>({});
  const [joined, setJoined] = useState<Record<string, 'active' | 'pending'>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetchSuggestedGroups(8), fetchCategories()])
      .then(([g, c]) => {
        setGroups(g);
        setCats(Object.fromEntries(c.map((x) => [x.id, x])));
      })
      .catch(() => setGroups([]))
      .finally(() => setLoading(false));
  }, []);

  const onJoin = async (g: SuggestedGroup) => {
    setBusyId(g.id);
    try {
      const status = await joinGroup(g.id);
      setJoined((prev) => ({ ...prev, [g.id]: status }));
    } catch (e: any) {
      Alert.alert(tr('common.error'), String(e?.message ?? e));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Screen>
      <H1>{tr('suggested.title')}</H1>
      <Body muted>{tr('suggested.subtitle')}</Body>

      {loading ? (
        <ActivityIndicator color={t.accent} style={{ marginTop: 24 }} />
      ) : groups.length === 0 ? (
        <Card>
          <Body muted>{tr('suggested.none')}</Body>
        </Card>
      ) : (
        groups.map((g) => {
          const cat = g.category_id ? cats[g.category_id] : undefined;
          const state = joined[g.id];
          return (
            <Card key={g.id} style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Text style={styles.icon}>{g.kind === 'course' ? '📚' : cat?.icon ?? '👥'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={1}>
                    {g.name}
                  </Text>
                  <Text style={styles.meta}>
                    {cat ? `${categoryName(cat)} · ` : ''}
                    {tr('suggested.members', { n: g.members })}
                  </Text>
                </View>
              </View>
              {!!g.description && (
                <Text style={styles.meta} numberOfLines={2}>
                  {g.description}
                </Text>
              )}
              <Button
                label={
                  state === 'active'
                    ? tr('suggested.joined')
                    : state === 'pending'
                      ? tr('groups.pendingLabel')
                      : g.join_policy === 'approval'
                        ? tr('groups.requestJoin')
                        : tr('groups.join')
                }
                variant={state ? 'secondary' : 'primary'}
                disabled={!!state}
                loading={busyId === g.id}
                onPress={() => onJoin(g)}
              />
            </Card>
          );
        })
      )}

      <View style={{ marginTop: 8 }}>
        <Button label={tr('suggested.done')} variant="dark" onPress={() => router.replace('/home' as never)} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  icon: { fontSize: 28 },
  name: { fontFamily: font.bold, fontSize: 17, color: t.text },
  meta: { fontFamily: font.medium, fontSize: 13, color: '#5B6573', lineHeight: 18 },
});
