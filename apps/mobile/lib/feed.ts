import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import { supabase } from './supabase';

export type PostKind = 'share' | 'proposal' | 'question';
export type Vote = 'support' | 'against' | 'question';

export type Attachment = {
  id: string;
  storage_path: string;
  mime_type: string;
  file_name: string;
  position: number;
};

export type Post = {
  id: string;
  group_id: string;
  author_id: string;
  author_name: string;
  author_avatar: string | null;
  kind: PostKind;
  body: string;
  link_url: string | null;
  vote_deadline: string | null;
  created_at: string;
  attachments: Attachment[];
  comment_count: number;
  helpful_ids: string[];
  votes: { user_id: string; vote: Vote }[];
};

export type Comment = {
  id: string;
  author_id: string;
  author_name: string;
  author_avatar: string | null;
  body: string;
  created_at: string;
};

export type LocalFile = { uri: string; name: string; mimeType: string; size: number };

export const MAX_FILES = 10;
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
const BUCKET = 'post-media';
const PAGE = 20;

const SELECT = `id, group_id, author_id, kind, body, link_url, vote_deadline, created_at,
  profiles(display_name, avatar_url),
  post_attachments(id, storage_path, mime_type, file_name, position),
  comments(count),
  post_helpful(user_id),
  proposal_votes(user_id, vote)`;

const one = (x: any) => (Array.isArray(x) ? x[0] : x);

function mapPost(r: any): Post {
  return {
    id: r.id,
    group_id: r.group_id,
    author_id: r.author_id,
    author_name: one(r.profiles)?.display_name ?? '—',
    author_avatar: one(r.profiles)?.avatar_url ?? null,
    kind: r.kind,
    body: r.body,
    link_url: r.link_url,
    vote_deadline: r.vote_deadline,
    created_at: r.created_at,
    attachments: [...(r.post_attachments ?? [])].sort((a: Attachment, b: Attachment) => a.position - b.position),
    comment_count: one(r.comments)?.count ?? 0,
    helpful_ids: (r.post_helpful ?? []).map((h: any) => h.user_id),
    votes: r.proposal_votes ?? [],
  };
}

export const isImage = (a: Attachment) => a.mime_type.startsWith('image/');
export const votingOpen = (p: Post) => !p.vote_deadline || new Date(p.vote_deadline) > new Date();

export function voteCounts(p: Post) {
  const c = { support: 0, against: 0, question: 0 };
  for (const v of p.votes) c[v.vote] += 1;
  return c;
}

// ---------- унших ----------
export async function fetchFeed(groupId: string, before?: string): Promise<Post[]> {
  let q = supabase
    .from('posts')
    .select(SELECT)
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })
    .limit(PAGE);
  if (before) q = q.lt('created_at', before);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(mapPost);
}

export async function fetchPost(id: string): Promise<Post | null> {
  const { data, error } = await supabase.from('posts').select(SELECT).eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? mapPost(data) : null;
}

export async function fetchComments(postId: string): Promise<Comment[]> {
  const { data, error } = await supabase
    .from('comments')
    .select('id, author_id, body, created_at, profiles(display_name, avatar_url)')
    .eq('post_id', postId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    author_id: r.author_id,
    author_name: one(r.profiles)?.display_name ?? '—',
    author_avatar: one(r.profiles)?.avatar_url ?? null,
    body: r.body,
    created_at: r.created_at,
  }));
}

// Хувийн bucket тул түр хугацааны (1 цаг) холбоос үүсгэнэ.
export async function signedUrls(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600);
  if (error) throw error;
  const out: Record<string, string> = {};
  for (const row of data ?? []) if (row.path && row.signedUrl) out[row.path] = row.signedUrl;
  return out;
}

// ---------- файл сонгох ----------
export async function pickImages(limit: number): Promise<LocalFile[]> {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: limit,
    quality: 0.8,
  });
  if (res.canceled) return [];
  return res.assets.map((a, i) => ({
    uri: a.uri,
    name: a.fileName ?? `image-${Date.now()}-${i}.jpg`,
    mimeType: a.mimeType ?? 'image/jpeg',
    size: a.fileSize ?? 0,
  }));
}

export async function pickPdf(): Promise<LocalFile[]> {
  const res = await DocumentPicker.getDocumentAsync({
    type: 'application/pdf',
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (res.canceled) return [];
  return res.assets.map((a) => ({
    uri: a.uri,
    name: a.name,
    mimeType: a.mimeType ?? 'application/pdf',
    size: a.size ?? 0,
  }));
}

const safeName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80) || 'file';

// ---------- бичих ----------
// Пост → файл upload → хавсралтын мөр. Аль нэг нь алдаа гарвал постыг цэвэрлэнэ.
export async function createPost(input: {
  groupId: string;
  kind: PostKind;
  body: string;
  linkUrl?: string;
  voteDeadline?: string | null;
  files: LocalFile[];
}) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw userError ?? new Error('Нэвтрээгүй байна.');

  const { data: post, error } = await supabase
    .from('posts')
    .insert({
      group_id: input.groupId,
      author_id: userData.user.id,
      kind: input.kind,
      body: input.body,
      link_url: input.linkUrl || null,
      vote_deadline: input.kind === 'proposal' ? input.voteDeadline ?? null : null,
    })
    .select('id')
    .single();
  if (error) throw error;

  const uploaded: string[] = [];
  try {
    for (const [i, f] of input.files.entries()) {
      const path = `${input.groupId}/${post.id}/${i}-${safeName(f.name)}`;
      const base64 = await FileSystem.readAsStringAsync(f.uri, { encoding: FileSystem.EncodingType.Base64 });
      const bytes = decode(base64);
      const up = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType: f.mimeType });
      if (up.error) throw up.error;
      uploaded.push(path);

      const { error: attErr } = await supabase.from('post_attachments').insert({
        post_id: post.id,
        storage_path: path,
        mime_type: f.mimeType,
        file_name: f.name.slice(0, 200),
        size_bytes: bytes.byteLength,
        position: i,
      });
      if (attErr) throw attErr;
    }
  } catch (e) {
    if (uploaded.length) await supabase.storage.from(BUCKET).remove(uploaded).catch(() => {});
    await supabase.from('posts').delete().eq('id', post.id);
    throw e;
  }
  return post.id as string;
}

// Файлыг эхэлж устгана (постыг устгасны дараа storage-ийн эрх шалгагдахгүй болно).
export async function deletePost(post: Post) {
  const paths = post.attachments.map((a) => a.storage_path);
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
  const { error } = await supabase.from('posts').delete().eq('id', post.id);
  if (error) throw error;
}

export async function markHelpful(postId: string) {
  const { data, error } = await supabase.rpc('mark_helpful', { p_post_id: postId });
  if (error) throw error;
  return data as { count: number; awarded: boolean };
}

export async function unmarkHelpful(postId: string, userId: string) {
  const { error } = await supabase.from('post_helpful').delete().eq('post_id', postId).eq('user_id', userId);
  if (error) throw error;
}

export async function voteProposal(postId: string, vote: Vote) {
  const { error } = await supabase.rpc('vote_proposal', { p_post_id: postId, p_vote: vote });
  if (error) throw error;
}

export async function addComment(postId: string, body: string) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw userError ?? new Error('Нэвтрээгүй байна.');
  const { error } = await supabase.from('comments').insert({ post_id: postId, author_id: userData.user.id, body });
  if (error) throw error;
}

export async function deleteComment(id: string) {
  const { error } = await supabase.from('comments').delete().eq('id', id);
  if (error) throw error;
}

// Серверийн алдааны кодыг орчуулгын түлхүүр болгоно.
const FEED_ERRORS = ['own_post', 'post_not_found', 'not_proposal', 'voting_closed'] as const;
export function feedErrorKey(e: unknown): string | null {
  const msg = String((e as any)?.message ?? e);
  const code = FEED_ERRORS.find((c) => msg.includes(c));
  return code ? `feed.errors.${code}` : null;
}
