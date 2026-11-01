import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { lightTheme as t } from '@together/ui/tokens';
import { Body, Button, Caption, Chip, H1, Screen, Steps } from '../components/ui';
import { useSession } from '../lib/session';
import { categoryName, fetchCategories, fetchMyInterests, setInterests, type Category } from '../lib/interests';

// Onboarding 3-р алхам (эсвэл Профайл → Сонирхол засах: ?edit=1).
export default function Interests() {
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const isEdit = edit === '1';
  const { t: tr } = useTranslation();
  const router = useRouter();
  const { refreshProfile } = useSession();
  const [categories, setCategories] = useState<Category[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([fetchCategories(), fetchMyInterests().catch(() => [] as string[])])
      .then(([cats, mine]) => {
        setCategories(cats);
        setSelected(new Set(mine));
      })
      .catch((e) => Alert.alert(tr('common.error'), String(e?.message ?? e)))
      .finally(() => setLoading(false));
  }, [tr]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const save = async (ids: string[]) => {
    setBusy(true);
    try {
      await setInterests(ids);
      await refreshProfile();
      if (isEdit) router.back();
      else router.replace('/suggested' as never);
    } catch (e: any) {
      Alert.alert(tr('common.error'), String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.background }}>
        <ActivityIndicator color={t.accent} />
      </View>
    );
  }

  return (
    <Screen>
      {!isEdit && <Steps total={3} current={3} />}
      <H1>{tr('interests.title')}</H1>
      <Body muted>{tr('interests.subtitle')}</Body>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 }}>
        {categories.map((c) => (
          <Chip key={c.id} icon={c.icon} label={categoryName(c)} selected={selected.has(c.id)} onPress={() => toggle(c.id)} />
        ))}
      </View>
      <Caption>{tr('interests.selected', { n: selected.size })}</Caption>

      <View style={{ gap: 10, marginTop: 8 }}>
        <Button
          label={isEdit ? tr('settings.save') : tr('profile.save')}
          onPress={() => save([...selected])}
          loading={busy}
          disabled={!isEdit && selected.size === 0}
        />
        {!isEdit && <Button label={tr('interests.skip')} variant="ghost" onPress={() => save([])} disabled={busy} />}
      </View>
    </Screen>
  );
}
