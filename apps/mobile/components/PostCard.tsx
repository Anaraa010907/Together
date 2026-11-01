import { Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useTranslation } from 'react-i18next';
import { font, lightTheme as t, radius, shadow, space } from '@together/ui/tokens';
import { isImage, voteCounts, votingOpen, type Post, type Vote } from '../lib/feed';
import { timeAgo } from '../lib/time';
import { Avatar } from './Avatar';

type Props = {
  post: Post;
  myId?: string;
  urls: Record<string, string>; // storage_path → signed URL
  full?: boolean; // дэлгэрэнгүй дэлгэц: бүтэн текст, том зураг
  busy?: boolean;
  onOpen?: () => void;
  onLongPress?: () => void;
  onHelpful?: () => void;
  onVote?: (v: Vote) => void;
};

const KIND_ICON: Record<Post['kind'], string> = { share: '📘', proposal: '🗳️', question: '❓' };

export function PostCard({ post, myId, urls, full, busy, onOpen, onLongPress, onHelpful, onVote }: Props) {
  const { t: tr } = useTranslation();
  const { width } = useWindowDimensions();

  const images = post.attachments.filter(isImage);
  const files = post.attachments.filter((a) => !isImage(a));
  const helped = !!myId && post.helpful_ids.includes(myId);
  const isMine = post.author_id === myId;
  const counts = voteCounts(post);
  const myVote = post.votes.find((v) => v.user_id === myId)?.vote;
  const open = votingOpen(post);
  const slideW = width - space.lg * 2 - space.md * 2;

  return (
    <Pressable
      onPress={onOpen}
      onLongPress={onLongPress}
      disabled={!onOpen && !onLongPress}
      style={[styles.card, { backgroundColor: t.surface, borderColor: '#EFEAE0' }]}
    >
      <View style={styles.headRow}>
        <Avatar name={post.author_name} url={post.author_avatar} size={38} />
        <View style={styles.head}>
          <Text style={[styles.author, { color: t.text }]}>{post.author_name}</Text>
          <Text style={styles.meta}>
            {KIND_ICON[post.kind]} {tr(`feed.kind.${post.kind}`)} · {timeAgo(post.created_at)}
          </Text>
        </View>
      </View>

      <Text style={[styles.body, { color: t.text }]} numberOfLines={full ? undefined : 6}>
        {post.body}
      </Text>

      {!!post.link_url && (
        <Pressable
          onPress={() => WebBrowser.openBrowserAsync(post.link_url!)}
          accessibilityRole="link"
          style={[styles.link, { borderColor: t.border, backgroundColor: t.surfaceMuted }]}
        >
          <Text style={{ color: t.text, fontFamily: font.semibold }}>
            {/youtu\.?be/.test(post.link_url) ? '▶ ' : '🔗 '}
            {tr('feed.openLink')}
          </Text>
          <Text style={{ color: t.textMuted, fontSize: 12 }} numberOfLines={1}>
            {post.link_url}
          </Text>
        </Pressable>
      )}

      {images.length > 0 &&
        (full ? (
          // Слайд шиг хуудас хуудсаар гүйлгэнэ.
          <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
            {images.map((a) => (
              <Image
                key={a.id}
                source={{ uri: urls[a.storage_path] }}
                style={{ width: slideW, height: slideW * 0.75, borderRadius: radius.md, backgroundColor: t.surfaceMuted }}
                resizeMode="contain"
                accessibilityLabel={a.file_name}
              />
            ))}
          </ScrollView>
        ) : (
          <View style={styles.thumbs}>
            {images.slice(0, 3).map((a) => (
              <Image
                key={a.id}
                source={{ uri: urls[a.storage_path] }}
                style={[styles.thumb, { backgroundColor: t.surfaceMuted }]}
                accessibilityLabel={a.file_name}
              />
            ))}
            {images.length > 3 && (
              <View style={[styles.thumb, styles.more, { backgroundColor: t.surfaceMuted }]}>
                <Text style={{ color: t.text, fontFamily: font.bold }}>+{images.length - 3}</Text>
              </View>
            )}
          </View>
        ))}

      {files.map((a) => (
        <Pressable
          key={a.id}
          onPress={() => urls[a.storage_path] && WebBrowser.openBrowserAsync(urls[a.storage_path])}
          accessibilityRole="link"
          style={[styles.file, { borderColor: t.border }]}
        >
          <Text style={{ color: t.text }} numberOfLines={1}>
            📄 {a.file_name}
          </Text>
        </Pressable>
      ))}

      {post.kind === 'proposal' && (
        <View style={{ gap: space.xs }}>
          <View style={styles.votes}>
            {(['support', 'against', 'question'] as Vote[]).map((v) => {
              const active = myVote === v;
              return (
                <Pressable
                  key={v}
                  disabled={!onVote || !open || busy}
                  onPress={() => onVote?.(v)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  style={[
                    styles.vote,
                    { borderColor: t.border, backgroundColor: active ? t.accent : t.background },
                  ]}
                >
                  <Text style={{ color: active ? t.onAccent : t.text, fontSize: 13, fontFamily: font.semibold }}>
                    {tr(`feed.vote.${v}`)} {counts[v]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={{ color: t.textMuted, fontSize: 12 }}>
            {!open
              ? tr('feed.votingClosed')
              : post.vote_deadline
                ? tr('feed.votingUntil', { date: post.vote_deadline.slice(0, 16).replace('T', ' ') })
                : tr('feed.votingOpen')}
          </Text>
        </View>
      )}

      <View style={styles.footer}>
        <Pressable
          onPress={onHelpful}
          disabled={!onHelpful || isMine || busy}
          accessibilityRole="button"
          accessibilityState={{ selected: helped }}
          style={[styles.pill, { borderColor: t.border, backgroundColor: helped ? t.success : 'transparent' }]}
        >
          <Text style={{ color: t.text, fontSize: 13 }}>
            👍 {tr('feed.helpful')} {post.helpful_ids.length}
          </Text>
        </Pressable>
        <Text style={{ color: t.textMuted, fontSize: 13 }}>
          💬 {post.comment_count}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.lg, padding: space.md, gap: space.sm, ...shadow.card },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  head: { gap: 2, flex: 1 },
  meta: { fontFamily: font.medium, fontSize: 12, color: '#5B6573' },
  author: { fontSize: 15, fontFamily: font.bold },
  body: { fontFamily: font.medium, fontSize: 15, lineHeight: 22 },
  link: { borderWidth: 1, borderRadius: radius.md, padding: space.sm, gap: 2 },
  thumbs: { flexDirection: 'row', gap: space.xs },
  thumb: { flex: 1, aspectRatio: 1, borderRadius: radius.sm, maxWidth: 110 },
  more: { alignItems: 'center', justifyContent: 'center' },
  file: { borderWidth: 1, borderRadius: radius.md, padding: space.sm },
  votes: { flexDirection: 'row', gap: space.xs },
  vote: { flex: 1, borderWidth: 1, borderRadius: radius.pill, paddingVertical: 8, alignItems: 'center' },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pill: { borderWidth: 1, borderRadius: radius.pill, paddingVertical: 6, paddingHorizontal: space.md },
});
