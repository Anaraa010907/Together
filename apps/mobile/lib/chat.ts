import type { RealtimeChannel } from '@supabase/supabase-js';
import * as FileSystem from 'expo-file-system';
import i18n from './i18n';
import { SUPABASE_ANON_KEY, SUPABASE_URL, supabase } from './supabase';

export type ConversationSummary = {
  id: string;
  kind: 'direct' | 'group';
  group_id: string | null;
  title: string | null;
  avatar_url: string | null;
  other_id: string | null;
  last_body: string | null;
  last_sender_id: string | null;
  last_at: string | null;
  unread: number;
};

export type MessageKind = 'text' | 'image' | 'video' | 'audio';

export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  kind?: MessageKind;
  media_path?: string | null;
  media_mime?: string | null;
  media_duration_ms?: number | null;
  media_width?: number | null;
  media_height?: number | null;
  sender_name?: string;
  sender_avatar?: string | null;
  local_uri?: string; // илгээж буй үед урьдчилан харах
};

export type ConversationInfo = {
  id: string;
  kind: 'direct' | 'group';
  group_id: string | null;
  title: string;
  avatar_url: string | null;
  other_id: string | null;
};

const PAGE = 40;
const MSG_COLS = 'id, conversation_id, sender_id, body, created_at, kind, media_path, media_mime, media_duration_ms, media_width, media_height';
const MEDIA_BUCKET = 'chat-media';
export const MAX_MEDIA_BYTES = 25 * 1024 * 1024;
const one = (x: any) => (Array.isArray(x) ? x[0] : x);

export function chatErrorKey(e: unknown): string | null {
  const msg = String((e as any)?.message ?? e);
  if (msg.includes('blocked')) return 'chat.errors.blocked';
  if (msg.includes('user_not_found')) return 'chat.errors.userNotFound';
  if (msg.includes('not_member')) return 'chat.errors.notMember';
  if (msg.includes('row-level security')) return 'chat.errors.cannotSend';
  if (msg.includes('media_too_big') || msg.includes('upload_failed_413')) return 'chat.errors.tooBig';
  if (msg.includes('upload_failed')) return 'chat.errors.uploadFailed';
  return null;
}

export async function fetchConversations(): Promise<ConversationSummary[]> {
  const { data, error } = await supabase.rpc('my_conversations');
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({ ...r, unread: Number(r.unread) }));
}

export async function fetchUnreadChatCount(): Promise<number> {
  const { data, error } = await supabase.rpc('unread_chat_count');
  if (error) throw error;
  return Number(data ?? 0);
}

export async function startDirectChat(userId: string): Promise<string> {
  const { data, error } = await supabase.rpc('start_direct_chat', { p_user: userId });
  if (error) throw error;
  return data as string;
}

export async function openGroupChat(groupId: string): Promise<string> {
  const { data, error } = await supabase.rpc('group_chat', { p_group: groupId });
  if (error) throw error;
  return data as string;
}

// Харилцааны гарчиг: direct бол нөгөө хүн, group бол группын нэр.
export async function fetchConversationInfo(id: string, myId: string): Promise<ConversationInfo | null> {
  const { data, error } = await supabase
    .from('conversations')
    .select('id, kind, group_id, user_a, user_b, groups(name, cover_url)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  if (data.kind === 'group') {
    const g = one((data as any).groups);
    return { id, kind: 'group', group_id: data.group_id, title: g?.name ?? '—', avatar_url: g?.cover_url ?? null, other_id: null };
  }
  const other = data.user_a === myId ? data.user_b : data.user_a;
  const { data: p } = await supabase.from('profiles').select('display_name, avatar_url').eq('id', other).maybeSingle();
  return { id, kind: 'direct', group_id: null, title: p?.display_name ?? '—', avatar_url: p?.avatar_url ?? null, other_id: other };
}

// Шинэ нь эхэндээ (inverted жагсаалтад).
export async function fetchMessages(conversationId: string, before?: string): Promise<Message[]> {
  let q = supabase
    .from('messages')
    .select(`${MSG_COLS}, profiles(display_name, avatar_url)`)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(PAGE);
  if (before) q = q.lt('created_at', before);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(mapMessage);
}

function mapMessage(r: any): Message {
  const p = one(r.profiles);
  return {
    id: r.id,
    conversation_id: r.conversation_id,
    sender_id: r.sender_id,
    body: r.body,
    created_at: r.created_at,
    kind: r.kind ?? 'text',
    media_path: r.media_path,
    media_mime: r.media_mime,
    media_duration_ms: r.media_duration_ms,
    media_width: r.media_width,
    media_height: r.media_height,
    sender_name: p?.display_name,
    sender_avatar: p?.avatar_url ?? null,
  };
}

export async function sendMessage(conversationId: string, senderId: string, body: string): Promise<Message> {
  const { data, error } = await supabase
    .from('messages')
    .insert({ conversation_id: conversationId, sender_id: senderId, body: body.trim() })
    .select(MSG_COLS)
    .single();
  if (error) throw error;
  return data as Message;
}

export type OutgoingMedia = {
  uri: string;
  kind: Exclude<MessageKind, 'text'>;
  mime: string;
  durationMs?: number | null;
  width?: number | null;
  height?: number | null;
};

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif',
  'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/3gpp': '3gp',
  'audio/mp4': 'm4a', 'audio/m4a': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/mpeg': 'mp3', 'audio/3gpp': '3gp', 'audio/webm': 'webm',
};

// Файлыг chat-media/{conversation}/{sender}/… руу шууд (base64-гүй) upload хийгээд мессеж үүсгэнэ.
export async function sendMedia(conversationId: string, senderId: string, media: OutgoingMedia, caption = ''): Promise<Message> {
  const info = await FileSystem.getInfoAsync(media.uri);
  if (info.exists && 'size' in info && info.size && info.size > MAX_MEDIA_BYTES) throw new Error('media_too_big');
  const ext = EXT[media.mime] ?? media.uri.split('.').pop()?.toLowerCase() ?? 'bin';
  const path = `${conversationId}/${senderId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { data: s } = await supabase.auth.getSession();
  const token = s.session?.access_token;
  if (!token) throw new Error('not_authenticated');
  const res = await FileSystem.uploadAsync(`${SUPABASE_URL}/storage/v1/object/${MEDIA_BUCKET}/${path}`, media.uri, {
    httpMethod: 'POST',
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY, 'Content-Type': media.mime, 'x-upsert': 'false' },
  });
  if (res.status >= 300) throw new Error(`upload_failed_${res.status}`);
  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_id: senderId,
      body: caption.trim(),
      kind: media.kind,
      media_path: path,
      media_mime: media.mime,
      media_duration_ms: media.durationMs ? Math.round(media.durationMs) : null,
      media_width: media.width ? Math.round(media.width) : null,
      media_height: media.height ? Math.round(media.height) : null,
    })
    .select(MSG_COLS)
    .single();
  if (error) {
    await supabase.storage.from(MEDIA_BUCKET).remove([path]).catch(() => {});
    throw error;
  }
  return data as Message;
}

// Хаалттай файлын түр (1 цаг) холбоос.
export async function signedMediaUrls(paths: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(paths.filter(Boolean))];
  if (unique.length === 0) return {};
  const { data, error } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrls(unique, 3600);
  if (error) throw error;
  const out: Record<string, string> = {};
  for (const r of data ?? []) if (r.path && r.signedUrl) out[r.path] = r.signedUrl;
  return out;
}

// Жагсаалтын "[image]" гэх мэт тэмдгийг орчуулна.
export function previewText(body: string | null) {
  if (body === '[image]') return `📷 ${i18n.t('chat.kind.image')}`;
  if (body === '[video]') return `🎬 ${i18n.t('chat.kind.video')}`;
  if (body === '[audio]') return `🎤 ${i18n.t('chat.kind.audio')}`;
  return body ?? '';
}

export function formatDuration(ms: number | null | undefined) {
  const total = Math.max(0, Math.round((ms ?? 0) / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export async function deleteMessage(id: string) {
  const { error } = await supabase.from('messages').delete().eq('id', id);
  if (error) throw error;
}

export async function markRead(conversationId: string) {
  const { error } = await supabase.rpc('mark_conversation_read', { p_conversation: conversationId });
  if (error) throw error;
}

// Шинэ мессеж шууд ирнэ (Supabase Realtime, RLS-ээр шүүгдэнэ).
export function subscribeMessages(conversationId: string, onInsert: (m: Message) => void): () => void {
  const channel: RealtimeChannel = supabase
    .channel(`chat:${conversationId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
      (payload) => onInsert(payload.new as Message),
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

// Чатуудын жагсаалт шинэчлэгдэх (шинэ мессеж ирэхэд).
export function subscribeInbox(onChange: () => void): () => void {
  const channel = supabase
    .channel('chat:inbox')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => onChange())
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

// Цагийг "14:05", долоо хоногийн өдөр, эсвэл "11/02" хэлбэрээр.
export function chatTime(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  if (d.toDateString() === now.toDateString()) return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if ((now.getTime() - d.getTime()) / 86400000 < 7) return i18n.t(`time.wd${d.getDay()}`);
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
}

export function clockTime(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
