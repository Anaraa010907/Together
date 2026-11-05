import { supabase } from './supabase';

export type NotificationType =
  | 'join_request'
  | 'join_approved'
  | 'comment'
  | 'helpful'
  | 'proposal'
  | 'session'
  | 'lesson'
  | 'follow';

export type AppNotification = {
  id: string;
  actor_id?: string | null;
  type: NotificationType;
  actor_name: string;
  actor_avatar: string | null;
  group_id: string | null;
  entity_id: string | null;
  data: Record<string, any>;
  read_at: string | null;
  created_at: string;
};

const one = (x: any) => (Array.isArray(x) ? x[0] : x);

export async function fetchNotifications(limit = 50): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, type, actor_id, group_id, entity_id, data, read_at, created_at, profiles!notifications_actor_id_fkey(display_name, avatar_url)')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r: any) => {
    const p = one(r.profiles);
    return { ...r, actor_name: p?.display_name ?? '—', actor_avatar: p?.avatar_url ?? null, profiles: undefined };
  });
}

export async function fetchUnreadCount(): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null);
  if (error) return 0;
  return count ?? 0;
}

export async function markAllRead() {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return;
  await supabase.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null).eq('user_id', u.user.id);
}

export async function clearNotifications() {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return;
  const { error } = await supabase.from('notifications').delete().eq('user_id', u.user.id);
  if (error) throw error;
}

// Мэдэгдэл дээр дарахад очих хуудас.
export function targetOf(n: AppNotification): string | null {
  switch (n.type) {
    case 'join_request':
    case 'join_approved':
      return n.group_id ? `/group/${n.group_id}` : null;
    case 'comment':
    case 'helpful':
    case 'proposal':
      return n.entity_id ? `/post/${n.entity_id}` : null;
    case 'session':
      return n.entity_id ? `/session/${n.entity_id}` : null;
    case 'lesson':
      return n.entity_id ? `/lesson/${n.entity_id}` : null;
    case 'follow':
      return n.actor_id ? `/user/${n.actor_id}` : null;
    default:
      return null;
  }
}
