-- 0002: Хэрэглэгч өөрийн профайлыг анх үүсгэх.
-- Default grant нь is_minor-ийг ч оруулдаг тул багана тус бүрээр нь хязгаарлана.

revoke insert on profiles from authenticated, anon;
grant insert (id, username, display_name, bio, avatar_url, locale, timezone, privacy)
  on profiles to authenticated;

create policy profiles_insert_self on profiles for insert to authenticated
  with check (id = auth.uid());
