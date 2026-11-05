import type { RealtimeChannel } from '@supabase/supabase-js';
import i18n from './i18n';
import { supabase } from './supabase';

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

export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  sender_name?: string;
  sender_avatar?: string | null;
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
const one = (x: any) => (Array.isArray(x) ? x[0] : x);

export function chatErrorKey(e: unknown): string | null {
  const msg = String((e as any)?.message ?? e);
  if (msg.includes('blocked')) return 'chat.errors.blocked';
  if (msg.includes('user_not_found')) return 'chat.errors.userNotFound';
  if (msg.includes('not_member')) return 'chat.errors.notMember';
  if (msg.includes('row-level security')) return 'chat.errors.cannotSend';
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
    .select('id, conversation_id, sender_id, body, created_at, profiles(display_name, avatar_url)')
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
    sender_name: p?.display_name,
    sender_avatar: p?.avatar_url ?? null,
  };
}

export async function sendMessage(conversationId: string, senderId: string, body: string): Promise<Message> {
  const { data, error } = await supabase
    .from('messages')
    .insert({ conversation_id: conversationId, sender_id: senderId, body: body.trim() })
    .select('id, conversation_id, sender_id, body, created_at')
    .single();
  if (error) throw error;
  return data as Message;
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
