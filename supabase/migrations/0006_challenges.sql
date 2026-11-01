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
