import i18n from './i18n';
import { supabase } from './supabase';
import { fetchPostsByIds, type Post } from './feed';

export type ProfileStats = {
  posts: number;
  followers: number;
  following: number;
  groups: number;
  verified: boolean;
  i_follow: boolean;
  blocked: boolean;
  viewer_admin?: boolean;
  banned?: boolean; // зөвхөн админд
  // Зөвхөн өөрийн профайл дээр:
  is_admin?: boolean;
  goals_done?: number;
  checkins?: number;
  challenges_done?: number;
  helpful_received?: number;
  lessons_done?: number;
  liked?: number;
  saved?: number;
};

export type Person = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  followers: number;
  i_follow: boolean;
  verified: boolean;
};

export type FollowPerson = Omit<Person, 'followers'> & { followed_at: string };

export async function fetchFollowList(userId: string, kind: 'followers' | 'following'): Promise<FollowPerson[]> {
  const { data, error } = await supabase.rpc('follow_list', { p_user: userId, p_kind: kind });
  if (error) throw error;
  return (data ?? []) as FollowPerson[];
}

// ---------- Админ ----------
export type AdminOverview = {
  open_reports: number;
  users: number;
  new_users_7d: number;
  banned: number;
  groups: number;
  posts_7d: number;
  messages_7d: number;
  pending_teachers: number;
};

export type AdminReport = {
  id: string;
  target_type: 'profile' | 'group' | 'goal' | 'post' | 'comment' | 'review' | 'message';
  target_id: string;
  reason: string;
  status: 'open' | 'reviewing' | 'resolved' | 'dismissed';
  created_at: string;
  reporter_name: string | null;
  reports_on_target: number;
  target_title: string | null;
  target_body: string | null;
  target_owner: string | null;
  target_owner_name: string | null;
  target_hidden: boolean;
  owner_banned: boolean;
};

export type AdminTeacher = {
  user_id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
  headline: string | null;
  subjects: string[];
  intro: string | null;
  verified_at: string | null;
  courses: number;
  rating_avg: number | null;
  rating_count: number;
  created_at: string;
};

export async function isAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_admin');
  if (error) throw error;
  return !!data;
}

export async function adminOverview(): Promise<AdminOverview> {
  const { data, error } = await supabase.rpc('admin_overview');
  if (error) throw error;
  return data as AdminOverview;
}

export async function adminReports(status: 'open' | 'resolved' | 'dismissed' | 'all'): Promise<AdminReport[]> {
  const { data, error } = await supabase.rpc('admin_reports', { p_status: status, p_limit: 200 });
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({ ...r, reports_on_target: Number(r.reports_on_target) }));
}

export async function adminSetReportStatus(reportId: string, status: 'open' | 'resolved' | 'dismissed') {
  const { error } = await supabase.rpc('admin_set_report_status', { p_report: reportId, p_status: status });
  if (error) throw error;
}

export async function adminHideContent(type: string, id: string, hidden: boolean) {
  const { error } = await supabase.rpc('admin_hide_content', { p_type: type, p_id: id, p_hidden: hidden });
  if (error) throw error;
}

export async function adminSetBan(userId: string, banned: boolean) {
  const { error } = await supabase.rpc('admin_set_ban', { p_user: userId, p_banned: banned });
  if (error) throw error;
}

export async function adminTeachers(pendingOnly: boolean): Promise<AdminTeacher[]> {
  const { data, error } = await supabase.rpc('admin_teachers', { p_pending_only: pendingOnly });
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({ ...r, courses: Number(r.courses), rating_count: Number(r.rating_count) }));
}

export async function adminVerifyTeacher(userId: string, verified: boolean) {
  const { error } = await supabase.rpc('admin_verify_teacher', { p_user: userId, p_verified: verified });
  if (error) throw error;
}

export function adminErrorKey(e: unknown): string | null {
  const msg = String((e as any)?.message ?? e);
  if (msg.includes('forbidden')) return 'admin.errors.forbidden';
  if (msg.includes('cannot_ban_self')) return 'admin.errors.banSelf';
  if (msg.includes('cannot_ban_admin')) return 'admin.errors.banAdmin';
  return null;
}

export type GroupStat = { members: number; preview: { name: string; url: string | null }[] };

// 12500 → "12.5K", 2800000 → "2.8M".
export function compact(n: number) {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, '')}K`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
}

async function myId() {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error('not_authenticated');
  return data.user.id;
}

export async function fetchProfileStats(userId: string): Promise<ProfileStats | null> {
  const { data, error } = await supabase.rpc('profile_stats', { p_user: userId });
  if (error) throw error;
  return (data as ProfileStats) ?? null;
}

export async function searchPeople(query = '', limit = 20): Promise<Person[]> {
  const { data, error } = await supabase.rpc('search_people', { p_query: query || null, p_limit: limit });
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({ ...r, followers: Number(r.followers) }));
}

export async function fetchPublicProfile(userId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, bio, avatar_url')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data as { id: string; username: string; display_name: string; bio: string | null; avatar_url: string | null } | null;
}

export async function follow(userId: string) {
  const me = await myId();
  const { error } = await supabase.from('follows').insert({ follower_id: me, followee_id: userId });
  if (error && error.code !== '23505') throw error; // аль хэдийн дагасан бол алгасна
}

export async function unfollow(userId: string) {
  const me = await myId();
  const { error } = await supabase.from('follows').delete().eq('follower_id', me).eq('followee_id', userId);
  if (error) throw error;
}

// Группын картууд: гишүүдийн тоо + эхний 3 гишүүн.
export async function fetchGroupStats(ids: string[]): Promise<Record<string, GroupStat>> {
  if (ids.length === 0) return {};
  const { data, error } = await supabase.rpc('group_stats', { p_ids: ids });
  if (error) throw error;
  const out: Record<string, GroupStat> = {};
  for (const r of (data ?? []) as any[]) {
    out[r.group_id] = { members: Number(r.members), preview: r.preview ?? [] };
  }
  return out;
}

// ---------- Хадгалсан / таалагдсан пост ----------
export async function fetchSavedIds(): Promise<Set<string>> {
  const { data, error } = await supabase.from('post_saves').select('post_id');
  if (error) throw error;
  return new Set((data ?? []).map((r: any) => r.post_id));
}

export async function savePost(postId: string) {
  const me = await myId();
  const { error } = await supabase.from('post_saves').insert({ user_id: me, post_id: postId });
  if (error && error.code !== '23505') throw error;
}

export async function unsavePost(postId: string) {
  const me = await myId();
  const { error } = await supabase.from('post_saves').delete().eq('user_id', me).eq('post_id', postId);
  if (error) throw error;
}

export async function fetchSavedPosts(): Promise<Post[]> {
  const { data, error } = await supabase
    .from('post_saves')
    .select('post_id')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return fetchPostsByIds((data ?? []).map((r: any) => r.post_id));
}

export async function fetchLikedPosts(): Promise<Post[]> {
  const me = await myId();
  const { data, error } = await supabase
    .from('post_helpful')
    .select('post_id')
    .eq('user_id', me)
    .limit(100);
  if (error) throw error;
  return fetchPostsByIds((data ?? []).map((r: any) => r.post_id));
}

// ---------- XP түүх ----------
export type XpEntry = { id: string; source_type: string; amount: number; created_at: string };

export async function fetchXpHistory(limit = 100): Promise<XpEntry[]> {
  const { data, error } = await supabase
    .from('xp_transactions')
    .select('id, source_type, amount, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as XpEntry[];
}

// XP эх үүсвэрийн нэр (орчуулгагүй бол түлхүүрээрээ).
export const xpSourceLabel = (source: string) => i18n.t(`xpSource.${source}`, { defaultValue: source });

// ---------- Амжилтууд (клиент талд тооцно) ----------
export type Achievement = { key: string; icon: string; done: boolean; progress: number; goal: number };

export function computeAchievements(
  s: ProfileStats,
  p: { total_xp: number; current_level: number; longest_streak: number },
): Achievement[] {
  const a = (key: string, icon: string, value: number, goal: number): Achievement => ({
    key,
    icon,
    done: value >= goal,
    progress: Math.min(value, goal),
    goal,
  });
  return [
    a('firstGoal', '🎯', s.goals_done ?? 0, 1),
    a('goals50', '🏹', s.goals_done ?? 0, 50),
    a('streak7', '🔥', p.longest_streak, 7),
    a('streak30', '☄️', p.longest_streak, 30),
    a('level5', '⭐', p.current_level, 5),
    a('level10', '🌟', p.current_level, 10),
    a('firstGroup', '🤝', s.groups, 1),
    a('firstPost', '✍️', s.posts, 1),
    a('helpful10', '💡', s.helpful_received ?? 0, 10),
    a('challenge', '🏆', s.challenges_done ?? 0, 1),
    a('lessons10', '📚', s.lessons_done ?? 0, 10),
    a('followers10', '👥', s.followers, 10),
  ];
}
