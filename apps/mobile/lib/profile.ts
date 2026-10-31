import { supabase } from './supabase';

export const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

export async function isUsernameTaken(username: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', username)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

export async function createProfile(input: {
  username: string;
  displayName: string;
  locale: 'mn' | 'en';
}) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw userError ?? new Error('Нэвтрээгүй байна.');

  const { error } = await supabase.from('profiles').insert({
    id: userData.user.id,
    username: input.username,
    display_name: input.displayName,
    locale: input.locale,
    timezone: 'Asia/Ulaanbaatar',
    privacy: 'private',
  });
  if (error) throw error;
}
