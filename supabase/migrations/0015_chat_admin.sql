-- 0015: Чат (шууд + групп), дагагчдын жагсаалт, админ самбар (гомдол, нуух, хориглох, багш баталгаажуулах).
-- Анхаар: устгах (delete) мэдэгдэлгүй — агуулгыг "нуух" (hidden_at) замаар зохицуулна, буцаах боломжтой.

-- =====================================================================
-- Админ, хориг, нуух
-- =====================================================================
create table app_admins (
  user_id    uuid primary key references profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table app_admins enable row level security;
revoke all on app_admins from anon, authenticated;     -- зөвхөн SQL Editor / service role-оор нэмнэ

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from app_admins where user_id = auth.uid());
$$;

alter table profiles add column banned_at timestamptz;          -- client grant-д ороогүй тул өөрөө өөрчилж чадахгүй
alter table posts add column hidden_at timestamptz;
alter table comments add column hidden_at timestamptz;
alter table course_reviews add column hidden_at timestamptz;

alter table user_reports add column resolved_by uuid references profiles (id) on delete set null;
alter table user_reports add column resolved_at timestamptz;

-- Нуусан агуулга хэнд ч харагдахгүй (админ RPC-ээр л харна).
drop policy posts_select on posts;
create policy posts_select on posts for select to authenticated
  using (hidden_at is null and public.is_group_member(group_id));
drop policy comments_select on comments;
create policy comments_select on comments for select to authenticated
  using (hidden_at is null and exists (select 1 from posts p where p.id = post_id));
drop policy reviews_select on course_reviews;
create policy reviews_select on course_reviews for select to authenticated
  using (hidden_at is null and public.can_view_group(group_id));

-- Нуусан үнэлгээ дунджид орохгүй.
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
    'helpful', (select count(*) from post_helpful h join posts p on p.id = h.post_id where p.author_id = p_user_id),
    'rating_avg', (select round(avg(r.rating)::numeric, 1) from course_reviews r join groups g on g.id = r.group_id
                   where g.owner_id = p_user_id and g.deleted_at is null and r.hidden_at is null),
    'rating_count', (select count(*) from course_reviews r join groups g on g.id = r.group_id
                     where g.owner_id = p_user_id and g.deleted_at is null and r.hidden_at is null)
  )
  where exists (select 1 from teacher_profiles t where t.user_id = p_user_id and t.enabled)
$$;

-- =====================================================================
-- Чат
-- =====================================================================
create table conversations (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null check (kind in ('direct', 'group')),
  group_id        uuid unique references groups (id) on delete cascade,
  user_a          uuid references profiles (id) on delete cascade,   -- direct: user_a < user_b
  user_b          uuid references profiles (id) on delete cascade,
  created_at      timestamptz not null default now(),
  last_message_at timestamptz,
  check (
    (kind = 'group' and group_id is not null and user_a is null and user_b is null)
    or (kind = 'direct' and group_id is null and user_a is not null and user_b is not null and user_a < user_b)
  )
);
create unique index conversations_direct_pair on conversations (user_a, user_b) where kind = 'direct';

create table messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations (id) on delete cascade,
  sender_id       uuid not null references profiles (id) on delete cascade,
  body            text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at      timestamptz not null default now(),
  hidden_at       timestamptz
);
create index messages_conversation_idx on messages (conversation_id, created_at desc);

create table conversation_reads (
  conversation_id uuid not null references conversations (id) on delete cascade,
  user_id         uuid not null references profiles (id) on delete cascade,
  last_read_at    timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

-- Харах эрх: direct — хоёр оролцогч; group — идэвхтэй гишүүд.
create or replace function public.can_access_conversation(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from conversations c
    where c.id = cid and (
      (c.kind = 'direct' and auth.uid() in (c.user_a, c.user_b))
      or (c.kind = 'group' and public.is_group_member(c.group_id))
    )
  );
$$;

-- Бичих эрх: харах эрхтэй, хориггүй, direct-д хоёрын хооронд блок байхгүй.
create or replace function public.can_send_message(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_access_conversation(cid)
    and not exists (select 1 from profiles p where p.id = auth.uid() and p.banned_at is not null)
    and not exists (
      select 1 from conversations c
      join user_blocks b on (b.blocker_id = c.user_a and b.blocked_id = c.user_b)
                         or (b.blocker_id = c.user_b and b.blocked_id = c.user_a)
      where c.id = cid and c.kind = 'direct'
    );
$$;

alter table conversations enable row level security;
alter table messages enable row level security;
alter table conversation_reads enable row level security;
revoke all on conversations, messages, conversation_reads from anon, authenticated;
grant select on conversations to authenticated;
grant select, delete on messages to authenticated;
grant insert (conversation_id, sender_id, body) on messages to authenticated;
grant select on conversation_reads to authenticated;

create policy conversations_select on conversations for select to authenticated
  using (public.can_access_conversation(id));
create policy messages_select on messages for select to authenticated
  using (hidden_at is null and public.can_access_conversation(conversation_id));
create policy messages_insert on messages for insert to authenticated
  with check (sender_id = (select auth.uid()) and public.can_send_message(conversation_id));
create policy messages_delete_own on messages for delete to authenticated
  using (sender_id = (select auth.uid()));
create policy reads_select_own on conversation_reads for select to authenticated
  using (user_id = (select auth.uid()));

-- Шинэ мессеж: харилцааны сүүлийн цагийг шинэчилж, илгээгчийн уншсан цагийг тавина.
create or replace function public._on_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update conversations set last_message_at = new.created_at where id = new.conversation_id;
  insert into conversation_reads (conversation_id, user_id, last_read_at)
  values (new.conversation_id, new.sender_id, new.created_at)
  on conflict (conversation_id, user_id) do update set last_read_at = excluded.last_read_at;
  return new;
end $$;
create trigger messages_after_insert after insert on messages
  for each row execute function public._on_message();

-- Хоёр хүний чат: байхгүй бол үүсгэнэ. Блоклосон, устгагдсан, хориглогдсон хүнтэй боломжгүй.
create or replace function public.start_direct_chat(p_user uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_a uuid;
  v_b uuid;
  v_id uuid;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  if p_user is null or p_user = v_me then raise exception 'invalid_user'; end if;
  if not exists (select 1 from profiles where id = p_user and deleted_at is null and banned_at is null) then
    raise exception 'user_not_found';
  end if;
  if exists (
    select 1 from user_blocks b
    where (b.blocker_id = v_me and b.blocked_id = p_user) or (b.blocker_id = p_user and b.blocked_id = v_me)
  ) then
    raise exception 'blocked';
  end if;
  v_a := least(v_me, p_user);
  v_b := greatest(v_me, p_user);
  insert into conversations (kind, user_a, user_b) values ('direct', v_a, v_b)
  on conflict (user_a, user_b) where kind = 'direct' do nothing;
  select id into v_id from conversations where kind = 'direct' and user_a = v_a and user_b = v_b;
  return v_id;
end $$;

-- Группын чат: идэвхтэй гишүүн нээхэд үүснэ.
create or replace function public.group_chat(p_group uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not public.is_group_member(p_group) then raise exception 'not_member'; end if;
  insert into conversations (kind, group_id) values ('group', p_group)
  on conflict (group_id) do nothing;
  select id into v_id from conversations where group_id = p_group;
  return v_id;
end $$;

create or replace function public.mark_conversation_read(p_conversation uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_access_conversation(p_conversation) then raise exception 'forbidden'; end if;
  insert into conversation_reads (conversation_id, user_id, last_read_at)
  values (p_conversation, auth.uid(), now())
  on conflict (conversation_id, user_id) do update set last_read_at = excluded.last_read_at;
end $$;

-- Миний чатууд: сүүлийн мессеж, уншаагүй тоо. Мессежгүй, блоклосон хүнтэй чат харагдахгүй.
create or replace function public.my_conversations()
returns table (
  id uuid, kind text, group_id uuid, title text, avatar_url text, other_id uuid,
  last_body text, last_sender_id uuid, last_at timestamptz, unread bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with mine as (
    select c.*,
           case when c.kind = 'direct' then (case when c.user_a = auth.uid() then c.user_b else c.user_a end) end as other
    from conversations c
    where public.can_access_conversation(c.id)
  )
  select c.id, c.kind, c.group_id,
         coalesce(g.name, op.display_name) as title,
         case when c.kind = 'group' then g.cover_url else op.avatar_url end as avatar_url,
         c.other as other_id,
         lm.body, lm.sender_id, lm.created_at,
         (select count(*) from messages m
          where m.conversation_id = c.id and m.hidden_at is null and m.sender_id <> auth.uid()
            and m.created_at > coalesce(r.last_read_at, '-infinity'::timestamptz)
            and not exists (select 1 from user_blocks b where b.blocker_id = auth.uid() and b.blocked_id = m.sender_id)
         ) as unread
  from mine c
  left join groups g on g.id = c.group_id
  left join profiles op on op.id = c.other
  left join conversation_reads r on r.conversation_id = c.id and r.user_id = auth.uid()
  join lateral (
    select m.body, m.sender_id, m.created_at from messages m
    where m.conversation_id = c.id and m.hidden_at is null
      and not exists (select 1 from user_blocks b where b.blocker_id = auth.uid() and b.blocked_id = m.sender_id)
    order by m.created_at desc
    limit 1
  ) lm on true
  where (c.kind = 'group' and g.deleted_at is null)
     or (c.kind = 'direct' and op.deleted_at is null
         and not exists (select 1 from user_blocks b where b.blocker_id = auth.uid() and b.blocked_id = c.other))
  order by lm.created_at desc
  limit 200;
$$;

create or replace function public.unread_chat_count()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(unread), 0)::bigint from public.my_conversations();
$$;

-- Мессежийг мэдээлэх боломжтой.
alter table user_reports drop constraint user_reports_target_type_check;
alter table user_reports add constraint user_reports_target_type_check
  check (target_type in ('profile', 'group', 'goal', 'post', 'comment', 'review', 'message'));

-- Realtime (Supabase дээр): шинэ мессеж шууд ирнэ. RLS-ийн дагуу зөвхөн эрхтэй хүнд.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table messages;
  end if;
end $$;

-- =====================================================================
-- Дагагч / дагаж буй жагсаалт
-- =====================================================================
create or replace function public.follow_list(p_user uuid, p_kind text)
returns table (
  id uuid, username text, display_name text, avatar_url text, i_follow boolean, verified boolean, followed_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.username, p.display_name, p.avatar_url,
         exists (select 1 from follows x where x.follower_id = auth.uid() and x.followee_id = p.id),
         exists (select 1 from teacher_profiles t where t.user_id = p.id and t.verified_at is not null),
         f.created_at
  from follows f
  join profiles p on p.id = case when p_kind = 'followers' then f.follower_id else f.followee_id end
  where auth.uid() is not null
    and p_kind in ('followers', 'following')
    and (case when p_kind = 'followers' then f.followee_id else f.follower_id end) = p_user
    and p.deleted_at is null
    and p.banned_at is null
    and not exists (
      select 1 from user_blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = p.id) or (b.blocker_id = p.id and b.blocked_id = auth.uid())
    )
  order by f.created_at desc
  limit 500;
$$;

-- Хүн хайх: хориглогдсон хэрэглэгч гарахгүй.
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
    and p.banned_at is null
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

-- profile_stats + админ мэдээлэл (viewer_admin, banned, is_admin).
create or replace function public.profile_stats(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_admin boolean := public.is_admin();
  v jsonb;
begin
  if v_me is null then
    raise exception 'not_authenticated';
  end if;
  if not exists (select 1 from profiles where id = p_user and deleted_at is null) then
    return null;
  end if;

  v := jsonb_build_object(
    'posts', (select count(*) from posts where author_id = p_user and hidden_at is null),
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
    ),
    'viewer_admin', v_admin
  );

  if v_admin then
    v := v || jsonb_build_object('banned', exists (select 1 from profiles where id = p_user and banned_at is not null));
  end if;

  if p_user = v_me then
    v := v || jsonb_build_object(
      'is_admin', v_admin,
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

-- =====================================================================
-- Админ RPC-ууд (бүгд is_admin() шалгана)
-- =====================================================================
create or replace function public._require_admin()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
end $$;

create or replace function public.admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public._require_admin();
  return jsonb_build_object(
    'open_reports', (select count(*) from user_reports where status in ('open', 'reviewing')),
    'users', (select count(*) from profiles where deleted_at is null),
    'new_users_7d', (select count(*) from profiles where deleted_at is null and created_at > now() - interval '7 days'),
    'banned', (select count(*) from profiles where banned_at is not null),
    'groups', (select count(*) from groups where deleted_at is null),
    'posts_7d', (select count(*) from posts where created_at > now() - interval '7 days'),
    'messages_7d', (select count(*) from messages where created_at > now() - interval '7 days'),
    'pending_teachers', (select count(*) from teacher_profiles where enabled and verified_at is null)
  );
end $$;

-- Гомдлууд: зорилтот агуулгын товч мэдээлэлтэй.
create or replace function public.admin_reports(p_status text default 'open', p_limit int default 100)
returns table (
  id uuid, target_type text, target_id uuid, reason text, status text, created_at timestamptz,
  reporter_name text, reports_on_target bigint,
  target_title text, target_body text, target_owner uuid, target_owner_name text,
  target_hidden boolean, owner_banned boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public._require_admin();
  return query
  select r.id, r.target_type, r.target_id, r.reason, r.status, r.created_at,
         rp.display_name,
         (select count(*) from user_reports x where x.target_type = r.target_type and x.target_id = r.target_id),
         t.title, t.body, t.owner, op.display_name, coalesce(t.hidden, false), op.banned_at is not null
  from user_reports r
  left join profiles rp on rp.id = r.reporter_id
  left join lateral (
    select p.id as owner, p.display_name as title, '@' || p.username || coalesce(' · ' || p.bio, '') as body, false as hidden
    from profiles p where r.target_type = 'profile' and p.id = r.target_id
    union all
    select g.owner_id, g.name, g.description, g.deleted_at is not null
    from groups g where r.target_type = 'group' and g.id = r.target_id
    union all
    select go.user_id, go.title, null::text, false
    from goals go where r.target_type = 'goal' and go.id = r.target_id
    union all
    select po.author_id, gr.name, po.body, po.hidden_at is not null
    from posts po join groups gr on gr.id = po.group_id where r.target_type = 'post' and po.id = r.target_id
    union all
    select c.author_id, null::text, c.body, c.hidden_at is not null
    from comments c where r.target_type = 'comment' and c.id = r.target_id
    union all
    select cr.user_id, repeat('★', cr.rating), cr.comment, cr.hidden_at is not null
    from course_reviews cr where r.target_type = 'review' and cr.id = r.target_id
    union all
    select m.sender_id, null::text, m.body, m.hidden_at is not null
    from messages m where r.target_type = 'message' and m.id = r.target_id
  ) t on true
  left join profiles op on op.id = t.owner
  where (p_status = 'all' or r.status = p_status or (p_status = 'open' and r.status = 'reviewing'))
  order by r.created_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 300);
end $$;

create or replace function public.admin_set_report_status(p_report uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._require_admin();
  if p_status not in ('open', 'reviewing', 'resolved', 'dismissed') then raise exception 'invalid_status'; end if;
  update user_reports
     set status = p_status,
         resolved_by = case when p_status in ('resolved', 'dismissed') then auth.uid() end,
         resolved_at = case when p_status in ('resolved', 'dismissed') then now() end
   where id = p_report;
end $$;

-- Агуулга нуух / сэргээх. Нуухад тухайн агуулгын нээлттэй гомдлууд "шийдсэн" болно.
create or replace function public.admin_hide_content(p_type text, p_id uuid, p_hidden boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_at timestamptz := case when p_hidden then now() end;
begin
  perform public._require_admin();
  if p_type = 'post' then
    update posts set hidden_at = v_at where id = p_id;
  elsif p_type = 'comment' then
    update comments set hidden_at = v_at where id = p_id;
  elsif p_type = 'review' then
    update course_reviews set hidden_at = v_at where id = p_id;
  elsif p_type = 'message' then
    update messages set hidden_at = v_at where id = p_id;
  else
    raise exception 'invalid_type';
  end if;
  if p_hidden then
    update user_reports set status = 'resolved', resolved_by = auth.uid(), resolved_at = now()
     where target_type = p_type and target_id = p_id and status in ('open', 'reviewing');
  end if;
end $$;

-- Хэрэглэгч хориглох / сэргээх. Auth талд ч нэвтрэхийг хаана (token шинэчлэгдэхгүй).
create or replace function public.admin_set_ban(p_user uuid, p_banned boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._require_admin();
  if p_user = auth.uid() then raise exception 'cannot_ban_self'; end if;
  if exists (select 1 from app_admins where user_id = p_user) then raise exception 'cannot_ban_admin'; end if;
  update profiles set banned_at = case when p_banned then now() end where id = p_user;
  begin
    update auth.users set banned_until = case when p_banned then 'infinity'::timestamptz end where id = p_user;
  exception when insufficient_privilege or undefined_column then
    null;  -- Auth талд эрхгүй бол апп талын хориг хангалттай
  end;
  if p_banned then
    update user_reports set status = 'resolved', resolved_by = auth.uid(), resolved_at = now()
     where target_type = 'profile' and target_id = p_user and status in ('open', 'reviewing');
  end if;
end $$;

-- Багш нар: баталгаажуулах хүлээгдэж буй (эсвэл бүгд).
create or replace function public.admin_teachers(p_pending_only boolean default true)
returns table (
  user_id uuid, display_name text, username text, avatar_url text, headline text, subjects text[],
  intro text, verified_at timestamptz, courses bigint, rating_avg numeric, rating_count bigint, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public._require_admin();
  return query
  select t.user_id, p.display_name, p.username, p.avatar_url, t.headline, t.subjects, t.intro, t.verified_at,
         (select count(*) from groups g where g.owner_id = t.user_id and g.kind = 'course' and g.deleted_at is null),
         (select round(avg(r.rating)::numeric, 1) from course_reviews r join groups g on g.id = r.group_id
           where g.owner_id = t.user_id and r.hidden_at is null),
         (select count(*) from course_reviews r join groups g on g.id = r.group_id
           where g.owner_id = t.user_id and r.hidden_at is null),
         t.created_at
  from teacher_profiles t
  join profiles p on p.id = t.user_id and p.deleted_at is null
  where t.enabled and (not p_pending_only or t.verified_at is null)
  order by t.created_at desc
  limit 300;
end $$;

create or replace function public.admin_verify_teacher(p_user uuid, p_verified boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._require_admin();
  update teacher_profiles set verified_at = case when p_verified then now() end where user_id = p_user;
end $$;

-- ---------- Эрх ----------
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.can_access_conversation(uuid) from public, anon;
revoke execute on function public.can_send_message(uuid) from public, anon;
revoke execute on function public._on_message() from public, anon, authenticated;
revoke execute on function public.start_direct_chat(uuid) from public, anon;
revoke execute on function public.group_chat(uuid) from public, anon;
revoke execute on function public.mark_conversation_read(uuid) from public, anon;
revoke execute on function public.my_conversations() from public, anon;
revoke execute on function public.unread_chat_count() from public, anon;
revoke execute on function public.follow_list(uuid, text) from public, anon;
revoke execute on function public._require_admin() from public, anon;
revoke execute on function public.admin_overview() from public, anon;
revoke execute on function public.admin_reports(text, int) from public, anon;
revoke execute on function public.admin_set_report_status(uuid, text) from public, anon;
revoke execute on function public.admin_hide_content(text, uuid, boolean) from public, anon;
revoke execute on function public.admin_set_ban(uuid, boolean) from public, anon;
revoke execute on function public.admin_teachers(boolean) from public, anon;
revoke execute on function public.admin_verify_teacher(uuid, boolean) from public, anon;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.can_access_conversation(uuid) to authenticated;
grant execute on function public.can_send_message(uuid) to authenticated;
grant execute on function public.start_direct_chat(uuid) to authenticated;
grant execute on function public.group_chat(uuid) to authenticated;
grant execute on function public.mark_conversation_read(uuid) to authenticated;
grant execute on function public.my_conversations() to authenticated;
grant execute on function public.unread_chat_count() to authenticated;
grant execute on function public.follow_list(uuid, text) to authenticated;
grant execute on function public.admin_overview() to authenticated;
grant execute on function public.admin_reports(text, int) to authenticated;
grant execute on function public.admin_set_report_status(uuid, text) to authenticated;
grant execute on function public.admin_hide_content(text, uuid, boolean) to authenticated;
grant execute on function public.admin_set_ban(uuid, boolean) to authenticated;
grant execute on function public.admin_teachers(boolean) to authenticated;
grant execute on function public.admin_verify_teacher(uuid, boolean) to authenticated;
