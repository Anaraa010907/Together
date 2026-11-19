-- Баталгаажсан зорилго: GPS гүйлт ба фокус; гараар биелүүлэх боломжгүй; баганыг өөрчилж тойрохгүй.

create or replace function pg_temp.as_admin() returns void
language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', false);
end $$;

create or replace function pg_temp.as_user(uid uuid) returns void
language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', uid::text, false);
  execute 'set role authenticated';
end $$;

create or replace function pg_temp.expect_error(stmt text, expected text) returns void
language plpgsql as $$
begin
  execute stmt;
  raise exception 'EXPECTED ERROR "%" BUT SUCCEEDED: %', expected, stmt;
exception when others then
  if sqlerrm not like '%' || expected || '%' then
    raise exception 'WRONG ERROR. want "%", got "%": %', expected, sqlerrm, stmt;
  end if;
end $$;

create or replace function pg_temp.track(start_ms double precision, n int, step_s int, step_m double precision)
returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object(
    'lat', 47.9 + (i * step_m) / 111195.0, 'lng', 106.9, 't', start_ms + i * step_s * 1000, 'acc', 8) order by i)
  from generate_series(0, n - 1) i;
$$;

create or replace function pg_temp.backdate(a uuid, secs int) returns double precision
language plpgsql as $$
declare v double precision;
begin
  execute 'reset role';
  update activities set started_at = now() - make_interval(secs => secs) where id = a
  returning extract(epoch from started_at) * 1000 into v;
  return v;
end $$;

select pg_temp.as_admin() \gset
insert into auth.users (id) values
  ('e9111111-1111-1111-1111-111111111111'),
  ('e9222222-2222-2222-2222-222222222222');
insert into profiles (id, username, display_name, is_minor, age_declared_at) values
  ('e9111111-1111-1111-1111-111111111111', 'goal_a', 'GoalA', false, now()),
  ('e9222222-2222-2222-2222-222222222222', 'goal_b', 'GoalB', false, now());

-- Санал болгосон жагсаалтаас өмнө үүсгэсэн зорилго: migration шилжүүлэх ёстой байсан ч энд шинээр үүснэ.
insert into goals (user_id, title) values ('e9111111-1111-1111-1111-111111111111', 'Ном унших');

do $$
declare
  ua uuid := 'e9111111-1111-1111-1111-111111111111';
  ub uuid := 'e9222222-2222-2222-2222-222222222222';
  manual_g uuid; run_g uuid; focus_g uuid; today date;
  a uuid; s double precision; r jsonb; n bigint; xp0 int; xp1 int;
begin
  today := (now() at time zone 'Asia/Ulaanbaatar')::date;
  perform pg_temp.as_user(ua);

  -- Буруу тохиргоо (gps боловч зай байхгүй) — constraint.
  perform pg_temp.expect_error(
    format('insert into goals (user_id, title, verification, activity) values (%L, ''x'', ''gps'', ''run'')', ua),
    'goals_verification_config');

  insert into goals (user_id, title, verification, activity, min_distance_m)
    values (ua, '🏃 5 км гүйх', 'gps', 'run', 5000) returning id into run_g;
  insert into goals (user_id, title, verification, min_minutes)
    values (ua, '📚 30 мин ном унших', 'focus', 30) returning id into focus_g;
  select id into manual_g from goals where user_id = ua and title = 'Ном унших';

  -- Гараар зорилго хэвийн ажиллана.
  perform complete_goal(manual_g, today);

  -- Баталгаажуулалттай зорилгыг гараар биелүүлэхгүй.
  perform pg_temp.expect_error(format('select complete_goal(%L, %L)', run_g, today), 'verification_required');
  perform pg_temp.expect_error(format('select complete_goal(%L, %L)', focus_g, today), 'verification_required');
  -- GUC-ийг хэрэглэгч өөрөө тохируулж тойрох оролдлого (security definer дотор ч гэсэн local тохиргоо).
  -- (set_config-г клиент PostgREST-ээр дуудах боломжгүй; энд зөвхөн баганын хамгаалалтыг шалгана.)

  -- Баталгаажуулалтыг "гараар" болгож тойрох боломжгүй (баганын эрх).
  perform pg_temp.expect_error(format('update goals set verification = ''manual'' where id = %L', run_g), 'permission denied');
  perform pg_temp.expect_error(format('update goals set min_distance_m = 100 where id = %L', run_g), 'permission denied');
  -- Нэр, төлөвийг засаж болно.
  update goals set title = '🏃 5 км гүйх!' where id = run_g;

  -- Бусдын зорилгоор идэвхжил эхлүүлэхгүй; гараар зорилгоор эхлүүлэхгүй.
  perform pg_temp.as_user(ub);
  perform pg_temp.expect_error(format('select start_goal_activity(%L)', run_g), 'goal_not_found');
  perform pg_temp.as_user(ua);
  perform pg_temp.expect_error(format('select start_goal_activity(%L)', manual_g), 'not_verified');

  -- 1) Богино гүйлт (~1.5 км): баталгаажих ч биелэлт тоологдохгүй.
  r := start_goal_activity(run_g);
  if r->>'kind' <> 'run' then raise exception 'kind wrong: %', r; end if;
  a := (r->>'id')::uuid;
  s := pg_temp.backdate(a, 600);
  perform pg_temp.as_user(ua);
  r := finish_activity(a, pg_temp.track(s + 1000, 60, 10, 25));
  if not (r->>'verified')::boolean or (r->>'meets')::boolean or (r->>'checked_in')::boolean then
    raise exception 'short goal run should verify without completion: %', r;
  end if;

  -- 2) Машинаар → too_fast, биелэхгүй.
  a := (start_goal_activity(run_g)->>'id')::uuid;
  s := pg_temp.backdate(a, 600);
  perform pg_temp.as_user(ua);
  r := finish_activity(a, pg_temp.track(s + 1000, 50, 10, 300));
  if r->>'reason' <> 'too_fast' or (r->>'checked_in')::boolean then raise exception 'car ride completed goal: %', r; end if;

  -- 3) Хэвийн 5.6 км гүйлт → биелж +20 XP.
  select total_xp into xp0 from user_progress where user_id = ua;
  a := (start_goal_activity(run_g)->>'id')::uuid;
  s := pg_temp.backdate(a, 2000);
  perform pg_temp.as_user(ua);
  r := finish_activity(a, pg_temp.track(s + 1000, 200, 10, 28));
  if not (r->>'verified')::boolean or not (r->>'checked_in')::boolean then raise exception 'valid goal run rejected: %', r; end if;
  if (r->'checkin'->>'xp_gained')::int <> 20 then raise exception 'goal xp wrong: %', r; end if;
  select total_xp into xp1 from user_progress where user_id = ua;
  if xp1 - xp0 <> 20 then raise exception 'xp not awarded: % -> %', xp0, xp1; end if;
  select count(*) into n from goal_completions where goal_id = run_g and completed_on = today;
  if n <> 1 then raise exception 'completion missing'; end if;

  -- 4) Дахин гүйвэл баталгаажна, давхар биелэлт/XP байхгүй.
  a := (start_goal_activity(run_g)->>'id')::uuid;
  s := pg_temp.backdate(a, 2000);
  perform pg_temp.as_user(ua);
  r := finish_activity(a, pg_temp.track(s + 1000, 200, 10, 28));
  if not (r->>'verified')::boolean or (r->>'checked_in')::boolean then raise exception 'second run double-completed: %', r; end if;
  select total_xp into xp0 from user_progress where user_id = ua;
  if xp0 <> xp1 then raise exception 'double xp'; end if;

  -- 5) Фокус: тасалдсан → биелэхгүй; 30 мин бүтэн → биелнэ.
  a := (start_goal_activity(focus_g)->>'id')::uuid;
  s := pg_temp.backdate(a, 1900);
  perform pg_temp.as_user(ua);
  r := finish_activity(a, '[]', false, true);
  if r->>'reason' <> 'interrupted' then raise exception 'interrupted focus accepted: %', r; end if;

  a := (start_goal_activity(focus_g)->>'id')::uuid;
  s := pg_temp.backdate(a, 600);
  perform pg_temp.as_user(ua);
  r := finish_activity(a);
  if r->>'reason' <> 'too_short' then raise exception 'short focus accepted: %', r; end if;

  a := (start_goal_activity(focus_g)->>'id')::uuid;
  s := pg_temp.backdate(a, 1805);
  perform pg_temp.as_user(ua);
  r := finish_activity(a);
  if not (r->>'checked_in')::boolean then raise exception 'full focus not completed: %', r; end if;

  -- Идэвхжил зорилготой холбогдсон, challenge-гүй.
  select count(*) into n from activities where goal_id = focus_g and challenge_id is null;
  if n <> 3 then raise exception 'goal activities wrong: %', n; end if;

  -- Архивласан зорилгоор эхлүүлэхгүй.
  update goals set status = 'archived' where id = run_g;
  perform pg_temp.expect_error(format('select start_goal_activity(%L)', run_g), 'goal_not_found');

  perform pg_temp.as_admin();
  raise notice 'verified goals OK';
end $$;

select 'verified goals OK';
