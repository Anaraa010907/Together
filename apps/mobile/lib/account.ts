import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import i18n from './i18n';
import { supabase } from './supabase';

export type Locale = 'mn' | 'en';
export type ReportType = 'profile' | 'group' | 'goal' | 'post' | 'comment' | 'review' | 'message';

export type MyProfile = {
  id: string;
  username: string;
  display_name: string;
  bio: string | null;
  locale: Locale;
  avatar_url: string | null;
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
    .select('id, username, display_name, bio, locale, avatar_url')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data as MyProfile | null;
}

// Зөвхөн column grant-д зөвшөөрөгдсөн талбарууд (is_minor-ийг client өөрчилж чадахгүй).
export async function updateMyProfile(fields: {
  display_name?: string;
  bio?: string | null;
  locale?: Locale;
  avatar_url?: string | null;
}) {
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

// Профайлын зураг: дөрвөлжин тайрч, 2MB-аас бага болгоод avatars/{user_id}/ руу. Буцаах: шинэ URL эсвэл null (болих).
export async function pickAndUploadAvatar(): Promise<string | null> {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.6,
  });
  if (res.canceled || !res.assets[0]) return null;
  const asset = res.assets[0];
  const uid = await requireUserId();
  const ext = asset.mimeType === 'image/png' ? 'png' : asset.mimeType === 'image/webp' ? 'webp' : 'jpg';
  const path = `${uid}/avatar-${Date.now()}.${ext}`;
  const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
  const bytes = decode(base64);
  if (bytes.byteLength > 2 * 1024 * 1024) throw new Error(i18n.t('settings.avatarTooBig'));

  const up = await supabase.storage.from('avatars').upload(path, bytes, {
    contentType: asset.mimeType ?? 'image/jpeg',
    upsert: true,
  });
  if (up.error) throw up.error;
  const url = supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
  await updateMyProfile({ avatar_url: url });
  return url;
}
