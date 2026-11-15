import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { font, lightTheme as t, palette, radius, space } from '@together/ui/tokens';
import { Backdrop } from '../../components/Backdrop';
import { Button } from '../../components/ui';
import {
  createPost,
  MAX_FILE_BYTES,
  MAX_FILES,
  pickImages,
  pickPdf,
  type LocalFile,
  type PostKind,
} from '../../lib/feed';

const KINDS: PostKind[] = ['share', 'proposal', 'question'];
const DEADLINES = [0, 1, 3, 7]; // 0 = хугацаагүй

// Пост бичих: төрөл, текст, линк (YouTube гэх мэт), зураг / PDF, санал бол хугацаа.
export default function NewPost() {
  // body: сешний тэмдэглэлээс урьдчилж бөглөх боломжтой.
  const { groupId, body: initialBody } = useLocalSearchParams<{ groupId: string; body?: string }>();
  const { t: tr } = useTranslation();
  const router = useRouter();
  const [kind, setKind] = useState<PostKind>('share');
  const [body, setBody] = useState(initialBody ? String(initialBody) : '');
  const [link, setLink] = useState('');
  const [deadlineDays, setDeadlineDays] = useState(3);
  const [files, setFiles] = useState<LocalFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [bodyError, setBodyError] = useState(false);
  const [focused, setFocused] = useState(false);

  const addFiles = (picked: LocalFile[]) => {
    const tooBig = picked.filter((f) => f.size > MAX_FILE_BYTES);
    if (tooBig.length) Alert.alert(tr('common.error'), tr('feed.fileTooBig'));
    setFiles((prev) => [...prev, ...picked.filter((f) => f.size <= MAX_FILE_BYTES)].slice(0, MAX_FILES));
  };

  const onPickImages = async () => {
    try {
      addFiles(await pickImages(MAX_FILES - files.length));
    } catch (e: any) {
      Alert.alert(tr('common.error'), String(e.message ?? e));
    }
  };
  const onPickPdf = async () => {
    try {
      addFiles(await pickPdf());
    } catch (e: any) {
      Alert.alert(tr('common.error'), String(e.message ?? e));
    }
  };

  const onSubmit = async () => {
    const text = body.trim();
    const url = link.trim();
    // Хоосон бол алдааны цонх биш, талбарын доор сануулна.
    if (text.length < 1 || text.length > 4000) {
      setBodyError(true);
      return;
    }
    if (url && !/^https?:\/\/\S+$/i.test(url)) return Alert.alert(tr('feed.linkInvalidTitle'), tr('feed.linkInvalid'));

    setBusy(true);
    try {
      const deadline =
        kind === 'proposal' && deadlineDays > 0
          ? new Date(Date.now() + deadlineDays * 86_400_000).toISOString()
          : null;
      const id = await createPost({
        groupId: String(groupId),
        kind,
        body: text,
        linkUrl: url || undefined,
        voteDeadline: deadline,
        files,
      });
      router.replace(`/post/${id}` as never);
    } catch (e: any) {
      Alert.alert(tr('common.error'), String(e.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
    <Backdrop />
    <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
      <View style={styles.chips}>
        {KINDS.map((k) => (
          <Chip key={k} label={tr(`feed.kind.${k}`)} active={kind === k} onPress={() => setKind(k)} />
        ))}
      </View>
      <Text style={[styles.hint, { color: t.textMuted }]}>{tr(`feed.kindHint.${kind}`)}</Text>

      <TextInput
        style={[
          styles.input,
          styles.multiline,
          { borderColor: bodyError ? palette.rose : focused ? palette.violet : t.border, backgroundColor: t.surface, color: t.text },
        ]}
        value={body}
        onChangeText={(v) => {
          setBody(v);
          if (bodyError && v.trim()) setBodyError(false);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        multiline
        maxLength={4000}
        placeholder={tr(`feed.placeholder.${kind}`)}
        placeholderTextColor={t.textFaint}
        accessibilityLabel={tr('feed.body')}
      />
      {bodyError && <Text style={styles.error}>{tr('feed.bodyRequired')}</Text>}

      <TextInput
        style={[styles.input, { borderColor: t.border, backgroundColor: t.surface, color: t.text }]}
        value={link}
        onChangeText={setLink}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        placeholder={tr('feed.linkPlaceholder')}
        placeholderTextColor={t.textFaint}
        accessibilityLabel={tr('feed.linkPlaceholder')}
      />

      {kind === 'proposal' && (
        <>
          <Text style={[styles.label, { color: t.textMuted }]}>{tr('feed.deadline')}</Text>
          <View style={styles.chips}>
            {DEADLINES.map((d) => (
              <Chip
                key={d}
                label={d === 0 ? tr('feed.noDeadline') : tr('feed.deadlineDays', { n: d })}
                active={deadlineDays === d}
                onPress={() => setDeadlineDays(d)}
              />
            ))}
          </View>
        </>
      )}

      <View style={styles.chips}>
        <Pressable
          style={[styles.attach, { borderColor: t.border }]}
          onPress={onPickImages}
          disabled={files.length >= MAX_FILES}
          accessibilityRole="button"
        >
          <Text style={{ color: t.text, fontFamily: font.semibold }}>🖼 {tr('feed.addImages')}</Text>
        </Pressable>
        <Pressable
          style={[styles.attach, { borderColor: t.border }]}
          onPress={onPickPdf}
          disabled={files.length >= MAX_FILES}
          accessibilityRole="button"
        >
          <Text style={{ color: t.text, fontFamily: font.semibold }}>📄 PDF</Text>
        </Pressable>
      </View>
      <Text style={[styles.hint, { color: t.textMuted }]}>{tr('feed.filesHint', { max: MAX_FILES })}</Text>

      {files.map((f, i) => (
        <View key={`${f.uri}-${i}`} style={[styles.fileRow, { borderColor: t.border, backgroundColor: t.surface }]}>
          <Text style={{ color: t.text, flex: 1 }} numberOfLines={1}>
            {f.mimeType === 'application/pdf' ? '📄' : '🖼'} {f.name}
          </Text>
          <Pressable
            onPress={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
            accessibilityRole="button"
            accessibilityLabel={tr('feed.removeFile')}
          >
            <Text style={{ color: t.warning, fontFamily: font.bold, paddingHorizontal: space.sm }}>✕</Text>
          </Pressable>
        </View>
      ))}

      <Text style={[styles.hint, { color: t.textMuted }]}>{tr('feed.helpfulHint')}</Text>

      <View style={{ marginTop: space.md }}>
        <Button label={tr('feed.publish')} icon="paper-plane-outline" onPress={onSubmit} loading={busy} />
      </View>
    </ScrollView>
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      style={[
        styles.chip,
        active
          ? { borderColor: 'rgba(196,181,253,0.6)', backgroundColor: 'rgba(139,92,246,0.35)' }
          : { borderColor: t.border, backgroundColor: t.surface },
      ]}
    >
      <Text style={{ color: active ? '#FFFFFF' : t.textMuted, fontFamily: active ? font.bold : font.semibold, fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { padding: space.lg, gap: space.sm, paddingBottom: space.xl },
  chips: { flexDirection: 'row', gap: space.sm },
  chip: { flex: 1, borderWidth: 1, borderRadius: radius.pill, paddingVertical: 10, alignItems: 'center' },
  label: { fontSize: 13, marginTop: space.sm },
  hint: { fontSize: 12 },
  input: { borderWidth: 1, borderRadius: 18, paddingHorizontal: space.md, paddingVertical: 14, fontSize: 16, fontFamily: font.medium },
  multiline: { minHeight: 140, textAlignVertical: 'top' },
  attach: { flex: 1, borderWidth: 1, borderRadius: 18, paddingVertical: 13, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)' },
  fileRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: radius.md, padding: space.sm },
  error: { fontSize: 13, fontFamily: font.semibold, color: palette.rose, marginTop: -2 },
});
