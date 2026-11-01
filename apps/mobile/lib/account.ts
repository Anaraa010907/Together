import i18n from './i18n';
import { supabase } from './supabase';

export type Locale = 'mn' | 'en';
export type ReportType = 'profile' | 'group' | 'goal' | 'post' | 'comment' | 'review';

export type MyProfile = {
  id: string;
  username: string;
  display_name: string;
  bio: string | null;
  locale: Locale;
};

async function requireUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw error ?? new Error('Нэвтрээгүй байна.');
  return data.user.id;
}

export async function fetchMyProfile(): Promise<MyProfile | null> {
  const id = await requireUserId();
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, bio, locale')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data as MyProfile | null;
}

// Зөвхөн column grant-д зөвшөөрөгдсөн талбарууд (is_minor-ийг client өөрчилж чадахгүй).
export async function updateMyProfile(fields: { display_name?: string; bio?: string | null; locale?: Locale }) {
  const id = await requireUserId();
  const { error } = await supabase.from('profiles').update(fields).eq('id', id);
  if (error) throw error;
}

export async function setLanguage(locale: Locale) {
  await i18n.changeLanguage(locale);
  await updateMyProfile({ locale });
}

// Сервер талын delete_my_account(): эзэмшдэг group-ууд, профайл, бүх өгөгдлийг устгана.
export async function deleteMyAccount() {
  const { error } = await supabase.rpc('delete_my_account');
  if (error) throw error;
  await supabase.auth.signOut().catch(() => {});
}

export async function reportTarget(type: ReportType, targetId: string, reason: string) {
  const reporterId = await requireUserId();
  const { error } = await supabase.from('user_reports').insert({
    reporter_id: reporterId,
    target_type: type,
    target_id: targetId,
    reason,
  });
  if (error) throw error;
}

export async function blockUser(userId: string) {
  const blockerId = await requireUserId();
  const { error } = await supabase.from('user_blocks').insert({ blocker_id: blockerId, blocked_id: userId });
  if (error && error.code !== '23505') throw error; // аль хэдийн блоклосон бол алгасна
}

export async function unblockUser(userId: string) {
  const blockerId = await requireUserId();
  const { error } = await supabase
    .from('user_blocks')
    .delete()
    .eq('blocker_id', blockerId)
    .eq('blocked_id', userId);
  if (error) throw error;
}

export type BlockedUser = { blocked_id: string; display_name: string; username: string };

export async function fetchBlocked(): Promise<BlockedUser[]> {
  const { data, error } = await supabase
    .from('user_blocks')
    .select('blocked_id, profiles!user_blocks_blocked_id_fkey(display_name, username)');
  if (error) throw error;
  return (data ?? []).map((r: any) => {
    const p = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
    return { blocked_id: r.blocked_id, display_name: p?.display_name ?? '—', username: p?.username ?? '' };
  });
}

export async function fetchBlockedIds(): Promise<Set<string>> {
  const { data, error } = await supabase.from('user_blocks').select('blocked_id');
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.blocked_id as string));
}
