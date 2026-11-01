import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { lightTheme as t, radius, space } from '@together/ui/tokens';
import { PostCard } from '../../components/PostCard';
import { useSession } from '../../lib/session';
import { fetchBlockedIds } from '../../lib/account';
import { fetchMyMembership } from '../../lib/groups';
import { promptContentActions } from '../../lib/moderation';
import { usePostActions } from '../../lib/usePostActions';
import { timeAgo } from '../../lib/time';
import {
  addComment,
  deleteComment,
  deletePost,
  fetchComments,
  fetchPost,
  signedUrls,
  type Comment,
  type Post,
} from '../../lib/feed';

// Пост дэлгэрэнгүй: бүтэн текст, слайд гүйлгэх, санал, сэтгэгдэл.
export default function PostDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const postId = String(id);
  const { t: tr } = useTranslation();
  const router = useRouter();
  const { session } = useSession();
  const myId = session?.user.id;

  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  const [isOwner, setIsOwner] = useState(false);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const { busyId, toggleHelpful, vote } = usePostActions(myId, setPost);

  const load = useCallback(async () => {
    try {
      const [p, c, b] = await Promise.all([
        fetchPost(postId),
        fetchComments(postId),
        fetchBlockedIds().catch(() => new Set<string>()),
      ]);
      setPost(p);
      setComments(c);
      setBlocked(b);
      if (p) {
        const [u, m] = await Promise.all([
          signedUrls(p.attachments.map((a) => a.storage_path)).catch(() => ({})),
          fetchMyMembership(p.group_id),
        ]);
        setUrls(u);
        setIsOwner(m?.role === 'owner' && m?.status === 'active');
      }
    } catch (e: any) {
      Alert.alert(tr('common.error'), String(e.message ?? e));
    } finally {
      setLoading(false);
    }
  }, [postId, tr]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onSend = async () => {
    const text = draft.trim();
    if (!text) return;
    if (text.length > 2000) return Alert.alert(tr('common.error'), tr('feed.commentInvalid'));
    setSending(true);
    try {
      await addComment(postId, text);
      setDraft('');
      setComments(await fetchComments(postId));
      setPost((p) => (p ? { ...p, comment_count: p.comment_count + 1 } : p));
    } catch (e: any) {
      Alert.alert(tr('common.error'), String(e.message ?? e));
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: t.background }]}>
        <ActivityIndicator color={t.accent} />
      </View>
    );
  }
  if (!post) {
    return (
      <View style={[styles.center, { backgroundColor: t.background }]}>
        <Text style={{ color: t.textMuted }}>{tr('feed.errors.post_not_found')}</Text>
      </View>
    );
  }

  const visibleComments = comments.filter((c) => !blocked.has(c.author_id));

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: t.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <ScrollView contentContainerStyle={styles.screen}>
        <PostCard
          post={post}
          myId={myId}
          urls={urls}
          full
          busy={busyId === post.id}
          onLongPress={() =>
            promptContentActions({
              type: 'post',
              id: post.id,
              isMine: post.author_id === myId,
              canDelete: post.author_id === myId || isOwner,
              onDelete: async () => {
                await deletePost(post);
                router.back();
              },
            })
          }
          onHelpful={() => toggleHelpful(post)}
          onVote={(v) => vote(post, v)}
        />

        <Text style={[styles.section, { color: t.text }]}>
          {tr('feed.comments')} ({visibleComments.length})
        </Text>
        {visibleComments.length === 0 && <Text style={{ color: t.textMuted }}>{tr('feed.noComments')}</Text>}
        {visibleComments.map((c) => (
          <Pressable
            key={c.id}
            onLongPress={() =>
              promptContentActions({
                type: 'comment',
                id: c.id,
                isMine: c.author_id === myId,
                canDelete: c.author_id === myId || isOwner,
                onDelete: async () => {
                  await deleteComment(c.id);
                  setComments((prev) => prev.filter((x) => x.id !== c.id));
                  setPost((p) => (p ? { ...p, comment_count: Math.max(0, p.comment_count - 1) } : p));
                },
              })
            }
            style={[styles.comment, { borderColor: t.border, backgroundColor: t.surface }]}
          >
            <Text style={{ color: t.text, fontWeight: '600' }}>
              {c.author_name} <Text style={{ color: t.textMuted, fontWeight: '400', fontSize: 12 }}>· {timeAgo(c.created_at)}</Text>
            </Text>
            <Text style={{ color: t.text, lineHeight: 20 }}>{c.body}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={[styles.inputRow, { borderTopColor: t.border, backgroundColor: t.surface }]}>
        <TextInput
          style={[styles.input, { borderColor: t.border, backgroundColor: t.background, color: t.text }]}
          value={draft}
          onChangeText={setDraft}
          placeholder={tr('feed.commentPlaceholder')}
          placeholderTextColor={t.textMuted}
          maxLength={2000}
          multiline
          accessibilityLabel={tr('feed.commentPlaceholder')}
        />
        <Pressable
          style={[styles.send, { backgroundColor: t.accent, opacity: sending || !draft.trim() ? 0.5 : 1 }]}
          onPress={onSend}
          disabled={sending || !draft.trim()}
          accessibilityRole="button"
          accessibilityLabel={tr('feed.send')}
        >
          <Text style={{ color: t.onAccent, fontWeight: '700' }}>↑</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  screen: { padding: space.lg, gap: space.sm, paddingBottom: space.xl },
  section: { fontSize: 16, fontWeight: '600', marginTop: space.md },
  comment: { borderWidth: 1, borderRadius: radius.md, padding: space.md, gap: 4 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm, padding: space.sm, borderTopWidth: 1 },
  input: {
    flex: 1, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md,
    paddingVertical: 10, fontSize: 15, maxHeight: 120,
  },
  send: { width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
});
