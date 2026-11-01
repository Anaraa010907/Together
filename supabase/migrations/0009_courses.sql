-- 0009: Багшийн профайл + Сургалт group (хичээлийн цуврал, суралцагчийн ахиц).
-- Аюулгүй байдал: насаа зарлаагүй эсвэл 18 хүрээгүй хэрэглэгч зөвхөн баталгаажсан багшийн сургалтад нэгдэнэ.

-- ---------- нас (нэг удаа зарлана) ----------
alter table profiles add column age_declared_at timestamptz;

create or replace function public.declare_age(p_adult boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_adult is null then raise exception 'invalid_age'; end if;
  update profiles set is_minor = not p_adult, age_declared_at = now()
  where id = auth.uid() and age_declared_at is null;
  if not found then raise exception 'age_already_declared'; end if;
end;
$$;

-- ---------- багшийн профайл ----------
create or replace function public.valid_subjects(s text[])
returns boolean language sql immutable as $$
  select coalesce(array_length(s, 1), 0) <= 5
     and not exists (select 1 from unnest(s) x where char_length(trim(x)) not between 1 and 30)
$$;

create table teacher_profiles (
  user_id     uuid primary key references profiles (id) on delete cascade,
  enabled     boolean not null default true,
  headline    text check (char_length(headline) <= 120),
  subjects    text[] not null default '{}' check (public.valid_subjects(subjects)),
  intro       text check (char_length(intro) <= 1000),
  verified_at timestamptz,               -- зөвхөн админ (service role / Studio)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger teacher_profiles_touch before update on teacher_profiles
  for each row execute function public.touch_updated_at();

alter table teacher_profiles enable row level security;
revoke all on teacher_profiles from anon, authenticated;
grant select on teacher_profiles to authenticated;
grant insert (user_id, enabled, headline, subjects, intro) on teacher_profiles to authenticated;
grant update (enabled, headline, subjects, intro) on teacher_profiles to authenticated;

create policy teachers_select on teacher_profiles for select to authenticated
  using (enabled or user_id = auth.uid());
create policy teachers_insert on teacher_profiles for insert to authenticated
  with check (user_id = auth.uid());
create policy teachers_update on teacher_profiles for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.is_verified_teacher(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from teacher_profiles t where t.user_id = uid and t.enabled and t.verified_at is not null)
$$;

-- ---------- сургалт group ----------
alter table groups add column kind text not null default 'community' check (kind in ('community', 'course'));

-- Сургалтад нэгдэх эрх: насанд хүрсэн (зарласан) эсвэл багш нь баталгаажсан.
create or replace function public._course_join_allowed(gid uuid, uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select
    coalesce((select g.kind <> 'course' from groups g where g.id = gid), true)
    or public.is_verified_teacher((select g.owner_id from groups g where g.id = gid))
    or exists (select 1 from profiles p where p.id = uid and not p.is_minor and p.age_declared_at is not null)
$$;
revoke execute on function public._course_join_allowed(uuid, uuid) from public, anon, authenticated;

create or replace function public.create_course(
  p_name text,
  p_slug text,
  p_description text default null,
  p_visibility group_visibility default 'public'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from teacher_profiles t where t.user_id = auth.uid() and t.enabled) then
    raise exception 'not_teacher';
  end if;
  v_id := public.create_group(p_name, p_slug, p_description, p_visibility,
                              case when p_visibility = 'private' then 'approval'::join_policy else 'open'::join_policy end);
  update groups set kind = 'course' where id = v_id;
  return v_id;
end;
$$;

-- join_group (0004) + сургалтын насны шалгалт
create or replace function public.join_group(p_group_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_group groups%rowtype;
  v_existing group_members%rowtype;
  v_status member_status;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select * into v_group from groups where id = p_group_id and deleted_at is null;
  if not found then raise exception 'group_not_found'; end if;

  select * into v_existing from group_members where group_id = p_group_id and user_id = v_uid;
  if found then
    if v_existing.status = 'banned' then raise exception 'banned'; end if;
    if v_existing.status = 'active' then raise exception 'already_member'; end if;
    return v_existing.status::text;
  end if;

  if v_group.join_policy = 'invite_only' then raise exception 'invite_only'; end if;
  if not public._course_join_allowed(p_group_id, v_uid) then raise exception 'course_adults_only'; end if;

  if v_group.join_policy = 'open' and v_group.visibility = 'public' then
    v_status := 'active';
  else
    v_status := 'pending';
  end if;

  insert into group_members (group_id, user_id, role, status) values (p_group_id, v_uid, 'member', v_status);
  return v_status::text;
end;
$$;

-- redeem_group_invite (0005) + сургалтын насны шалгалт
create or replace function public.redeem_group_invite(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_invite   group_invites%rowtype;
  v_existing group_members%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select * into v_invite from group_invites where code = upper(trim(p_code)) for update;
  if not found then raise exception 'invalid_code'; end if;
  if v_invite.expires_at < now() then raise exception 'invite_expired'; end if;
  if v_invite.uses >= v_invite.max_uses then raise exception 'invite_exhausted'; end if;

  select * into v_existing from group_members where group_id = v_invite.group_id and user_id = v_uid;
  if found then
    if v_existing.status = 'banned' then raise exception 'banned'; end if;
    if v_existing.status = 'active' then return v_invite.group_id; end if;
  end if;

  if not public._course_join_allowed(v_invite.group_id, v_uid) then raise exception 'course_adults_only'; end if;

  if v_existing.user_id is not null then  -- pending мөр байсан
    update group_members set status = 'active' where group_id = v_invite.group_id and user_id = v_uid;
  else
    insert into group_members (group_id, user_id, role, status) values (v_invite.group_id, v_uid, 'member', 'active');
  end if;

  update group_invites set uses = uses + 1 where id = v_invite.id;
  return v_invite.group_id;
end;
$$;

-- ---------- хичээл ----------
create table course_lessons (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references groups (id) on delete cascade,
  position   int not null check (position between 1 and 50),
  title      text not null check (char_length(title) between 2 and 120),
  content    text check (char_length(content) <= 4000),
  video_url  text check (video_url ~* '^https://' and char_length(video_url) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_id, position)
);
create trigger course_lessons_touch before update on course_lessons
  for each row execute function public.touch_updated_at();

create table lesson_completions (
  lesson_id    uuid not null references course_lessons (id) on delete cascade,
  user_id      uuid not null references profiles (id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (lesson_id, user_id)
);
create index lesson_completions_user_idx on lesson_completions (user_id);

alter table course_lessons enable row level security;
alter table lesson_completions enable row level security;
revoke all on course_lessons, lesson_completions from anon, authenticated;
grant select, delete on course_lessons to authenticated;
grant insert (group_id, position, title, content, video_url) on course_lessons to authenticated;
grant update (title, content, video_url) on course_lessons to authenticated;
grant select on lesson_completions to authenticated;

-- Хөтөлбөр (хичээлийн жагсаалт) group-ийг харж чадах хүнд харагдана.
create policy lessons_select on course_lessons for select to authenticated
  using (public.can_view_group(group_id));
create policy lessons_insert on course_lessons for insert to authenticated
  with check (
    public.is_group_owner(group_id)
    and exists (select 1 from groups g where g.id = course_lessons.group_id and g.kind = 'course')
  );
create policy lessons_update on course_lessons for update to authenticated
  using (public.is_group_owner(group_id)) with check (public.is_group_owner(group_id));
create policy lessons_delete on course_lessons for delete to authenticated
  using (public.is_group_owner(group_id));

create policy completions_select on lesson_completions for select to authenticated
  using (exists (select 1 from course_lessons l where l.id = lesson_id and public.is_group_member(l.group_id)));

-- Хичээл дуусгах: идэвхтэй суралцагч, өмнөх хичээлүүд дууссан байх. +30 XP (нэг удаа).
create or replace function public.complete_lesson(p_lesson_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_lesson course_lessons%rowtype;
  v_done   int;
  v_total  int;
  v_sync   jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select * into v_lesson from course_lessons where id = p_lesson_id;
  if not found then raise exception 'lesson_not_found'; end if;
  if not public.is_group_member(v_lesson.group_id) then raise exception 'not_member'; end if;
  if public.is_group_owner(v_lesson.group_id) then raise exception 'not_student'; end if;

  if exists (
    select 1 from course_lessons l
    where l.group_id = v_lesson.group_id and l.position < v_lesson.position
      and not exists (select 1 from lesson_completions c where c.lesson_id = l.id and c.user_id = v_uid)
  ) then
    raise exception 'previous_lesson_required';
  end if;

  insert into lesson_completions (lesson_id, user_id) values (p_lesson_id, v_uid) on conflict do nothing;
  if not found then raise exception 'already_completed'; end if;

  insert into xp_transactions (user_id, source_type, source_id, amount)
  values (v_uid, 'lesson_complete', p_lesson_id, 30)
  on conflict (user_id, source_type, source_id) do nothing;
  v_sync := public._sync_xp(v_uid);

  select count(*) into v_total from course_lessons where group_id = v_lesson.group_id;
  select count(*) into v_done from lesson_completions c
    join course_lessons l on l.id = c.lesson_id
    where l.group_id = v_lesson.group_id and c.user_id = v_uid;

  return v_sync || jsonb_build_object('xp_gained', 30, 'done', v_done, 'total', v_total);
end;
$$;

-- Багшийн нэр хүнд: сургалтын тоо, суралцагчид, "Тустай" тэмдэг.
create or replace function public.teacher_stats(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'courses', (select count(*) from groups g where g.owner_id = p_user_id and g.kind = 'course' and g.deleted_at is null),
    'students', (select count(distinct m.user_id) from group_members m join groups g on g.id = m.group_id
                 where g.owner_id = p_user_id and g.kind = 'course' and m.status = 'active' and m.user_id <> p_user_id),
    'helpful', (select count(*) from post_helpful h join posts p on p.id = h.post_id where p.author_id = p_user_id)
  )
  where exists (select 1 from teacher_profiles t where t.user_id = p_user_id and t.enabled)
$$;

revoke execute on function public.declare_age(boolean) from public, anon;
revoke execute on function public.create_course(text, text, text, group_visibility) from public, anon;
revoke execute on function public.complete_lesson(uuid) from public, anon;
revoke execute on function public.teacher_stats(uuid) from public, anon;
grant execute on function public.declare_age(boolean) to authenticated;
grant execute on function public.create_course(text, text, text, group_visibility) to authenticated;
grant execute on function public.complete_lesson(uuid) to authenticated;
grant execute on function public.teacher_stats(uuid) to authenticated;
