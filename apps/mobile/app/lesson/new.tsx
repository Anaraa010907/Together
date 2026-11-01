import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { font, lightTheme as t, radius, space } from '@together/ui/tokens';
import { addLesson } from '../../lib/teaching';

// Багш хичээл нэмэх: дараалал нь автоматаар (сүүлийнхийн дараа).
export default function NewLesson() {
  const { groupId, position } = useLocalSearchParams<{ groupId: string; position: string }>();
  const pos = Number(position) || 1;
  const { t: tr } = useTranslation();
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [video, setVideo] = useState('');
  const [busy, setBusy] = useState(false);

  const onSave = async () => {
    const name = title.trim();
    const url = video.trim();
    if (name.length < 2 || name.length > 120) return Alert.alert(tr('common.error'), tr('lessons.titleInvalid'));
    if (url && !/^https:\/\/\S+$/i.test(url)) return Alert.alert(tr('common.error'), tr('sessions.errors.invalid_url'));
    setBusy(true);
    try {
      const id = await addLesson({ groupId: String(groupId), position: pos, title: name, content: content.trim(), videoUrl: url });
      router.replace(`/lesson/${id}` as never);
    } catch (e: any) {
      const msg = String(e.message ?? e);
      Alert.alert(tr('common.error'), msg.includes('check') ? tr('lessons.limit') : msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={{ backgroundColor: t.background }} contentContainerStyle={styles.screen}>
      <Text style={[styles.title, { color: t.text }]}>{tr('lessons.newTitle', { n: pos })}</Text>

      <Text style={[styles.label, { color: t.textMuted }]}>{tr('lessons.name')}</Text>
      <TextInput
        style={[styles.input, { borderColor: t.border, backgroundColor: t.surface, color: t.text }]}
        value={title}
        onChangeText={setTitle}
        maxLength={120}
        accessibilityLabel={tr('lessons.name')}
      />

      <Text style={[styles.label, { color: t.textMuted }]}>{tr('lessons.content')}</Text>
      <TextInput
        style={[styles.input, styles.multiline, { borderColor: t.border, backgroundColor: t.surface, color: t.text }]}
        value={content}
        onChangeText={setContent}
        multiline
        maxLength={4000}
        placeholder={tr('lessons.contentPlaceholder')}
        placeholderTextColor={t.textMuted}
        accessibilityLabel={tr('lessons.content')}
      />

      <Text style={[styles.label, { color: t.textMuted }]}>{tr('lessons.video')}</Text>
      <TextInput
        style={[styles.input, { borderColor: t.border, backgroundColor: t.surface, color: t.text }]}
        value={video}
        onChangeText={setVideo}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        placeholder="https://youtube.com/…"
        placeholderTextColor={t.textMuted}
        accessibilityLabel={tr('lessons.video')}
      />
      <Text style={{ color: t.textMuted, fontSize: 12 }}>{tr('lessons.hint')}</Text>

      <Pressable
        style={[styles.primary, { backgroundColor: t.accent, opacity: busy ? 0.6 : 1 }]}
        disabled={busy}
        onPress={onSave}
        accessibilityRole="button"
      >
        {busy ? <ActivityIndicator color={t.onAccent} /> : <Text style={[styles.primaryText, { color: t.onAccent }]}>{tr('lessons.add')}</Text>}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { padding: space.lg, gap: space.sm, paddingBottom: space.xl },
  title: { fontSize: 24, fontFamily: font.bold },
  label: { fontSize: 13, marginTop: space.sm },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: 12, fontSize: 16 },
  multiline: { minHeight: 180, textAlignVertical: 'top' },
  primary: { borderRadius: radius.pill, paddingVertical: 16, alignItems: 'center', marginTop: space.lg },
  primaryText: { fontSize: 16, fontFamily: font.semibold },
});
