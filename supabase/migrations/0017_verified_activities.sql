-- 0017: Баталгаажуулсан идэвхжил — GPS (гүйлт/алхалт/дугуй), байршлаар check-in, фокус таймер.
--
-- Зарчим: эхлэх/дуусах цагийг СЕРВЕР тэмдэглэнэ (start_activity → finish_activity). Апп зөвхөн тэр
-- хугацаанд цуглуулсан цэгүүдийг илгээнэ; сервер зай, хурд, байршлыг өөрөө дахин тооцож шалгана.
-- Баталгаажвал тухайн challenge-ийн өнөөдрийн check-in автоматаар хийгдэнэ (+25 XP).
-- Баталгаажуулалттай challenge-д гараар check-in хийх боломжгүй.

-- ---------- Challenge-ийн баталгаажуулалтын тохиргоо ----------
alter table challenges add column verification text not null default 'manual'
  check (verification in ('manual', 'gps', 'place', 'focus'));
alter table challenges add column activity text check (activity is null or activity in ('run', 'walk', 'ride'));
alter table challenges add column min_distance_m int check (min_distance_m is null or min_distance_m between 100 and 100000);
alter table challenges add column min_minutes int check (min_minutes is null or min_minutes between 5 and 600);
alter table challenges add column place_name text check (place_name is null or char_length(place_name) between 1 and 80);
alter table challenges add column place_lat double precision check (place_lat is null or place_lat between -90 and 90);
alter table challenges add column place_lng double precision check (place_lng is null or place_lng between -180 and 180);
alter table challenges add column place_radius_m int check (place_radius_m is null or place_radius_m between 30 and 1000);
alter table challenges add constraint challenges_verification_config check (
  verification = 'manual'
  or (verification = 'gps' and activity is not null and min_distance_m is not null)
  or (verification = 'place' and place_lat is not null and place_lng is not null and place_radius_m is not null and min_minutes is not null)
  or (verification = 'focus' and min_minutes is not null)
);

-- ---------- Идэвхжил ----------
create table activities (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles (id) on delete cascade,
  challenge_id  uuid references challenges (id) on delete set null,
  kind          text not null check (kind in ('run', 'walk', 'ride', 'place', 'focus')),
  status        text not null default 'active' check (status in ('active', 'verified', 'rejected', 'abandoned')),
  started_at    timestamptz not null default now(),
  ended_at      timestamptz,
  distance_m    int,
  duration_s    int,
  moving_s      int,
  avg_speed_mps real,
  max_speed_mps real,
  points        jsonb,
  reject_reason text,
  checked_in    boolean not null default false,
  created_at    timestamptz not null default now()
);
create index activities_user_idx on activities (user_id, started_at desc);
create index activities_challenge_idx on activities (challenge_id, user_id) where status = 'verified';
-- Нэг хэрэглэгчид нэг идэвхтэй бүртгэл.
create unique index activities_one_active on activities (user_id) where status = 'active';

alter table activities enable row level security;
revoke all on activities from anon, authenticated;
grant select on activities to authenticated;
create policy activities_select_own on activities for select to authenticated
  using (user_id = (select auth.uid()));

-- Хоёр цэгийн хоорондох зай (метр), haversine.
create or replace function public._haversine_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision
language sql
immutable
set search_path = public
as $$
  select 2 * 6371008.8 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ));
$$;

-- Challenge үүсгэгч баталгаажуулалтыг тохируулна (хэн нэгэн check-in хийхээс өмнө).
create or replace function public.set_challenge_verification(
  p_challenge uuid,
  p_verification text,
  p_activity text default null,
  p_min_distance_m int default null,
  p_min_minutes int default null,
  p_place_name text default null,
  p_place_lat double precision default null,
  p_place_lng double precision default null,
  p_place_radius_m int default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c challenges%rowtype;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into v_c from challenges where id = p_challenge;
  if not found then raise exception 'challenge_not_found'; end if;
  if v_c.creator_id is distinct from auth.uid() then raise exception 'not_creator'; end if;
  if exists (select 1 from challenge_checkins where challenge_id = p_challenge) then raise exception 'already_started'; end if;

  update challenges set
    verification = p_verification,
    activity = case when p_verification = 'gps' then p_activity end,
    min_distance_m = case when p_verification = 'gps' then p_min_distance_m end,
    min_minutes = case when p_verification in ('place', 'focus') then p_min_minutes end,
    place_name = case when p_verification = 'place' then nullif(btrim(p_place_name), '') end,
    place_lat = case when p_verification = 'place' then p_place_lat end,
    place_lng = case when p_verification = 'place' then p_place_lng end,
    place_radius_m = case when p_verification = 'place' then p_place_radius_m end
  where id = p_challenge;
end $$;

-- Гараар check-in: баталгаажуулалттай challenge-д зөвхөн finish_activity-ээр.
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

  if v_c.verification <> 'manual' and current_setting('together.verified_checkin', true) is distinct from 'on' then
    raise exception 'verification_required';
  end if;

  select * into v_p from challenge_participants
  where challenge_id = p_challenge_id and user_id = v_uid;
  if not found then raise exception 'not_participant'; end if;
  if not public.is_group_member(v_c.group_id) then raise exception 'not_member'; end if;

  v_today := public._user_today(v_uid);
  if p_checked_on is null or p_checked_on not in (v_today, v_today - 1) then
    raise exception 'date_out_of_range';
  end if;
  -- Баталгаажсан идэвхжил зөвхөн өнөөдрийнх.
  if v_c.verification <> 'manual' and p_checked_on <> v_today then raise exception 'date_out_of_range'; end if;
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

-- Эхлэх: сервер цагийг тэмдэглэнэ. Өмнөх дуусаагүй бүртгэл "abandoned" болно.
create or replace function public.start_activity(p_challenge uuid, p_kind text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_c challenges%rowtype;
  v_id uuid;
  v_today date;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_kind not in ('run', 'walk', 'ride', 'place', 'focus') then raise exception 'invalid_kind'; end if;
  if exists (select 1 from profiles where id = v_uid and banned_at is not null) then raise exception 'banned'; end if;

  if p_challenge is not null then
    select * into v_c from challenges where id = p_challenge;
    if not found then raise exception 'challenge_not_found'; end if;
    if not exists (select 1 from challenge_participants where challenge_id = p_challenge and user_id = v_uid) then
      raise exception 'not_participant';
    end if;
    if not (
      (v_c.verification = 'gps' and v_c.activity = p_kind)
      or (v_c.verification = 'place' and p_kind = 'place')
      or (v_c.verification = 'focus' and p_kind = 'focus')
    ) then
      raise exception 'kind_mismatch';
    end if;
    v_today := public._user_today(v_uid);
    if v_today < v_c.start_on or v_today > v_c.end_on then raise exception 'outside_challenge'; end if;
  end if;

  update activities set status = 'abandoned', ended_at = now() where user_id = v_uid and status = 'active';
  insert into activities (user_id, challenge_id, kind) values (v_uid, p_challenge, p_kind)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'started_at', now());
end $$;

-- Дуусгах: цэгүүдийг шалгаж баталгаажуулна; шаардлага хангавал check-in хийнэ.
-- p_points: [{"lat":..,"lng":..,"t":<epoch ms>,"acc":<метр>}, ...] (≤ 3000 цэг).
create or replace function public.finish_activity(
  p_activity uuid,
  p_points jsonb default '[]',
  p_mocked boolean default false,
  p_interrupted boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_a activities%rowtype;
  v_c challenges%rowtype;
  v_now timestamptz := now();
  v_dur int;
  v_n int := coalesce(jsonb_array_length(case when jsonb_typeof(p_points) = 'array' then p_points end), 0);
  v_pt record;
  v_prev record;
  v_has_prev boolean := false;
  v_lat double precision; v_lng double precision; v_t double precision; v_acc double precision;
  v_dist double precision := 0;
  v_fast double precision := 0;
  v_moving double precision := 0;
  v_max double precision := 0;
  v_seg double precision; v_dt double precision; v_spd double precision;
  v_seg_limit double precision; v_avg_min double precision; v_avg_max double precision;
  v_avg double precision := 0;
  v_inside int := 0; v_samples int := 0; v_first_t double precision; v_last_t double precision;
  v_reason text := null;
  v_meets boolean := false;
  v_checkin jsonb := null;
  v_start_ms double precision;
  v_now_ms double precision := extract(epoch from now()) * 1000;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_a from activities where id = p_activity for update;
  if not found or v_a.user_id <> v_uid then raise exception 'activity_not_found'; end if;
  if v_a.status <> 'active' then raise exception 'activity_closed'; end if;
  if v_n > 3000 then raise exception 'too_many_points'; end if;

  v_dur := extract(epoch from (v_now - v_a.started_at))::int;
  v_start_ms := extract(epoch from v_a.started_at) * 1000;
  if v_a.challenge_id is not null then select * into v_c from challenges where id = v_a.challenge_id; end if;

  if v_dur > 6 * 3600 then
    v_reason := 'too_long';
  elsif p_mocked then
    v_reason := 'mock_location';
  elsif v_a.kind in ('run', 'walk', 'ride') then
    -- Төрөл бүрийн хурдны хязгаар (м/с): сегмент / дундаж доод / дундаж дээд.
    v_seg_limit := case v_a.kind when 'run' then 8.5 when 'walk' then 4.0 else 20.0 end;
    v_avg_min := case v_a.kind when 'run' then 1.4 when 'walk' then 0.3 else 1.0 end;
    v_avg_max := case v_a.kind when 'run' then 6.5 when 'walk' then 2.8 else 14.0 end;

    if v_n < 10 then
      v_reason := 'too_few_points';
    else
      for v_pt in select e.value as p from jsonb_array_elements(p_points) as e(value) loop
        v_lat := (v_pt.p->>'lat')::double precision;
        v_lng := (v_pt.p->>'lng')::double precision;
        v_t := (v_pt.p->>'t')::double precision;
        v_acc := coalesce((v_pt.p->>'acc')::double precision, 0);
        if v_lat is null or v_lng is null or v_t is null or abs(v_lat) > 90 or abs(v_lng) > 180 then
          v_reason := 'bad_points'; exit;
        end if;
        -- Цэг бүр серверийн эхлэх–дуусах хугацаанд байна (±10 сек).
        if v_t < v_start_ms - 10000 or v_t > v_now_ms + 10000 then v_reason := 'bad_timestamps'; exit; end if;
        if v_acc > 50 then continue; end if; -- нарийвчлал муутай цэгийг алгасна
        if v_has_prev then
          if v_t <= v_prev.t then v_reason := 'bad_timestamps'; exit; end if;
          v_dt := (v_t - v_prev.t) / 1000.0;
          v_seg := public._haversine_m(v_prev.lat, v_prev.lng, v_lat, v_lng);
          if v_dt <= 120 then          -- 2 минутаас урт завсар = завсарлага, зайд тооцохгүй
            v_spd := v_seg / v_dt;
            if v_spd > v_seg_limit then v_fast := v_fast + v_seg; end if;
            v_dist := v_dist + v_seg;
            v_moving := v_moving + v_dt;
            v_max := greatest(v_max, v_spd);
          end if;
        end if;
        select v_lat as lat, v_lng as lng, v_t as t into v_prev;
        v_has_prev := true;
      end loop;

      if v_reason is null then
        v_avg := case when v_moving > 0 then v_dist / v_moving else 0 end;
        if v_dist > 0 and v_fast / v_dist > 0.10 then v_reason := 'too_fast';
        elsif v_avg > v_avg_max then v_reason := 'too_fast';
        elsif v_dist >= 200 and v_avg < v_avg_min then v_reason := 'too_slow';
        end if;
      end if;
    end if;
    v_meets := v_reason is null and v_dist >= coalesce(v_c.min_distance_m, 0);
  elsif v_a.kind = 'place' then
    if v_c.id is null then
      v_reason := 'no_place';
    elsif v_n < 2 then
      v_reason := 'too_few_points';
    else
      for v_pt in select e.value as p from jsonb_array_elements(p_points) as e(value) loop
        v_lat := (v_pt.p->>'lat')::double precision;
        v_lng := (v_pt.p->>'lng')::double precision;
        v_t := (v_pt.p->>'t')::double precision;
        v_acc := least(coalesce((v_pt.p->>'acc')::double precision, 0), 50);
        if v_lat is null or v_lng is null or v_t is null then v_reason := 'bad_points'; exit; end if;
        if v_t < v_start_ms - 10000 or v_t > v_now_ms + 10000 then v_reason := 'bad_timestamps'; exit; end if;
        if v_has_prev and (v_t <= v_last_t) then v_reason := 'bad_timestamps'; exit; end if;
        -- Байршлын шалгалтын завсар 5.5 минутаас хэтрэхгүй (тасралтгүй байсныг нотлоно).
        if v_has_prev and (v_t - v_last_t) > 330000 then v_reason := 'gaps'; exit; end if;
        if v_first_t is null then v_first_t := v_t; end if;
        v_last_t := v_t;
        v_has_prev := true;
        v_samples := v_samples + 1;
        if public._haversine_m(v_c.place_lat, v_c.place_lng, v_lat, v_lng) <= v_c.place_radius_m + v_acc then
          v_inside := v_inside + 1;
        end if;
      end loop;
      if v_reason is null then
        if v_samples = 0 or v_inside::double precision / v_samples < 0.9 then v_reason := 'outside_place';
        elsif (v_last_t - v_first_t) / 1000.0 < v_c.min_minutes * 60 - 30 then v_reason := 'too_short';
        end if;
      end if;
    end if;
    v_meets := v_reason is null;
  else -- focus: цагийг сервер хэмжинэ, апп-аас гарсан бол тасарна
    if p_interrupted then v_reason := 'interrupted';
    elsif v_dur < coalesce(v_c.min_minutes, 0) * 60 - 5 then v_reason := 'too_short';
    end if;
    v_meets := v_reason is null;
  end if;

  update activities set
    status = case when v_reason is null then 'verified' else 'rejected' end,
    ended_at = v_now,
    duration_s = v_dur,
    distance_m = case when v_a.kind in ('run', 'walk', 'ride') then round(v_dist)::int end,
    moving_s = case when v_a.kind in ('run', 'walk', 'ride') then round(v_moving)::int end,
    avg_speed_mps = case when v_a.kind in ('run', 'walk', 'ride') then v_avg end,
    max_speed_mps = case when v_a.kind in ('run', 'walk', 'ride') then v_max end,
    points = case when v_a.kind <> 'focus' and v_n > 0 then p_points end,
    reject_reason = v_reason
  where id = p_activity;

  -- Баталгаажиж, шаардлага хангавал өнөөдрийн check-in.
  if v_reason is null and v_meets and v_c.id is not null then
    begin
      perform set_config('together.verified_checkin', 'on', true);
      v_checkin := public.checkin_challenge(v_c.id, public._user_today(v_uid));
      perform set_config('together.verified_checkin', 'off', true);
      update activities set checked_in = true where id = p_activity;
    exception when others then
      perform set_config('together.verified_checkin', 'off', true);
      if sqlerrm not like '%already_checked_in%' and sqlerrm not like '%outside_challenge%' then raise; end if;
    end;
  end if;

  return jsonb_build_object(
    'verified', v_reason is null,
    'reason', v_reason,
    'meets', v_meets,
    'distance_m', round(v_dist)::int,
    'duration_s', v_dur,
    'avg_speed_mps', round(v_avg::numeric, 2),
    'checked_in', v_checkin is not null,
    'checkin', v_checkin
  );
end $$;

create or replace function public.cancel_activity(p_activity uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update activities set status = 'abandoned', ended_at = now()
  where id = p_activity and user_id = auth.uid() and status = 'active';
$$;

-- Challenge-ийн самбар: оролцогч бүрийн биелүүлсэн өдөр, баталгаажсан нийт зай/минут.
create or replace function public.challenge_board(p_challenge uuid)
returns table (user_id uuid, display_name text, avatar_url text, days bigint, distance_m bigint, minutes bigint)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.display_name, p.avatar_url,
         (select count(*) from challenge_checkins k where k.challenge_id = cp.challenge_id and k.user_id = cp.user_id),
         coalesce((select sum(a.distance_m) from activities a
                   where a.challenge_id = cp.challenge_id and a.user_id = cp.user_id and a.status = 'verified'), 0),
         coalesce((select sum(a.duration_s) / 60 from activities a
                   where a.challenge_id = cp.challenge_id and a.user_id = cp.user_id and a.status = 'verified'), 0)
  from challenge_participants cp
  join challenges c on c.id = cp.challenge_id
  join profiles p on p.id = cp.user_id and p.deleted_at is null
  where cp.challenge_id = p_challenge
    and auth.uid() is not null
    and public.can_view_group(c.group_id)
    and not exists (select 1 from user_blocks b where b.blocker_id = auth.uid() and b.blocked_id = cp.user_id)
  order by 4 desc, 5 desc, 6 desc
  limit 100;
$$;

revoke execute on function public._haversine_m(double precision, double precision, double precision, double precision) from public, anon, authenticated;
revoke execute on function public.set_challenge_verification(uuid, text, text, int, int, text, double precision, double precision, int) from public, anon;
revoke execute on function public.start_activity(uuid, text) from public, anon;
revoke execute on function public.finish_activity(uuid, jsonb, boolean, boolean) from public, anon;
revoke execute on function public.cancel_activity(uuid) from public, anon;
revoke execute on function public.challenge_board(uuid) from public, anon;
grant execute on function public.set_challenge_verification(uuid, text, text, int, int, text, double precision, double precision, int) to authenticated;
grant execute on function public.start_activity(uuid, text) to authenticated;
grant execute on function public.finish_activity(uuid, jsonb, boolean, boolean) to authenticated;
grant execute on function public.cancel_activity(uuid) to authenticated;
grant execute on function public.challenge_board(uuid) to authenticated;
