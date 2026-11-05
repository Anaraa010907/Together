import { useEffect, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { ImagePickerAsset } from 'expo-image-picker';
import { useTranslation } from 'react-i18next';
import { font, lightTheme as t, palette, radius } from '@together/ui/tokens';
import { createGroup, pickGroupCover, uploadGroupCover } from '../../lib/groups';
import { courseErrorKey, createCourse } from '../../lib/teaching';
import { categoryColor, categoryName, fetchCategories, setGroupCategory, type Category } from '../../lib/interests';
import { Button } from '../../components/ui';
import { Backdrop } from '../../components/Backdrop';
import { FadeIn, PressableScale } from '../../components/motion';

// Групп үүсгэх: нүүр зураг, нэр, тайлбар, ангилал, нууцлал.
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
  const [cats, setCats] = useState<Category[]>([]);
  const [showAllCats, setShowAllCats] = useState(false);
  const [category, setCategory] = useState<string | null>(null);
  const [cover, setCover] = useState<ImagePickerAsset | null>(null);
  const [focus, setFocus] = useState<'name' | 'desc' | null>(null);

  useEffect(() => {
    fetchCategories().then(setCats).catch(() => {});
  }, []);

  const onPickCover = async () => {
    try {
      const a = await pickGroupCover();
      if (a) setCover(a);
    } catch (e: any) {
      Alert.alert(tr('common.error'), String(e?.message ?? e));
    }
  };

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
      if (category) await setGroupCategory(id, category).catch(() => {});
      if (cover) await uploadGroupCover(id, cover).catch(() => {});
      router.replace(`/group/${id}` as never);
    } catch (e: any) {
      const msg = String(e.message ?? e);
      const key = msg.includes('slug_taken') ? 'groups.slugTaken' : courseErrorKey(e);
      Alert.alert(tr('common.error'), key ? tr(key) : msg);
    } finally {
      setBusy(false);
    }
  };

  const shownCats = showAllCats ? cats : cats.slice(0, 6);

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <Stack.Screen options={{ title: isCourse ? tr('courses.createTitle') : tr('groups.createTitle'), headerTransparent: true }} />
      <Backdrop />
      <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
        <FadeIn index={0}>
          <PressableScale onPress={onPickCover} accessibilityRole="button" accessibilityLabel={tr('groups.coverPick')} style={styles.coverBox}>
            {cover ? (
              <>
                <Image source={{ uri: cover.uri }} style={StyleSheet.absoluteFill} />
                <View style={styles.coverEdit}>
                  <Ionicons name="camera" size={16} color="#FFFFFF" />
                </View>
              </>
            ) : (
              <View style={{ alignItems: 'center', gap: 8 }}>
                <Ionicons name="camera-outline" size={30} color={t.text} />
                <Text style={styles.coverText}>{tr('groups.coverPick')}</Text>
              </View>
            )}
          </PressableScale>
        </FadeIn>

        <FadeIn index={1} style={{ gap: 8 }}>
          <Text style={styles.label}>
            {tr('groups.name')} <Text style={{ color: palette.pink }}>*</Text>
          </Text>
          <TextInput
            style={[styles.input, focus === 'name' && styles.inputFocus]}
            value={name}
            onChangeText={setName}
            onFocus={() => setFocus('name')}
            onBlur={() => setFocus(null)}
            maxLength={60}
            placeholder={tr('groups.namePlaceholder')}
            placeholderTextColor={t.textFaint}
            accessibilityLabel={tr('groups.name')}
          />
        </FadeIn>

        <FadeIn index={2} style={{ gap: 8 }}>
          <Text style={styles.label}>{tr('groups.description')}</Text>
          <TextInput
            style={[styles.input, styles.multiline, focus === 'desc' && styles.inputFocus]}
            value={description}
            onChangeText={setDescription}
            onFocus={() => setFocus('desc')}
            onBlur={() => setFocus(null)}
            multiline
            maxLength={500}
            placeholder={tr('groups.descPlaceholder')}
            placeholderTextColor={t.textFaint}
            accessibilityLabel={tr('groups.description')}
          />
        </FadeIn>

        {cats.length > 0 && (
          <FadeIn index={3} style={{ gap: 10 }}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>
                <Text style={{ color: palette.orange }}>{tr('groups.categoryLabelA')}</Text> {tr('groups.categoryLabelB')}
              </Text>
              {cats.length > 6 && (
                <Pressable onPress={() => setShowAllCats((v) => !v)} hitSlop={8} accessibilityRole="button" style={styles.allCats}>
                  <Text style={styles.allCatsText}>{showAllCats ? tr('groups.fewerCats') : tr('groups.allCats')}</Text>
                  <Ionicons name={showAllCats ? 'chevron-up' : 'chevron-forward'} size={14} color={t.textMuted} />
                </Pressable>
              )}
            </View>
            <View style={styles.catWrap}>
              {shownCats.map((c) => {
                const selected = category === c.id;
                return (
                  <PressableScale
                    key={c.id}
                    onPress={() => setCategory(selected ? null : c.id)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    style={[styles.cat, selected && styles.catSelected]}
                  >
                    <LinearGradient colors={categoryColor(c.id)} style={styles.catIcon}>
                      <Text style={{ fontSize: 14 }}>{c.icon}</Text>
                    </LinearGradient>
                    <Text style={styles.catText}>{categoryName(c)}</Text>
                  </PressableScale>
                );
              })}
            </View>
          </FadeIn>
        )}

        <FadeIn index={4}>
          <View style={styles.settings}>
            <View style={styles.settingRow}>
              <Ionicons name="lock-closed-outline" size={18} color={palette.lilac} />
              <Text style={styles.settingText}>{tr('groups.private')}</Text>
              <Switch
                value={isPrivate}
                onValueChange={setIsPrivate}
                trackColor={{ false: 'rgba(255,255,255,0.15)', true: palette.violet }}
                thumbColor="#FFFFFF"
              />
            </View>
            {!isCourse && (
              <View style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: t.borderSoft }]}>
                <Ionicons name="shield-checkmark-outline" size={18} color={palette.lilac} />
                <Text style={styles.settingText}>{tr('groups.approval')}</Text>
                <Switch
                  value={needApproval || isPrivate}
                  disabled={isPrivate}
                  onValueChange={setNeedApproval}
                  trackColor={{ false: 'rgba(255,255,255,0.15)', true: palette.violet }}
                  thumbColor="#FFFFFF"
                />
              </View>
            )}
          </View>
          <Text style={styles.hint}>{tr('groups.privateHint')}</Text>
          {isCourse && <Text style={styles.hint}>{tr('courses.createHint')}</Text>}
        </FadeIn>

        <FadeIn index={5}>
          <Button label={tr('groups.createAction')} onPress={onCreate} loading={busy} />
        </FadeIn>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 20, paddingTop: 110, gap: 18, paddingBottom: 48 },
  coverBox: {
    alignSelf: 'center', width: 170, height: 120, borderRadius: 22, borderWidth: 1.5, borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.28)', backgroundColor: t.surface, alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden', paddingHorizontal: 12,
  },
  coverText: { fontFamily: font.semibold, fontSize: 13, color: t.text, textAlign: 'center' },
  coverEdit: {
    position: 'absolute', right: 8, bottom: 8, width: 30, height: 30, borderRadius: 15,
    backgroundColor: 'rgba(12,10,28,0.7)', alignItems: 'center', justifyContent: 'center',
  },
  label: { fontFamily: font.bold, fontSize: 14, color: t.text },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  input: {
    backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 18,
    paddingHorizontal: 16, paddingVertical: 14, fontFamily: font.medium, fontSize: 15, color: t.text,
  },
  inputFocus: { borderColor: palette.violet, backgroundColor: 'rgba(139,92,246,0.08)' },
  multiline: { minHeight: 100, textAlignVertical: 'top' },
  allCats: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  allCatsText: { fontFamily: font.semibold, fontSize: 13, color: t.textMuted },
  catWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cat: {
    flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border,
    borderRadius: radius.pill, paddingVertical: 5, paddingLeft: 5, paddingRight: 13,
  },
  catSelected: { borderColor: palette.violet, backgroundColor: 'rgba(139,92,246,0.22)' },
  catIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  catText: { fontFamily: font.semibold, fontSize: 13, color: t.text },
  settings: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 20, paddingHorizontal: 14 },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  settingText: { flex: 1, fontFamily: font.semibold, fontSize: 15, color: t.text },
  hint: { fontFamily: font.medium, fontSize: 12, color: t.textMuted, marginTop: 8, lineHeight: 17 },
});
