-- 0011: Supabase advisor-ийн зөвлөмж.
-- 1) RLS helper-уудыг нэвтрээгүй (anon) хэрэглэгч RPC-ээр дуудахгүй.
-- 2) Туслах функцүүдэд search_path тогтооно.
revoke execute on function public.can_view_group(uuid) from public, anon;
revoke execute on function public.is_group_member(uuid) from public, anon;
revoke execute on function public.is_group_owner(uuid) from public, anon;
revoke execute on function public.is_verified_teacher(uuid) from public, anon;
grant execute on function public.can_view_group(uuid) to authenticated;
grant execute on function public.is_group_member(uuid) to authenticated;
grant execute on function public.is_group_owner(uuid) to authenticated;
grant execute on function public.is_verified_teacher(uuid) to authenticated;

alter function public.touch_updated_at() set search_path = public;
alter function public.level_for_xp(int) set search_path = public;
alter function public.safe_uuid(text) set search_path = public;
alter function public.valid_subjects(text[]) set search_path = public;
