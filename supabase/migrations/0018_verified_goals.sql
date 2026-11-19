-- 0018: Баталгаажсан зорилго — "5 км гүйх" зэрэг өдөр тутмын зорилгыг GPS эсвэл фокус таймераар
-- баталгаажуулна (challenge-ийн 0017-тэй ижил шалгалт). Ийм зорилгыг нэг товшилтоор биелүүлэх боломжгүй.

-- ---------- Зорилгын баталгаажуулалт ----------
alter table goals add column verification text not null default 'manual'
  check (verification in ('manual', 'gps', 'focus'));
alter table goals add column activity text check (activity is null or activity in ('run', 'walk', 'ride'));
alter table goals add column min_distance_m int check (min_distance_m is null or min_distance_m between 100 and 100000);
alter table goals add column min_minutes int check (min_minutes is null or min_minutes between 5 and 600);
alter table goals add constraint goals_verification_config check (
  verification = 'manual'
  or (verification = 'gps' and activity is not null and min_distance_m is not null)
  or (verification = 'focus' and min_minutes is not null)
);

-- Үүсгэсний дараа баталгаажуулалтыг өөрчилж (гараар болгож) тойрохгүй: зөвхөн эдгээр баганыг засна.
revoke update on goals from authenticated;
grant update (title, description, status, group_id, frequency, target) on goals to authenticated;

-- Апп-ын "санал болгох" жагсаалтаас үүсгэсэн идэвхтэй зорилгуудыг баталгаажуулалттай болгоно.
update goals set verification = 'gps', activity = 'run', min_distance_m = 5000
  where status = 'active' and verification = 'manual' and title in ('🏃 5 км гүйх', '🏃 Run 5 km');
update goals set verification = 'focus', min_minutes = 30
  where status = 'active' and verification = 'manual' and title in ('📚 30 мин ном унших', '📚 Read 30 min');
update goals set verification = 'focus', min_minutes = 10
  where status = 'active' and verification = 'manual' and title in ('🧘 10 мин бясалгах', '🧘 Meditate 10 min');
update goals set verification = 'focus', min_minutes = 60
  where status = 'active' and verification = 'manual' and title in ('💻 1 цаг код бичих', '💻 Code for 1 hour');

-- ---------- Идэвхжил зорилготой холбогдоно ----------
alter table activities add column goal_id uuid references goals (id) on delete set null;
alter table activities add constraint activities_one_target check (challenge_id is null or goal_id is null);

-- ---------- complete_goal: баталгаажуулалттай зорилгыг гараар биелүүлэхгүй ----------
create or replace function public.complete_goal(
  p_goal_id uuid,
  p_completed_on date,
  p_proof_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid         uuid := auth.uid();
  v_tz          text;
  v_today       date;
  v_completion  uuid;
  v_xp_per_goal constant int := 20;
  v_total_xp    int;
  v_level       int;
  v_streak      int := 0;
  v_day         date;
  v_verification text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select g.verification into v_verification
  from goals g
  where g.id = p_goal_id and g.user_id = v_uid and g.status = 'active';
  if not found then
    raise exception 'goal_not_found';
  end if;
  -- GPS/фокусын зорилгыг гараар биелүүлэхгүй: зөвхөн finish_activity баталгаажуулна.
  if v_verification <> 'manual' and coalesce(current_setting('together.verified_goal', true), '') <> 'on' then
    raise exception 'verification_required';
  end if;

  select coalesce(p.timezone, 'Asia/Ulaanbaatar') into v_tz
  from profiles p where p.id = v_uid;

  v_today := (now() at time zone v_tz)::date;
  if p_completed_on not in (v_today, v_today - 1) then
    raise exception 'date_out_of_range';
  end if;

  insert into goal_completions (goal_id, user_id, completed_on, proof_url)
  values (p_goal_id, v_uid, p_completed_on, p_proof_url)
  on conflict (goal_id, completed_on) do nothing
  returning id into v_completion;

  if v_completion is null then
    raise exception 'already_completed';
  end if;

  insert into xp_transactions (user_id, source_type, source_id, amount)
  values (v_uid, 'goal_completion', v_completion, v_xp_per_goal)
  on conflict (user_id, source_type, source_id) do nothing;

  -- Streak: хамгийн сүүлийн биелэлтийн өдрөөс эхлэн өдөр бүр биелэлттэй байгаа тоо.
  -- (Өчигдрийг backfill хийхэд streak буурахгүй.)
  select max(c.completed_on) into v_day
  from goal_completions c where c.user_id = v_uid;
  loop
    exit when not exists (
      select 1 from goal_completions c
      where c.user_id = v_uid and c.completed_on = v_day
    );
    v_streak := v_streak + 1;
    v_day := v_day - 1;
  end loop;

  select coalesce(sum(x.amount), 0) into v_total_xp
  from xp_transactions x where x.user_id = v_uid;

  -- Түвшин: 0→1, 100→2, 400→3, 900→4 ... (tunable)
  v_level := floor(sqrt(v_total_xp / 100.0))::int + 1;

  insert into user_progress (user_id, total_xp, current_level, current_streak, longest_streak)
  values (v_uid, v_total_xp, v_level, v_streak, v_streak)
  on conflict (user_id) do update set
    total_xp       = excluded.total_xp,
    current_level  = excluded.current_level,
    current_streak = excluded.current_streak,
    longest_streak = greatest(user_progress.longest_streak, excluded.current_streak),
    updated_at     = now();

  return jsonb_build_object(
    'completion_id', v_completion,
    'xp_gained', v_xp_per_goal,
    'total_xp', v_total_xp,
    'level', v_level,
    'streak', v_streak
  );
end;
$$;


-- ---------- Зорилгын идэвхжил эхлүүлэх ----------
create or replace function public.start_goal_activity(p_goal uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_g goals%rowtype;
  v_kind text;
  v_id uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if exists (select 1 from profiles where id = v_uid and banned_at is not null) then raise exception 'banned'; end if;
  select * into v_g from goals where id = p_goal and user_id = v_uid and status = 'active';
  if not found then raise exception 'goal_not_found'; end if;
  if v_g.verification = 'manual' then raise exception 'not_verified'; end if;
  v_kind := case v_g.verification when 'gps' then v_g.activity else 'focus' end;

  update activities set status = 'abandoned', ended_at = now() where user_id = v_uid and status = 'active';
  insert into activities (user_id, goal_id, kind) values (v_uid, p_goal, v_kind)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'started_at', now(), 'kind', v_kind);
end $$;

-- ---------- finish_activity: зорилгын шаардлагыг уншиж, баталгаажвал биелүүлнэ ----------
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
  v_g goals%rowtype;
  v_min_dist int := 0;
  v_min_minutes int := 0;
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
  if v_a.goal_id is not null then select * into v_g from goals where id = v_a.goal_id; end if;
  v_min_dist := coalesce(v_c.min_distance_m, v_g.min_distance_m, 0);
  v_min_minutes := coalesce(v_c.min_minutes, v_g.min_minutes, 0);

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
    v_meets := v_reason is null and v_dist >= v_min_dist;
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
    elsif v_dur < v_min_minutes * 60 - 5 then v_reason := 'too_short';
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

  -- Зорилго: баталгаажиж, шаардлага хангавал өнөөдрийн биелэлт (+20 XP).
  if v_reason is null and v_meets and v_g.id is not null then
    begin
      perform set_config('together.verified_goal', 'on', true);
      v_checkin := public.complete_goal(v_g.id, public._user_today(v_uid));
      perform set_config('together.verified_goal', 'off', true);
      update activities set checked_in = true where id = p_activity;
    exception when others then
      perform set_config('together.verified_goal', 'off', true);
      if sqlerrm not like '%already_completed%' and sqlerrm not like '%goal_not_found%' then raise; end if;
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


revoke execute on function public.start_goal_activity(uuid) from public, anon;
grant execute on function public.start_goal_activity(uuid) to authenticated;
