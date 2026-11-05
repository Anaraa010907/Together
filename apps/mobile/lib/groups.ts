import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { decode } from 'base64-arraybuffer';
import i18n from './i18n';
import { supabase } from './supabase';

export type GroupSummary = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  visibility: 'public' | 'private';
  join_policy: 'open' | 'approval' | 'invite_only';
  owner_id: string;
  kind: 'community' | 'course';
  category_id: string | null;
  cover_url?: string | null;
};

export type MemberRow = {
  user_id: string;
  role: 'owner' | 'admin' | 'member';
  status: 'active' | 'pending' | 'banned';
  profiles: { username: string; display_name: string; avatar_url?: string | null } | null;
};

// Slug: латин үсэг/тоо/зураас. Монгол нэрнээс хоосон гарвал санамсаргүй үүсгэнэ.
export function makeSlug(name: string) {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30);
  if (base.length >= 3) return base;
  return `grp-${Math.random().toString(36).slice(2, 8)}`;
}

export async function createGroup(input: {
  name: string;
  description?: string;
  visibility: 'public' | 'private';
  joinPolicy: 'open' | 'approval' | 'invite_only';
}) {
  const { data, error } = await supabase.rpc('create_group', {
    p_name: input.name,
    p_slug: makeSlug(input.name),
    p_description: input.description ?? null,
    p_visibility: input.visibility,
    p_join_policy: input.joinPolicy,
  });
  if (error) throw error;
  return data as string;
}

export async function fetchPublicGroups(): Promise<GroupSummary[]> {
  const { data, error } = await supabase
    .from('groups')
    .select('id, name, slug, description, visibility, join_policy, owner_id, kind, category_id, cover_url')
    .eq('visibility', 'public')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as GroupSummary[];
}

// Миний гишүүнчлэлтэй group-ууд (active).
export async function fetchMyGroups(): Promise<GroupSummary[]> {
  const { data, error } = await supabase
    .from('group_members')
    .select('groups(id, name, slug, description, visibility, join_policy, owner_id, kind, category_id, cover_url)')
    .eq('status', 'active');
  if (error) throw error;
  return (data ?? [])
    .map((r: any) => (Array.isArray(r.groups) ? r.groups[0] : r.groups))
    .filter(Boolean) as GroupSummary[];
}

export async function fetchGroup(id: string): Promise<GroupSummary | null> {
  const { data, error } = await supabase
    .from('groups')
    .select('id, name, slug, description, visibility, join_policy, owner_id, kind, category_id, cover_url')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data as GroupSummary | null;
}

export async function fetchMyMembership(groupId: string) {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;
  const { data, error } = await supabase
    .from('group_members')
    .select('role, status')
    .eq('group_id', groupId)
    .eq('user_id', userData.user.id)
    .maybeSingle();
  if (error) throw error;
  return data as { role: string; status: string } | null;
}

export async function fetchMembers(groupId: string): Promise<MemberRow[]> {
  const { data, error } = await supabase
    .from('group_members')
    .select('user_id, role, status, profiles(username, display_name, avatar_url)')
    .eq('group_id', groupId)
    .order('joined_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    ...r,
    profiles: Array.isArray(r.profiles) ? r.profiles[0] : r.profiles,
  })) as MemberRow[];
}

export async function joinGroup(groupId: string) {
  const { data, error } = await supabase.rpc('join_group', { p_group_id: groupId });
  if (error) throw error;
  return data as 'active' | 'pending';
}

export async function leaveGroup(groupId: string) {
  const { error } = await supabase.rpc('leave_group', { p_group_id: groupId });
  if (error) throw error;
}

// Эзэн: 8 тэмдэгттэй урилгын код (7 хоног, 50 удаа).
export async function createInvite(groupId: string) {
  const { data, error } = await supabase.rpc('create_group_invite', { p_group_id: groupId });
  if (error) throw error;
  return data as string;
}

// Кодоор нэгдэх: private / invite_only group-д шууд гишүүн болно. Group id буцаана.
export async function redeemInvite(code: string) {
  const { data, error } = await supabase.rpc('redeem_group_invite', { p_code: code.trim() });
  if (error) throw error;
  return data as string;
}

export async function reviewJoinRequest(groupId: string, userId: string, approve: boolean) {
  const { error } = await supabase.rpc('review_join_request', {
    p_group_id: groupId,
    p_user_id: userId,
    p_approve: approve,
  });
  if (error) throw error;
}

// ---------- Группын нүүр зураг ----------
// Сонгох (16:9) — үүсгэхээс өмнө ч сонгож болно. Буцаах: локал зураг эсвэл null.
export async function pickGroupCover(): Promise<ImagePicker.ImagePickerAsset | null> {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [16, 9],
    quality: 0.6,
  });
  if (res.canceled || !res.assets[0]) return null;
  return res.assets[0];
}

// Эзэн: avatars/{user_id}/group-{id}-… руу хуулаад groups.cover_url-ийг шинэчилнэ.
export async function uploadGroupCover(groupId: string, asset: ImagePicker.ImagePickerAsset): Promise<string> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error('not_authenticated');
  const ext = asset.mimeType === 'image/png' ? 'png' : asset.mimeType === 'image/webp' ? 'webp' : 'jpg';
  const path = `${u.user.id}/group-${groupId}-${Date.now()}.${ext}`;
  const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
  const bytes = decode(base64);
  if (bytes.byteLength > 2 * 1024 * 1024) throw new Error(i18n.t('settings.avatarTooBig'));
  const up = await supabase.storage.from('avatars').upload(path, bytes, {
    contentType: asset.mimeType ?? 'image/jpeg',
    upsert: true,
  });
  if (up.error) throw up.error;
  const url = supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
  const { error } = await supabase.from('groups').update({ cover_url: url }).eq('id', groupId);
  if (error) throw error;
  return url;
}
