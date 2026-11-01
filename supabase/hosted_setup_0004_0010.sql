-- TOGETHER: үлдсэн migration 0004–0010 (0001–0003 аль хэдийн орсон).
-- Supabase Dashboard → SQL Editor → New query → бүгдийг буулгаад Run.
begin;

-- ===================== 0004_groups.sql =====================
-- 0004: Group үүсгэх, нэгдэх, зөвшөөрөх. Гишүүнчлэлийг сервер талд (security definer) бичнэ.

-- Client шууд group_members-д insert хийхгүй. Бүх урсгал функцээр.
-- groups-д client insert эрх өгөхгүй: эзэн гишүүнчлэлгүй group үүсэхээс сэргийлнэ.
revoke insert on group_members from authenticated, anon;
revoke insert on groups from authenticated, anon;

-- Group үүсгэх: group + эзнийг owner гишүүнээр атомаар.
create or replace function public.create_group(
  p_name text,
  p_slug text,
  p_description text default null,
  p_visibility group_visibility default 'public',
  p_join_policy join_policy default 'open'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_group uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if char_length(trim(p_name)) not between 2 and 60 then raise exception 'invalid_name'; end if;
  if p_slug !~ '^[a-z0-9-]{3,40}$' then raise exception 'invalid_slug'; end if;

  insert into groups (owner_id, name, slug, description, visibility, join_policy)
  values (v_uid, trim(p_name), p_slug, p_description, p_visibility, p_join_policy)
  returning id into v_group;

  insert into group_members (group_id, user_id, role, status)
  values (v_group, v_uid, 'owner', 'active');

  return v_group;
exception
  when unique_violation then raise exception 'slug_taken';
end;
$$;

-- Нэгдэх. Үр дүн: 'active' (шууд орсон) эсвэл 'pending' (зөвшөөрөл хүлээж байна).
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

  select * into v_existing from group_members
  where group_id = p_group_id and user_id = v_uid;

  if found then
    if v_existing.status = 'banned' then raise exception 'banned'; end if;
    if v_existing.status = 'active' then raise exception 'already_member'; end if;
    return v_existing.status::text; -- pending хэвээр
  end if;

  if v_group.join_policy = 'invite_only' then raise exception 'invite_only'; end if;

  -- Private group нь open байсан ч зөвшөөрөл шаардана.
  if v_group.join_policy = 'open' and v_group.visibility = 'public' then
    v_status := 'active';
  else
    v_status := 'pending';
  end if;

  insert into group_members (group_id, user_id, role, status)
  values (p_group_id, v_uid, 'member', v_status);

  return v_status::text;
end;
$$;

-- Эзэн: хүсэлт зөвшөөрөх эсвэл татгалзах (татгалзахад мөр устгана).
create or replace function public.review_join_request(
  p_group_id uuid,
  p_user_id uuid,
  p_approve boolean
)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_group_owner(p_group_id) then raise exception 'not_owner'; end if;

  if p_approve then
    update group_members set status = 'active'
    where group_id = p_group_id and user_id = p_user_id and status = 'pending';
    if not found then raise exception 'request_not_found'; end if;
    return 'active';
  else
    delete from group_members
    where group_id = p_group_id and user_id = p_user_id and status = 'pending';
    if not found then raise exception 'request_not_found'; end if;
    return 'rejected';
  end if;
end;
$$;

-- Гарах: эзэн гарч чадахгүй (group-ийг эхлээд шилжүүлэх ёстой).
create or replace function public.leave_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if public.is_group_owner(p_group_id) then raise exception 'owner_cannot_leave'; end if;

  delete from group_members where group_id = p_group_id and user_id = v_uid;
end;
$$;

-- Функцүүдийг зөвхөн нэвтэрсэн хэрэглэгч ажиллуулна.
revoke execute on function public.create_group(text, text, text, group_visibility, join_policy) from public, anon;
revoke execute on function public.join_group(uuid) from public, anon;
revoke execute on function public.review_join_request(uuid, uuid, boolean) from public, anon;
revoke execute on function public.leave_group(uuid) from public, anon;
grant execute on function public.create_group(text, text, text, group_visibility, join_policy) to authenticated;
grant execute on function public.join_group(uuid) to authenticated;
grant execute on function public.review_join_request(uuid, uuid, boolean) to authenticated;
grant execute on function public.leave_group(uuid) to authenticated;

-- ===================== 0005_invites_account.sql =====================
-- 0005: Group-ийн урилгын код, бүртгэл устгах.

-- ---------- Урилгын код ----------
create table group_invites (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references groups (id) on delete cascade,
  code       text unique not null,
  created_by uuid not null references profiles (id) on delete cascade,
  expires_at timestamptz not null default now() + interval '7 days',
  max_uses   int not null default 50 check (max_uses > 0),
  uses       int not null default 0 check (uses >= 0),
  created_at timestamptz not null default now()
);

alter table group_invites enable row level security;
revoke all on group_invites from authenticated, anon;
grant select on group_invites to authenticated;

create policy invites_select_owner on group_invites for select to authenticated
  using (public.is_group_owner(group_id));

-- Эзэн 8 тэмдэгттэй код үүсгэнэ (7 хоног, 50 удаа).
create or replace function public.create_group_invite(p_group_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_code text;
  i      int;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not public.is_group_owner(p_group_id) then raise exception 'not_owner'; end if;

  for i in 1..5 loop
    v_code := upper(substr(md5(gen_random_uuid()::text), 1, 8));
    begin
      insert into group_invites (group_id, code, created_by)
      values (p_group_id, v_code, v_uid);
      return v_code;
    exception when unique_violation then
      -- давхардвал дахин оролдоно
    end;
  end loop;
  raise exception 'code_generation_failed';
end;
$$;

-- Код ашиглаж нэгдэх: invite_only / private group-д шууд active гишүүн болно.
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

  select * into v_invite from group_invites
  where code = upper(trim(p_code))
  for update;

  if not found then raise exception 'invalid_code'; end if;
  if v_invite.expires_at < now() then raise exception 'invite_expired'; end if;
  if v_invite.uses >= v_invite.max_uses then raise exception 'invite_exhausted'; end if;

  select * into v_existing from group_members
  where group_id = v_invite.group_id and user_id = v_uid;

  if found then
    if v_existing.status = 'banned' then raise exception 'banned'; end if;
    if v_existing.status = 'active' then return v_invite.group_id; end if;
    update group_members set status = 'active'
    where group_id = v_invite.group_id and user_id = v_uid;
  else
    insert into group_members (group_id, user_id, role, status)
    values (v_invite.group_id, v_uid, 'member', 'active');
  end if;

  update group_invites set uses = uses + 1 where id = v_invite.id;
  return v_invite.group_id;
end;
$$;

-- ---------- Бүртгэл устгах (App Store / Google Play шаардлага) ----------
-- Эзэмшдэг group-ууд устна; бусад өгөгдөл profiles-ийн cascade-аар устна.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  delete from groups where owner_id = v_uid;
  delete from auth.users where id = v_uid;
end;
$$;

revoke execute on function public.create_group_invite(uuid) from public, anon;
revoke execute on function public.redeem_group_invite(text) from public, anon;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.create_group_invite(uuid) to authenticated;
grant execute on function public.redeem_group_invite(text) to authenticated;
grant execute on function public.delete_my_account() to authenticated;

-- ===================== 0006_challenges.sql =====================
-- 0006: Group challenge — өдөр бүрийн check-in (+25 XP), бүгдийг биелүүлбэл +200 XP.
-- Бүх бичилт security definer функцээр. Rank / leaderboard байхгүй (шийдвэр).

-- ---------- helpers ----------
create or replace function public.level_for_xp(p_xp int)
returns int language sql immutable as $$
  select floor(sqrt(greatest(p_xp, 0) / 100.0))::int + 1
$$;

-- Group-ийг харах эрх: нийтийн, эзэн эсвэл идэвхтэй гишүүн.
create or replace function public.can_view_group(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from groups g
    where g.id = gid and g.deleted_at is null
      and (g.visibility = 'public' or g.owner_id = auth.uid())
  ) or public.is_group_member(gid);
$$;

-- Хэрэглэгчийн timezone-оор өнөөдөр.
create or replace function public._user_today(p_uid uuid)
returns date
language sql
stable
security definer
set search_path = public
as $$
  select (now() at time zone coalesce(
    (select p.timezone from profiles p where p.id = p_uid), 'Asia/Ulaanbaatar'))::date
$$;

-- XP нийлбэр, түвшинг шинэчилнэ (streak-д хүрэхгүй — streak нь зорилгын биелэлтээр).
create or replace function public._sync_xp(p_uid uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total int;
  v_level int;
begin
  select coalesce(sum(x.amount), 0) into v_total from xp_transactions x where x.user_id = p_uid;
  v_level := public.level_for_xp(v_total);
  insert into user_progress (user_id, total_xp, current_level)
  values (p_uid, v_total, v_level)
  on conflict (user_id) do update set
    total_xp = excluded.total_xp,
    current_level = excluded.current_level,
    updated_at = now();
  return jsonb_build_object('total_xp', v_total, 'level', v_level);
end;
$$;

-- ---------- tables ----------
create table challenges (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references groups (id) on delete cascade,
  creator_id  uuid references profiles (id) on delete set null,  -- үүсгэгч устсан ч challenge үлдэнэ
  title       text not null check (char_length(title) between 2 and 80),
  description text check (char_length(description) <= 500),
  start_on    date not null,
  end_on      date not null,
  created_at  timestamptz not null default now(),
  check (end_on >= start_on and end_on - start_on <= 89)
);
create index challenges_group_idx on challenges (group_id, start_on desc);

create table challenge_participants (
  challenge_id uuid not null references challenges (id) on delete cascade,
  user_id      uuid not null references profiles (id) on delete cascade,
  joined_at    timestamptz not null default now(),
  completed_at timestamptz,
  primary key (challenge_id, user_id)
);

-- Гарч дахин нэгдсэн ч check-in устахгүй: XP-г давхар авахаас сэргийлнэ.
create table challenge_checkins (
  id           uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references challenges (id) on delete cascade,
  user_id      uuid not null references profiles (id) on delete cascade,
  checked_on   date not null,
  created_at   timestamptz not null default now(),
  unique (challenge_id, user_id, checked_on)
);
create index challenge_checkins_user_idx on challenge_checkins (user_id, checked_on);

alter table challenges enable row level security;
alter table challenge_participants enable row level security;
alter table challenge_checkins enable row level security;

revoke insert, update, delete on challenges, challenge_participants, challenge_checkins from authenticated, anon;

create policy challenges_select on challenges for select to authenticated
  using (public.can_view_group(group_id));
create policy cp_select on challenge_participants for select to authenticated
  using (exists (select 1 from challenges c where c.id = challenge_id and public.can_view_group(c.group_id)));
create policy cc_select on challenge_checkins for select to authenticated
  using (exists (select 1 from challenges c where c.id = challenge_id and public.can_view_group(c.group_id)));

-- ---------- functions ----------
create or replace function public.create_challenge(
  p_group_id uuid,
  p_title text,
  p_description text,
  p_start_on date,
  p_days int
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_today date;
  v_id    uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not public.is_group_member(p_group_id) then raise exception 'not_member'; end if;
  if char_length(trim(coalesce(p_title, ''))) not between 2 and 80 then raise exception 'invalid_title'; end if;
  if p_days is null or p_days not between 1 and 90 then raise exception 'invalid_duration'; end if;

  v_today := public._user_today(v_uid);
  if p_start_on is null or p_start_on < v_today or p_start_on > v_today + 30 then
    raise exception 'invalid_start';
  end if;

  insert into challenges (group_id, creator_id, title, description, start_on, end_on)
  values (p_group_id, v_uid, trim(p_title), nullif(trim(p_description), ''), p_start_on, p_start_on + p_days - 1)
  returning id into v_id;

  insert into challenge_participants (challenge_id, user_id) values (v_id, v_uid);
  return v_id;
end;
$$;

create or replace function public.join_challenge(p_challenge_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_c   challenges%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_c from challenges where id = p_challenge_id;
  if not found then raise exception 'challenge_not_found'; end if;
  if not public.is_group_member(v_c.group_id) then raise exception 'not_member'; end if;
  if v_c.end_on < public._user_today(v_uid) then raise exception 'challenge_ended'; end if;

  insert into challenge_participants (challenge_id, user_id)
  values (p_challenge_id, v_uid)
  on conflict do nothing;
end;
$$;

create or replace function public.leave_challenge(p_challenge_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  delete from challenge_participants where challenge_id = p_challenge_id and user_id = auth.uid();
end;
$$;

-- Өнөөдөр эсвэл өчигдрийн check-in. Бүх өдөр биелбэл нэг удаа +200.
create or replace function public.checkin_challenge(p_challenge_id uuid, p_checked_on date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_c       challenges%rowtype;
  v_p       challenge_participants%rowtype;
  v_today   date;
  v_checkin uuid;
  v_done    int;
  v_total   int;
  v_gained  int := 25;
  v_sync    jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select * into v_c from challenges where id = p_challenge_id;
  if not found then raise exception 'challenge_not_found'; end if;

  select * into v_p from challenge_participants
  where challenge_id = p_challenge_id and user_id = v_uid;
  if not found then raise exception 'not_participant'; end if;
  if not public.is_group_member(v_c.group_id) then raise exception 'not_member'; end if;

  v_today := public._user_today(v_uid);
  if p_checked_on is null or p_checked_on not in (v_today, v_today - 1) then
    raise exception 'date_out_of_range';
  end if;
  if p_checked_on < v_c.start_on or p_checked_on > v_c.end_on then
    raise exception 'outside_challenge';
  end if;

  insert into challenge_checkins (challenge_id, user_id, checked_on)
  values (p_challenge_id, v_uid, p_checked_on)
  on conflict (challenge_id, user_id, checked_on) do nothing
  returning id into v_checkin;
  if v_checkin is null then raise exception 'already_checked_in'; end if;

  insert into xp_transactions (user_id, source_type, source_id, amount)
  values (v_uid, 'challenge_checkin', v_checkin, 25)
  on conflict (user_id, source_type, source_id) do nothing;

  select count(*) into v_done from challenge_checkins
  where challenge_id = p_challenge_id and user_id = v_uid;
  v_total := v_c.end_on - v_c.start_on + 1;

  if v_done >= v_total then
    update challenge_participants set completed_at = coalesce(completed_at, now())
    where challenge_id = p_challenge_id and user_id = v_uid;

    insert into xp_transactions (user_id, source_type, source_id, amount)
    values (v_uid, 'challenge_complete', p_challenge_id, 200)
    on conflict (user_id, source_type, source_id) do nothing;
    if found then v_gained := v_gained + 200; end if;
  end if;

  v_sync := public._sync_xp(v_uid);

  return v_sync || jsonb_build_object(
    'xp_gained', v_gained,
    'completed', v_done >= v_total,
    'days_done', v_done,
    'days_total', v_total
  );
end;
$$;

-- Дотоод helper-уудыг client дуудахгүй.
revoke execute on function public._sync_xp(uuid) from public, anon, authenticated;
revoke execute on function public._user_today(uuid) from public, anon, authenticated;

revoke execute on function public.create_challenge(uuid, text, text, date, int) from public, anon;
revoke execute on function public.join_challenge(uuid) from public, anon;
revoke execute on function public.leave_challenge(uuid) from public, anon;
revoke execute on function public.checkin_challenge(uuid, date) from public, anon;
grant execute on function public.create_challenge(uuid, text, text, date, int) to authenticated;
grant execute on function public.join_challenge(uuid) to authenticated;
grant execute on function public.leave_challenge(uuid) to authenticated;
grant execute on function public.checkin_challenge(uuid, date) to authenticated;

-- ===================== 0007_feed.sql =====================
-- 0007: Group feed — хуваалцах / санал / асуулт пост, файл (зураг, PDF), сэтгэгдэл,
-- "Тустай" тэмдэг (3 хүн дарвал зохиогч +15 XP), саналын хариулт.
-- Зөвхөн group-ийн идэвхтэй гишүүд харна (бүх насны платформ тул гаднаас нээлттэй биш).

create type post_kind as enum ('share', 'proposal', 'question');
create type proposal_vote as enum ('support', 'against', 'question');

-- Буруу текстийг uuid болгох гэж алдаа шидэхгүй (storage path шалгахад).
create or replace function public.safe_uuid(t text)
returns uuid language sql immutable as $$
  select case
    when t ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then t::uuid
  end
$$;

-- ---------- tables ----------
create table posts (
  id            uuid primary key default gen_random_uuid(),
  group_id      uuid not null references groups (id) on delete cascade,
  author_id     uuid not null references profiles (id) on delete cascade,
  kind          post_kind not null default 'share',
  body          text not null check (char_length(body) between 1 and 4000),
  link_url      text check (link_url ~* '^https?://' and char_length(link_url) <= 500),
  vote_deadline timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (kind = 'proposal' or vote_deadline is null)
);
create index posts_group_idx on posts (group_id, created_at desc);

-- Файлын зам: {group_id}/{post_id}/{нэр}
create table post_attachments (
  id           uuid primary key default gen_random_uuid(),
  post_id      uuid not null references posts (id) on delete cascade,
  storage_path text not null unique check (char_length(storage_path) <= 300),
  mime_type    text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  file_name    text not null check (char_length(file_name) between 1 and 200),
  size_bytes   int not null check (size_bytes between 1 and 20971520),
  position     int not null default 0,
  created_at   timestamptz not null default now()
);

create table comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references posts (id) on delete cascade,
  author_id  uuid not null references profiles (id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index comments_post_idx on comments (post_id, created_at);

create table post_helpful (
  post_id    uuid not null references posts (id) on delete cascade,
  user_id    uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table proposal_votes (
  post_id    uuid not null references posts (id) on delete cascade,
  user_id    uuid not null references profiles (id) on delete cascade,
  vote       proposal_vote not null,
  updated_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create trigger posts_touch before update on posts
  for each row execute function public.touch_updated_at();

-- Report: пост, сэтгэгдэл мэдээлэх
alter table user_reports drop constraint user_reports_target_type_check;
alter table user_reports add constraint user_reports_target_type_check
  check (target_type in ('profile', 'group', 'goal', 'post', 'comment'));

-- ---------- privileges ----------
alter table posts            enable row level security;
alter table post_attachments enable row level security;
alter table comments         enable row level security;
alter table post_helpful     enable row level security;
alter table proposal_votes   enable row level security;

revoke all on posts, post_attachments, comments, post_helpful, proposal_votes from anon, authenticated;

grant select, delete on posts to authenticated;
grant insert (group_id, author_id, kind, body, link_url, vote_deadline) on posts to authenticated;
grant update (body, link_url) on posts to authenticated;
grant select, insert on post_attachments to authenticated;
grant select, delete on comments to authenticated;
grant insert (post_id, author_id, body) on comments to authenticated;
grant select, delete on post_helpful to authenticated;   -- нэмэх нь mark_helpful()-ээр
grant select on proposal_votes to authenticated;         -- санал өгөх нь vote_proposal()-оор

-- ---------- policies ----------
create policy posts_select on posts for select to authenticated
  using (public.is_group_member(group_id));
create policy posts_insert on posts for insert to authenticated
  with check (author_id = auth.uid() and public.is_group_member(group_id));
create policy posts_update on posts for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy posts_delete on posts for delete to authenticated
  using (author_id = auth.uid() or public.is_group_owner(group_id));

-- posts-ийн RLS дэд асуулгад үйлчилнэ: харж чадах пост л тооцогдоно.
create policy attachments_select on post_attachments for select to authenticated
  using (exists (select 1 from posts p where p.id = post_id));
create policy attachments_insert on post_attachments for insert to authenticated
  with check (exists (
    select 1 from posts p
    where p.id = post_id and p.author_id = auth.uid()
      and storage_path like p.group_id::text || '/' || p.id::text || '/%'
  ));

create policy comments_select on comments for select to authenticated
  using (exists (select 1 from posts p where p.id = post_id));
create policy comments_insert on comments for insert to authenticated
  with check (author_id = auth.uid() and exists (select 1 from posts p where p.id = post_id));
create policy comments_delete on comments for delete to authenticated
  using (
    author_id = auth.uid()
    or exists (select 1 from posts p where p.id = post_id and public.is_group_owner(p.group_id))
  );

create policy helpful_select on post_helpful for select to authenticated
  using (exists (select 1 from posts p where p.id = post_id));
create policy helpful_delete_own on post_helpful for delete to authenticated
  using (user_id = auth.uid());

create policy votes_select on proposal_votes for select to authenticated
  using (exists (select 1 from posts p where p.id = post_id));

-- ---------- functions ----------
-- "Тустай": өөрийн постонд дарах боломжгүй. Бусад 3 хүн дарвал зохиогч нэг удаа +15 XP.
-- Буцааж аваад дахин дарсан ч XP давхардахгүй (xp_transactions-ийн unique key).
create or replace function public.mark_helpful(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_post    posts%rowtype;
  v_count   int;
  v_awarded boolean := false;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select * into v_post from posts where id = p_post_id;
  if not found or not public.is_group_member(v_post.group_id) then raise exception 'post_not_found'; end if;
  if v_post.author_id = v_uid then raise exception 'own_post'; end if;

  insert into post_helpful (post_id, user_id) values (p_post_id, v_uid) on conflict do nothing;
  select count(*) into v_count from post_helpful where post_id = p_post_id;

  if v_count >= 3 then
    insert into xp_transactions (user_id, source_type, source_id, amount)
    values (v_post.author_id, 'post_helpful', p_post_id, 15)
    on conflict (user_id, source_type, source_id) do nothing;
    if found then
      v_awarded := true;
      perform public._sync_xp(v_post.author_id);
    end if;
  end if;

  return jsonb_build_object('count', v_count, 'awarded', v_awarded);
end;
$$;

-- Санал: дэмжих / эсрэг / асуулттай. Хугацаа дуустал өөрчилж болно.
create or replace function public.vote_proposal(p_post_id uuid, p_vote proposal_vote)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_post posts%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select * into v_post from posts where id = p_post_id;
  if not found or not public.is_group_member(v_post.group_id) then raise exception 'post_not_found'; end if;
  if v_post.kind <> 'proposal' then raise exception 'not_proposal'; end if;
  if v_post.vote_deadline is not null and v_post.vote_deadline < now() then raise exception 'voting_closed'; end if;

  insert into proposal_votes (post_id, user_id, vote) values (p_post_id, v_uid, p_vote)
  on conflict (post_id, user_id) do update set vote = excluded.vote, updated_at = now();
end;
$$;

revoke execute on function public.mark_helpful(uuid) from public, anon;
revoke execute on function public.vote_proposal(uuid, proposal_vote) from public, anon;
grant execute on function public.mark_helpful(uuid) to authenticated;
grant execute on function public.vote_proposal(uuid, proposal_vote) to authenticated;

-- ---------- storage: post-media (private) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('post-media', 'post-media', false, 20971520,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

create policy post_media_select on storage.objects for select to authenticated
  using (
    bucket_id = 'post-media'
    and public.is_group_member(public.safe_uuid((storage.foldername(name))[1]))
  );

create policy post_media_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'post-media'
    and exists (
      select 1 from public.posts p
      where p.id = public.safe_uuid((storage.foldername(name))[2])
        and p.group_id = public.safe_uuid((storage.foldername(name))[1])
        and p.author_id = auth.uid()
    )
  );

-- Постыг устгахаас ӨМНӨ файлыг устгана (client дараалал).
create policy post_media_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'post-media'
    and exists (
      select 1 from public.posts p
      where p.id = public.safe_uuid((storage.foldername(name))[2])
        and (p.author_id = auth.uid() or public.is_group_owner(p.group_id))
    )
  );

-- ===================== 0008_sessions.sql =====================
-- 0008: Товлосон хамтын сешн — "Пүрэв 20:00, Unit 5-ыг хамтдаа үзнэ".
-- Видео нь гадны (Meet, Zoom, YouTube) линк. "Очно" бүртгэл, дараа нь тэмдэглэл.
-- Оролцоог баталгаажуулах боломжгүй тул XP өгөхгүй.

create table group_sessions (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references groups (id) on delete cascade,
  host_id      uuid references profiles (id) on delete set null,
  title        text not null check (char_length(title) between 2 and 100),
  description  text check (char_length(description) <= 1000),
  starts_at    timestamptz not null,
  duration_min int not null default 60 check (duration_min between 15 and 480),
  meeting_url  text check (meeting_url ~* '^https://' and char_length(meeting_url) <= 500),
  notes        text check (char_length(notes) <= 4000),
  cancelled_at timestamptz,
  created_at   timestamptz not null default now()
);
create index group_sessions_group_idx on group_sessions (group_id, starts_at);

create table session_rsvps (
  session_id uuid not null references group_sessions (id) on delete cascade,
  user_id    uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (session_id, user_id)
);
create index session_rsvps_user_idx on session_rsvps (user_id);

alter table group_sessions enable row level security;
alter table session_rsvps enable row level security;
revoke all on group_sessions, session_rsvps from anon, authenticated;
grant select on group_sessions, session_rsvps to authenticated;

create policy sessions_select on group_sessions for select to authenticated
  using (public.is_group_member(group_id));
create policy rsvps_select on session_rsvps for select to authenticated
  using (exists (select 1 from group_sessions s where s.id = session_id));

-- ---------- functions ----------
create or replace function public.create_session(
  p_group_id uuid,
  p_title text,
  p_description text,
  p_starts_at timestamptz,
  p_duration_min int,
  p_meeting_url text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not public.is_group_member(p_group_id) then raise exception 'not_member'; end if;
  if char_length(trim(coalesce(p_title, ''))) not between 2 and 100 then raise exception 'invalid_title'; end if;
  if p_duration_min is null or p_duration_min not between 15 and 480 then raise exception 'invalid_duration'; end if;
  if p_starts_at is null or p_starts_at < now() - interval '5 minutes' or p_starts_at > now() + interval '90 days' then
    raise exception 'invalid_start';
  end if;
  if nullif(trim(p_meeting_url), '') is not null
     and (p_meeting_url !~* '^https://\S+$' or char_length(p_meeting_url) > 500) then
    raise exception 'invalid_url';
  end if;

  insert into group_sessions (group_id, host_id, title, description, starts_at, duration_min, meeting_url)
  values (p_group_id, v_uid, trim(p_title), nullif(trim(p_description), ''), p_starts_at, p_duration_min,
          nullif(trim(p_meeting_url), ''))
  returning id into v_id;

  insert into session_rsvps (session_id, user_id) values (v_id, v_uid);
  return v_id;
end;
$$;

-- Хөтлөгч эсвэл group эзэн: тэмдэглэл, линк шинэчлэх.
create or replace function public.update_session(p_session_id uuid, p_notes text, p_meeting_url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_s   group_sessions%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_s from group_sessions where id = p_session_id;
  if not found or not public.is_group_member(v_s.group_id) then raise exception 'session_not_found'; end if;
  if v_s.host_id is distinct from v_uid and not public.is_group_owner(v_s.group_id) then raise exception 'not_host'; end if;
  if nullif(trim(p_meeting_url), '') is not null
     and (p_meeting_url !~* '^https://\S+$' or char_length(p_meeting_url) > 500) then
    raise exception 'invalid_url';
  end if;
  if char_length(coalesce(p_notes, '')) > 4000 then raise exception 'notes_too_long'; end if;

  update group_sessions
  set notes = nullif(trim(p_notes), ''), meeting_url = nullif(trim(p_meeting_url), '')
  where id = p_session_id;
end;
$$;

create or replace function public.cancel_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_s   group_sessions%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_s from group_sessions where id = p_session_id;
  if not found or not public.is_group_member(v_s.group_id) then raise exception 'session_not_found'; end if;
  if v_s.host_id is distinct from v_uid and not public.is_group_owner(v_s.group_id) then raise exception 'not_host'; end if;
  update group_sessions set cancelled_at = coalesce(cancelled_at, now()) where id = p_session_id;
end;
$$;

-- "Очно" / болих. Цуцлагдсан эсвэл дууссан сешнд бүртгэхгүй.
create or replace function public.rsvp_session(p_session_id uuid, p_going boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_s   group_sessions%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_s from group_sessions where id = p_session_id;
  if not found or not public.is_group_member(v_s.group_id) then raise exception 'session_not_found'; end if;

  if not p_going then
    delete from session_rsvps where session_id = p_session_id and user_id = v_uid;
    return;
  end if;

  if v_s.cancelled_at is not null then raise exception 'session_cancelled'; end if;
  if v_s.starts_at + make_interval(mins => v_s.duration_min) < now() then raise exception 'session_ended'; end if;

  insert into session_rsvps (session_id, user_id) values (p_session_id, v_uid) on conflict do nothing;
end;
$$;

revoke execute on function public.create_session(uuid, text, text, timestamptz, int, text) from public, anon;
revoke execute on function public.update_session(uuid, text, text) from public, anon;
revoke execute on function public.cancel_session(uuid) from public, anon;
revoke execute on function public.rsvp_session(uuid, boolean) from public, anon;
grant execute on function public.create_session(uuid, text, text, timestamptz, int, text) to authenticated;
grant execute on function public.update_session(uuid, text, text) to authenticated;
grant execute on function public.cancel_session(uuid) to authenticated;
grant execute on function public.rsvp_session(uuid, boolean) to authenticated;

-- ===================== 0009_courses.sql =====================
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

-- ===================== 0010_reviews.sql =====================
-- 0010: Сургалтын үнэлгээ (1–5 од + сэтгэгдэл). Хичээлийн тал хувиас доошгүйг дуусгасан суралцагч өгнө.
-- Багшийн профайл дээр дундаж үнэлгээ харагдана.

create table course_reviews (
  id         uuid not null unique default gen_random_uuid(),  -- report-д
  group_id   uuid not null references groups (id) on delete cascade,
  user_id    uuid not null references profiles (id) on delete cascade,
  rating     int not null check (rating between 1 and 5),
  comment    text check (char_length(comment) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

alter table course_reviews enable row level security;
revoke all on course_reviews from anon, authenticated;
grant select, delete on course_reviews to authenticated;

-- Group-ийг харж чадах хүн үнэлгээг харна (нийтийн сургалтад гаднаас ч).
create policy reviews_select on course_reviews for select to authenticated
  using (public.can_view_group(group_id));
create policy reviews_delete_own on course_reviews for delete to authenticated
  using (user_id = auth.uid());

alter table user_reports drop constraint user_reports_target_type_check;
alter table user_reports add constraint user_reports_target_type_check
  check (target_type in ('profile', 'group', 'goal', 'post', 'comment', 'review'));

-- Үнэлгээ өгөх / засах.
create or replace function public.review_course(p_group_id uuid, p_rating int, p_comment text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_total int;
  v_done  int;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from groups g where g.id = p_group_id and g.kind = 'course' and g.deleted_at is null) then
    raise exception 'not_course';
  end if;
  if not public.is_group_member(p_group_id) then raise exception 'not_member'; end if;
  if public.is_group_owner(p_group_id) then raise exception 'not_student'; end if;
  if p_rating is null or p_rating not between 1 and 5 then raise exception 'invalid_rating'; end if;
  if char_length(coalesce(p_comment, '')) > 500 then raise exception 'comment_too_long'; end if;

  select count(*) into v_total from course_lessons where group_id = p_group_id;
  select count(*) into v_done from lesson_completions c
    join course_lessons l on l.id = c.lesson_id
    where l.group_id = p_group_id and c.user_id = v_uid;
  if v_done < 1 or v_done * 2 < v_total then raise exception 'not_enough_progress'; end if;

  insert into course_reviews (group_id, user_id, rating, comment)
  values (p_group_id, v_uid, p_rating, nullif(trim(p_comment), ''))
  on conflict (group_id, user_id) do update set
    rating = excluded.rating, comment = excluded.comment, updated_at = now();
end;
$$;

revoke execute on function public.review_course(uuid, int, text) from public, anon;
grant execute on function public.review_course(uuid, int, text) to authenticated;

-- teacher_stats (0009) + дундаж үнэлгээ (хаалттай сургалтынх ч тоонд орно, текст нь харагдахгүй).
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
                   where g.owner_id = p_user_id and g.deleted_at is null),
    'rating_count', (select count(*) from course_reviews r join groups g on g.id = r.group_id
                     where g.owner_id = p_user_id and g.deleted_at is null)
  )
  where exists (select 1 from teacher_profiles t where t.user_id = p_user_id and t.enabled)
$$;

commit;
