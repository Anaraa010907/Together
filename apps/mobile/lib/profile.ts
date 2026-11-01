import { supabase } from './supabase';

export const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

async function myId() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw error ?? new Error('Нэвтрээгүй байна.');
  return data.user.id;
}

// Өөр хэрэглэгч авсан эсэх (өөрийн профайлыг тооцохгүй).
export async function isUsernameTaken(username: string) {
  const uid = await myId();
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', username)
    .neq('id', uid)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

// Профайл үүсгэх эсвэл (өмнөх оролдлогоор үүссэн бол) шинэчлэх.
export async function saveProfile(input: { username: string; displayName: string; locale: 'mn' | 'en' }) {
  const uid = await myId();
  const { data: existing, error: readErr } = await supabase.from('profiles').select('id').eq('id', uid).maybeSingle();
  if (readErr) throw readErr;

  const { error } = existing
    ? await supabase
        .from('profiles')
        .update({ username: input.username, display_name: input.displayName, locale: input.locale })
        .eq('id', uid)
    : await supabase.from('profiles').insert({
        id: uid,
        username: input.username,
        display_name: input.displayName,
        locale: input.locale,
        timezone: 'Asia/Ulaanbaatar',
        privacy: 'private',
      });
  if (error) {
    if (error.code === '23505') throw new Error('username_taken');
    throw error;
  }
}
