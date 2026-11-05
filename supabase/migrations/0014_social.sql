-- 0014: Дагах (follows), хадгалсан пост (post_saves), профайл/группын статистик, хүн хайх.
-- Блок: блоклосон хосын хооронд дагах боломжгүй; хайлт, тоонд блоклосон хүмүүс орохгүй.

-- ---------- follows ----------
create table follows (
  follower_id uuid not null references profiles (id) on delete cascade,
  followee_id uuid not null references profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index follows_followee_idx on follows (followee_id);

alter table follows enable row level security;
revoke all on follows from anon, authenticated;
grant select, insert, delete on follows to authenticated;

create policy follows_select on follows for select to authenticated using (true);
create policy follows_insert_own on follows for insert to authenticated
  with check (
    follower_id = (select auth.uid())
    and exists (select 1 from profiles p where p.id = followee_id and p.deleted_at is null)
    and not exists (
      select 1 from user_blocks b
      where (b.blocker_id = follower_id and b.blocked_id = followee_id)
         or (b.blocker_id = followee_id and b.blocked_id = follower_id)
    )
  );
create policy follows_delete_own on follows for delete to authenticated
  using (follower_id = (select auth.uid()));

-- Дагахад мэдэгдэл.
alter table notifications drop constraint notifications_type_check;
alter table notifications add constraint notifications_type_check
  check (type in ('join_request', 'join_approved', 'comment', 'helpful', 'proposal', 'session', 'lesson', 'follow'));

create or replace function public._on_follow()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._notify(new.followee_id, 'follow', new.follower_id, null, null, '{}');
  return new;
end $$;
create trigger follows_notify after insert on follows
  for each row execute function public._on_follow();

-- ---------- post_saves (хадгалсан пост) ----------
-- Пост зөвхөн группын гишүүдэд харагддаг тул хадгалах нь ч гишүүнд.
create table post_saves (
  user_id    uuid not null references profiles (id) on delete cascade,
  post_id    uuid not null references posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

alter table post_saves enable row level security;
revoke all on post_saves from anon, authenticated;
grant select, insert, delete on post_saves to authenticated;

create policy saves_select_own on post_saves for select to authenticated
  using (user_id = (select auth.uid()));
create policy saves_insert_own on post_saves for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from posts p where p.id = post_id and public.is_group_member(p.group_id))
  );
create policy saves_delete_own on post_saves for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------- Профайлын статистик ----------
-- Бусдын профайл: нийтлэл, дагагч, дагаж буй, групп, баталгаажсан багш эсэх, би дагаж байгаа эсэх.
-- Өөрийн профайл дээр нэмэлтээр амжилтын тоонууд (зорилго, check-in, тустай тэмдэг, хадгалсан, таалагдсан).
create or replace function public.profile_stats(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v jsonb;
begin
  if v_me is null then
    raise exception 'not_authenticated';
  end if;
  if not exists (select 1 from profiles where id = p_user and deleted_at is null) then
    return null;
  end if;

  v := jsonb_build_object(
    'posts', (select count(*) from posts where author_id = p_user),
    'followers', (
      select count(*) from follows f
      join profiles p on p.id = f.follower_id and p.deleted_at is null
      where f.followee_id = p_user
    ),
    'following', (
      select count(*) from follows f
      join profiles p on p.id = f.followee_id and p.deleted_at is null
      where f.follower_id = p_user
    ),
    'groups', (
      select count(*) from group_members m
      join groups g on g.id = m.group_id and g.deleted_at is null
      where m.user_id = p_user and m.status = 'active'
    ),
    'verified', exists (select 1 from teacher_profiles t where t.user_id = p_user and t.verified_at is not null),
    'i_follow', exists (select 1 from follows where follower_id = v_me and followee_id = p_user),
    'blocked', exists (
      select 1 from user_blocks b
      where (b.blocker_id = v_me and b.blocked_id = p_user) or (b.blocker_id = p_user and b.blocked_id = v_me)
    )
  );

  if p_user = v_me then
    v := v || jsonb_build_object(
      'goals_done', (select count(*) from goal_completions where user_id = v_me),
      'checkins', (select count(*) from challenge_checkins where user_id = v_me),
      'challenges_done', (select count(*) from challenge_participants where user_id = v_me and completed_at is not null),
      'helpful_received', (
        select count(*) from post_helpful h join posts p on p.id = h.post_id
        where p.author_id = v_me and h.user_id <> v_me
      ),
      'lessons_done', (select count(*) from lesson_completions where user_id = v_me),
      'liked', (select count(*) from post_helpful where user_id = v_me),
      'saved', (select count(*) from post_saves where user_id = v_me)
    );
  end if;
  return v;
end $$;

-- ---------- Хүн хайх ----------
-- p_query хоосон бол "онцлох хүмүүс" (дагагч олонтой, дараа нь шинэ). Өөрийгөө, блоклосон хосыг хасна.
create or replace function public.search_people(p_query text default null, p_limit int default 20)
returns table (
  id uuid, username text, display_name text, avatar_url text, followers bigint, i_follow boolean, verified boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.username, p.display_name, p.avatar_url,
         (select count(*) from follows f where f.followee_id = p.id) as followers,
         exists (select 1 from follows f where f.follower_id = auth.uid() and f.followee_id = p.id) as i_follow,
         exists (select 1 from teacher_profiles t where t.user_id = p.id and t.verified_at is not null) as verified
  from profiles p
  where auth.uid() is not null
    and p.deleted_at is null
    and p.id <> auth.uid()
    and not exists (
      select 1 from user_blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = p.id) or (b.blocker_id = p.id and b.blocked_id = auth.uid())
    )
    and (
      coalesce(btrim(p_query), '') = ''
      or p.username ilike '%' || replace(replace(btrim(p_query), '%', ''), '_', '\_') || '%'
      or p.display_name ilike '%' || replace(replace(btrim(p_query), '%', ''), '_', '\_') || '%'
    )
  order by followers desc, p.created_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

-- ---------- Группын картын мэдээлэл ----------
-- Гишүүдийн тоо + эхний 3 гишүүний нэр/зураг. Зөвхөн харах эрхтэй группууд.
create or replace function public.group_stats(p_ids uuid[])
returns table (group_id uuid, members bigint, preview jsonb)
language sql
stable
security definer
set search_path = public
as $$
  select g.id,
         (select count(*) from group_members m where m.group_id = g.id and m.status = 'active'),
         coalesce((
           select jsonb_agg(jsonb_build_object('name', x.display_name, 'url', x.avatar_url))
           from (
             select p.display_name, p.avatar_url
             from group_members m
             join profiles p on p.id = m.user_id and p.deleted_at is null
             where m.group_id = g.id and m.status = 'active'
               and not exists (select 1 from user_blocks b where b.blocker_id = auth.uid() and b.blocked_id = m.user_id)
             order by (p.avatar_url is null), (m.role = 'owner') desc, m.joined_at
             limit 3
           ) x
         ), '[]'::jsonb)
  from groups g
  where g.id = any (p_ids)
    and auth.uid() is not null
    and public.can_view_group(g.id);
$$;

revoke execute on function public.profile_stats(uuid) from public, anon;
revoke execute on function public.search_people(text, int) from public, anon;
revoke execute on function public.group_stats(uuid[]) from public, anon;
revoke execute on function public._on_follow() from public, anon, authenticated;
grant execute on function public.profile_stats(uuid) to authenticated;
grant execute on function public.search_people(text, int) to authenticated;
grant execute on function public.group_stats(uuid[]) to authenticated;
