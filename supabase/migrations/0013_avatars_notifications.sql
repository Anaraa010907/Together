-- 0013: Профайлын зураг (avatars bucket) + апп доторх мэдэгдэл (notifications).

-- ---------- avatars: нийтэд уншигдах, зөвхөн өөрийн хавтаст бичнэ ({user_id}/...) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy avatars_select_own on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_update_own on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- avatar_url нь зөвхөн https холбоос байна.
alter table profiles add constraint profiles_avatar_url_check
  check (avatar_url is null or (avatar_url ~* '^https://' and char_length(avatar_url) <= 500));

-- ---------- notifications ----------
create table notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles (id) on delete cascade,   -- хүлээн авагч
  type       text not null check (type in ('join_request', 'join_approved', 'comment', 'helpful', 'proposal', 'session', 'lesson')),
  actor_id   uuid references profiles (id) on delete cascade,
  group_id   uuid references groups (id) on delete cascade,
  entity_id  uuid,
  data       jsonb not null default '{}',
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on notifications (user_id, created_at desc);

alter table notifications enable row level security;
revoke all on notifications from anon, authenticated;
grant select, delete on notifications to authenticated;
grant update (read_at) on notifications to authenticated;

create policy notifications_select_own on notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy notifications_update_own on notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notifications_delete_own on notifications for delete to authenticated
  using (user_id = (select auth.uid()));

-- Нэг хүлээн авагчид. Өөртөө, эсвэл блоклосон хүнээс ирэх мэдэгдлийг алгасна.
create or replace function public._notify(
  p_user uuid, p_type text, p_actor uuid, p_group uuid, p_entity uuid, p_data jsonb default '{}'
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into notifications (user_id, type, actor_id, group_id, entity_id, data)
  select p_user, p_type, p_actor, p_group, p_entity, coalesce(p_data, '{}')
  where p_user is not null
    and p_user is distinct from p_actor
    and not exists (select 1 from user_blocks b where b.blocker_id = p_user and b.blocked_id = p_actor);
$$;

-- Группын бүх идэвхтэй гишүүнд (жүжигчнээс бусад).
create or replace function public._notify_group(
  p_group uuid, p_type text, p_actor uuid, p_entity uuid, p_data jsonb default '{}', p_skip_owner boolean default false
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into notifications (user_id, type, actor_id, group_id, entity_id, data)
  select m.user_id, p_type, p_actor, p_group, p_entity, coalesce(p_data, '{}')
  from group_members m
  where m.group_id = p_group and m.status = 'active'
    and m.user_id is distinct from p_actor
    and (not p_skip_owner or m.role <> 'owner')
    and not exists (select 1 from user_blocks b where b.blocker_id = m.user_id and b.blocked_id = p_actor);
$$;

revoke execute on function public._notify(uuid, text, uuid, uuid, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public._notify_group(uuid, text, uuid, uuid, jsonb, boolean) from public, anon, authenticated;

-- Нэгдэх хүсэлт → эзэнд; зөвшөөрөгдсөн → хүсэлт гаргагчид.
create or replace function public._trg_member_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
  v_name  text;
begin
  select owner_id, name into v_owner, v_name from groups where id = new.group_id;
  if tg_op = 'INSERT' and new.status = 'pending' then
    perform public._notify(v_owner, 'join_request', new.user_id, new.group_id, new.group_id, jsonb_build_object('group', v_name));
  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status = 'active' then
    perform public._notify(new.user_id, 'join_approved', v_owner, new.group_id, new.group_id, jsonb_build_object('group', v_name));
  end if;
  return new;
end;
$$;
create trigger group_members_notify after insert or update of status on group_members
  for each row execute function public._trg_member_notify();

-- Сэтгэгдэл → постын зохиогчид.
create or replace function public._trg_comment_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_post posts%rowtype;
begin
  select * into v_post from posts where id = new.post_id;
  perform public._notify(v_post.author_id, 'comment', new.author_id, v_post.group_id, v_post.id,
                         jsonb_build_object('text', left(new.body, 80)));
  return new;
end;
$$;
create trigger comments_notify after insert on comments
  for each row execute function public._trg_comment_notify();

-- "Тустай" → постын зохиогчид.
create or replace function public._trg_helpful_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_post posts%rowtype;
begin
  select * into v_post from posts where id = new.post_id;
  perform public._notify(v_post.author_id, 'helpful', new.user_id, v_post.group_id, v_post.id, '{}');
  return new;
end;
$$;
create trigger post_helpful_notify after insert on post_helpful
  for each row execute function public._trg_helpful_notify();

-- Санал пост → группын гишүүдэд.
create or replace function public._trg_proposal_notify()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'proposal' then
    perform public._notify_group(new.group_id, 'proposal', new.author_id, new.id,
                                 jsonb_build_object('text', left(new.body, 80)));
  end if;
  return new;
end;
$$;
create trigger posts_notify after insert on posts
  for each row execute function public._trg_proposal_notify();

-- Шинэ сешн → группын гишүүдэд.
create or replace function public._trg_session_notify()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public._notify_group(new.group_id, 'session', new.host_id, new.id,
                               jsonb_build_object('title', new.title, 'starts_at', new.starts_at));
  return new;
end;
$$;
create trigger group_sessions_notify after insert on group_sessions
  for each row execute function public._trg_session_notify();

-- Шинэ хичээл → сургалтын суралцагчдад (багшаас бусад).
create or replace function public._trg_lesson_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
begin
  select owner_id into v_owner from groups where id = new.group_id;
  perform public._notify_group(new.group_id, 'lesson', v_owner, new.id,
                               jsonb_build_object('title', new.title, 'position', new.position), true);
  return new;
end;
$$;
create trigger course_lessons_notify after insert on course_lessons
  for each row execute function public._trg_lesson_notify();

revoke execute on function public._trg_member_notify() from public, anon, authenticated;
revoke execute on function public._trg_comment_notify() from public, anon, authenticated;
revoke execute on function public._trg_helpful_notify() from public, anon, authenticated;
revoke execute on function public._trg_proposal_notify() from public, anon, authenticated;
revoke execute on function public._trg_session_notify() from public, anon, authenticated;
revoke execute on function public._trg_lesson_notify() from public, anon, authenticated;
