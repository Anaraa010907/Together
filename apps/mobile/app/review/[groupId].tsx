import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { lightTheme as t, radius, space } from '@together/ui/tokens';
import { useSession } from '../../lib/session';
import { courseErrorKey, deleteMyReview, fetchCourseReviews, reviewCourse } from '../../lib/teaching';

// Сургалтыг үнэлэх: 1–5 од, сэтгэгдэл. Өмнөх үнэлгээг засна эсвэл устгана.
export default function ReviewCourse() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const gid = String(groupId);
  const { t: tr } = useTranslation();
  const router = useRouter();
  const { session } = useSession();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [existing, setExisting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const mine = (await fetchCourseReviews(gid)).find((r) => r.user_id === session?.user.id);
      if (mine) {
        setRating(mine.rating);
        setComment(mine.comment ?? '');
        setExisting(true);
      }
    } catch (e: any) {
      Alert.alert(tr('common.error'), String(e.message ?? e));
    } finally {
      setLoading(false);
    }
  }, [gid, session?.user.id, tr]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const fail = (e: any) => {
    const key = courseErrorKey(e);
    Alert.alert(tr('common.error'), key ? tr(key) : String(e?.message ?? e));
  };

  const onSave = async () => {
    if (rating < 1) return Alert.alert(tr('common.error'), tr('reviews.pickStars'));
    setBusy(true);
    try {
      await reviewCourse(gid, rating, comment.trim());
      Alert.alert(tr('reviews.thanks'));
      router.back();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const onDelete = () =>
    Alert.alert(tr('reviews.deleteTitle'), undefined, [
      { text: tr('common.cancel'), style: 'cancel' },
      {
        text: tr('feed.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteMyReview(gid);
            router.back();
          } catch (e) {
            fail(e);
          }
        },
      },
    ]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: t.background }]}>
        <ActivityIndicator color={t.accent} />
      </View>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: t.background }} contentContainerStyle={styles.screen}>
      <Text style={[styles.title, { color: t.text }]}>{existing ? tr('reviews.editTitle') : tr('reviews.title')}</Text>
      <Text style={{ color: t.textMuted }}>{tr('reviews.subtitle')}</Text>

      <View style={styles.stars}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable
            key={n}
            onPress={() => setRating(n)}
            accessibilityRole="radio"
            accessibilityState={{ selected: rating === n }}
            accessibilityLabel={tr('reviews.starsLabel', { n })}
            hitSlop={8}
          >
            <Text style={{ fontSize: 40, color: n <= rating ? t.accent : t.border }}>★</Text>
          </Pressable>
        ))}
      </View>
      {rating > 0 && <Text style={{ color: t.text, textAlign: 'center' }}>{tr(`reviews.level${rating}`)}</Text>}

      <TextInput
        style={[styles.input, { borderColor: t.border, backgroundColor: t.surface, color: t.text }]}
        value={comment}
        onChangeText={setComment}
        multiline
        maxLength={500}
        placeholder={tr('reviews.commentPlaceholder')}
        placeholderTextColor={t.textMuted}
        accessibilityLabel={tr('reviews.commentPlaceholder')}
      />
      <Text style={{ color: t.textMuted, fontSize: 12 }}>{tr('reviews.publicHint')}</Text>

      <Pressable
        style={[styles.primary, { backgroundColor: t.accent, opacity: busy ? 0.6 : 1 }]}
        disabled={busy}
        onPress={onSave}
        accessibilityRole="button"
      >
        <Text style={[styles.primaryText, { color: t.onAccent }]}>{tr('reviews.submit')}</Text>
      </Pressable>

      {existing && (
        <Pressable onPress={onDelete} accessibilityRole="button" style={styles.textBtn}>
          <Text style={{ color: t.warning }}>{tr('reviews.delete')}</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  screen: { padding: space.lg, gap: space.sm, paddingBottom: space.xl },
  title: { fontSize: 24, fontWeight: '700' },
  stars: { flexDirection: 'row', justifyContent: 'center', gap: space.sm, marginVertical: space.md },
  input: {
    borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: 12,
    fontSize: 16, minHeight: 110, textAlignVertical: 'top', marginTop: space.md,
  },
  primary: { borderRadius: radius.pill, paddingVertical: 16, alignItems: 'center', marginTop: space.lg },
  primaryText: { fontSize: 16, fontWeight: '600' },
  textBtn: { alignItems: 'center', paddingVertical: space.md },
});
