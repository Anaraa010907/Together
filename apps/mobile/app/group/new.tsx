import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { lightTheme as t, radius, space } from '@together/ui/tokens';
import { createGroup } from '../../lib/groups';
import { courseErrorKey, createCourse } from '../../lib/teaching';

// Group үүсгэх: нэр, тайлбар, нийтийн/хаалттай, нэгдэх журам.
export default function NewGroup() {
  // ?course=1 → багшийн сургалт group
  const { course } = useLocalSearchParams<{ course?: string }>();
  const isCourse = course === '1';
  const { t: tr } = useTranslation();
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [needApproval, setNeedApproval] = useState(false);
  const [busy, setBusy] = useState(false);

  const onCreate = async () => {
    const n = name.trim();
    if (n.length < 2 || n.length > 60) return Alert.alert(tr('common.error'), tr('groups.nameInvalid'));

    setBusy(true);
    try {
      const id = isCourse
        ? await createCourse({ name: n, description: description.trim() || undefined, isPrivate })
        : await createGroup({
            name: n,
            description: description.trim() || undefined,
            visibility: isPrivate ? 'private' : 'public',
            joinPolicy: needApproval || isPrivate ? 'approval' : 'open',
          });
      router.replace(`/group/${id}` as never);
    } catch (e: any) {
      const msg = String(e.message ?? e);
      const key = msg.includes('slug_taken') ? 'groups.slugTaken' : courseErrorKey(e);
      Alert.alert(tr('common.error'), key ? tr(key) : msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: t.background }]}>
      <Text style={[styles.title, { color: t.text }]}>{isCourse ? tr('courses.createTitle') : tr('groups.createTitle')}</Text>

      <Text style={[styles.label, { color: t.textMuted }]}>{tr('groups.name')}</Text>
      <TextInput
        style={[styles.input, { borderColor: t.border, backgroundColor: t.surface, color: t.text }]}
        value={name}
        onChangeText={setName}
        maxLength={60}
        accessibilityLabel={tr('groups.name')}
      />

      <Text style={[styles.label, { color: t.textMuted }]}>{tr('groups.description')}</Text>
      <TextInput
        style={[styles.input, styles.multiline, { borderColor: t.border, backgroundColor: t.surface, color: t.text }]}
        value={description}
        onChangeText={setDescription}
        multiline
        maxLength={500}
        accessibilityLabel={tr('groups.description')}
      />

      <View style={styles.row}>
        <Text style={[styles.rowText, { color: t.text }]}>{tr('groups.private')}</Text>
        <Switch value={isPrivate} onValueChange={setIsPrivate} />
      </View>
      {!isCourse && (
        <View style={styles.row}>
          <Text style={[styles.rowText, { color: t.text }]}>{tr('groups.approval')}</Text>
          <Switch value={needApproval || isPrivate} disabled={isPrivate} onValueChange={setNeedApproval} />
        </View>
      )}
      <Text style={[styles.hint, { color: t.textMuted }]}>{tr('groups.privateHint')}</Text>
      {isCourse && <Text style={[styles.hint, { color: t.textMuted }]}>{tr('courses.createHint')}</Text>}

      <Pressable
        style={[styles.primary, { backgroundColor: t.accent, opacity: busy ? 0.6 : 1 }]}
        disabled={busy}
        onPress={onCreate}
        accessibilityRole="button"
      >
        {busy ? (
          <ActivityIndicator color={t.onAccent} />
        ) : (
          <Text style={[styles.primaryText, { color: t.onAccent }]}>{tr('groups.createAction')}</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: space.lg, gap: space.sm, paddingTop: 64 },
  title: { fontSize: 24, fontWeight: '700', marginBottom: space.sm },
  label: { fontSize: 13, marginTop: space.sm },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: 12, fontSize: 16 },
  multiline: { minHeight: 90, textAlignVertical: 'top' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: space.sm },
  rowText: { fontSize: 16 },
  hint: { fontSize: 12 },
  primary: { borderRadius: radius.pill, paddingVertical: 16, alignItems: 'center', marginTop: space.lg },
  primaryText: { fontSize: 16, fontWeight: '600' },
});
