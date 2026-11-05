import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { font, lightTheme as t } from '@together/ui/tokens';
import { Body, Button, Field, Screen } from '../../components/ui';
import { createGoal } from '../../lib/goals';

const IDEAS = ['📚 30 мин ном унших', '🏃 5 км гүйх', '💧 2 л ус уух', '🧘 10 мин бясалгах', '🇬🇧 20 шинэ үг цээжлэх', '💻 1 цаг код бичих'];
const IDEAS_EN = ['📚 Read 30 min', '🏃 Run 5 km', '💧 Drink 2 L water', '🧘 Meditate 10 min', '🇬🇧 Learn 20 new words', '💻 Code for 1 hour'];

// Шинэ өдөр тутмын зорилго (+ товчноос).
export default function NewGoal() {
  const { t: tr, i18n } = useTranslation();
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const ideas = i18n.language === 'en' ? IDEAS_EN : IDEAS;

  const onSave = async () => {
    const v = title.trim();
    if (v.length < 1 || v.length > 120) {
      Alert.alert(tr('common.error'), tr('goals.titleInvalid'));
      return;
    }
    setBusy(true);
    try {
      await createGoal(v);
      router.back();
    } catch (e: any) {
      Alert.alert(tr('common.error'), String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen style={{ paddingTop: 110 }}>
      <Stack.Screen options={{ title: tr('create.goal') }} />
      <Body muted>{tr('goals.newHint')}</Body>
      <Field
        label={tr('goals.title')}
        value={title}
        onChangeText={setTitle}
        placeholder={tr('home.addPlaceholder')}
        maxLength={120}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={onSave}
      />
      <Text style={styles.ideasTitle}>{tr('goals.ideas')}</Text>
      <View style={styles.ideas}>
        {ideas.map((idea) => (
          <Pressable key={idea} onPress={() => setTitle(idea)} accessibilityRole="button" style={styles.idea}>
            <Text style={styles.ideaText}>{idea}</Text>
          </Pressable>
        ))}
      </View>
      <View style={{ marginTop: 8 }}>
        <Button label={tr('goals.create')} icon="add" onPress={onSave} loading={busy} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  ideasTitle: { fontFamily: font.bold, fontSize: 14, color: t.textMuted, marginTop: 4 },
  ideas: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  idea: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 13 },
  ideaText: { fontFamily: font.semibold, fontSize: 13, color: t.text },
});
