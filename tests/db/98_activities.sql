-- Баталгаажсан идэвхжил: GPS гүйлт, байршил, фокус; хууран мэхлэлтийн шалгалтууд.

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

-- Шулуун маршрут: n цэг, step_s секунд тутам, step_m метр явна (хойд зүг рүү).
create or replace function pg_temp.track(start_ms double precision, n int, step_s int, step_m double precision,
                                         lat0 double precision default 47.9, lng0 double precision default 106.9)
returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object(
    'lat', lat0 + (i * step_m) / 111195.0, 'lng', lng0, 't', start_ms + i * step_s * 1000, 'acc', 8) order by i)
  from generate_series(0, n - 1) i;
$$;

-- Идэвхжлийн эхлэх цагийг "өнгөрсөн" болгоно (тестэд хугацаа өнгөрөөх).
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
  ('e8111111-1111-1111-1111-111111111111'),
  ('e8222222-2222-2222-2222-222222222222');
insert into profiles (id, username, display_name, is_minor, age_declared_at) values
  ('e8111111-1111-1111-1111-111111111111', 'runner_a', 'RunnerA', false, now()),
  ('e8222222-2222-2222-2222-222222222222', 'runner_b', 'RunnerB', false, now());

do $$
declare
  ua uuid := 'e8111111-1111-1111-1111-111111111111';
  ub uuid := 'e8222222-2222-2222-2222-222222222222';
  g uuid; run_c uuid; place_c uuid; focus_c uuid; today date;
  a uuid; s double precision; r jsonb; n bigint; xp0 int; xp1 int;
begin
  perform pg_temp.as_user(ua);
  g := create_group('Run Club', 'run-club', null, 'public', 'open');
  today := (now() at time zone 'Asia/Ulaanbaatar')::date;

  -- Гүйлтийн challenge: өдөрт ≥ 3 км.
  run_c := create_challenge(g, '30 хоног гүйлт', null, today, 30);
  perform set_challenge_verification(run_c, 'gps', 'run', 3000);
  perform pg_temp.expect_error(format('select checkin_challenge(%L, %L)', run_c, today), 'verification_required');

  -- Бусад хүн тохиргоог өөрчилж чадахгүй.
  perform pg_temp.as_user(ub);
  perform join_group(g);
  perform join_challenge(run_c);
  perform pg_temp.expect_error(format('select set_challenge_verification(%L, ''manual'')', run_c), 'not_creator');

  -- Буруу төрөл.
  perform pg_temp.as_user(ua);
  perform pg_temp.expect_error(format('select start_activity(%L, ''ride'')', run_c), 'kind_mismatch');

  -- 1) Хэвийн гүйлт: 150 цэг × 10 сек × 28 м ≈ 4.2 км, 25 мин, 2.8 м/с → баталгаажиж check-in.
  select (xp.total_xp) into xp0 from user_progress xp where xp.user_id = ua;
  a := (start_activity(run_c, 'run')->>'id')::uuid;
  s := pg_temp.backdate(a, 1500);
  perform pg_temp.as_user(ua);
  r := finish_activity(a, pg_temp.track(s + 1000, 150, 10, 28));
  if not (r->>'verified')::boolean or not (r->>'checked_in')::boolean then raise exception 'valid run rejected: %', r; end if;
  if (r->>'distance_m')::int not between 4100 and 4250 then raise exception 'distance wrong: %', r; end if;
  select total_xp into xp1 from user_progress where user_id = ua;
  if coalesce(xp1, 0) - coalesce(xp0, 0) < 25 then raise exception 'xp not awarded'; end if;

  -- 2) Машинаар: 30 м/с → too_fast.
  a := (start_activity(run_c, 'run')->>'id')::uuid;
  s := pg_temp.backdate(a, 600);
  perform pg_temp.as_user(ua);
  r := finish_activity(a, pg_temp.track(s + 1000, 50, 10, 300));
  if (r->>'verified')::boolean or r->>'reason' <> 'too_fast' then raise exception 'car ride accepted: %', r; end if;

  -- 3) Хуурамч байршил.
  a := (start_activity(run_c, 'run')->>'id')::uuid;
  s := pg_temp.backdate(a, 1500);
  perform pg_temp.as_user(ua);
  r := finish_activity(a, pg_temp.track(s + 1000, 150, 10, 28), true);
  if r->>'reason' <> 'mock_location' then raise exception 'mock accepted: %', r; end if;

  -- 4) Хуучин бичлэг (эхлэхээс өмнөх цаг) → bad_timestamps.
  a := (start_activity(run_c, 'run')->>'id')::uuid;
  s := pg_temp.backdate(a, 1500);
  perform pg_temp.as_user(ua);
  r := finish_activity(a, pg_temp.track(s - 3600 * 1000, 150, 10, 28));
  if r->>'reason' <> 'bad_timestamps' then raise exception 'old track accepted: %', r; end if;

  -- 5) Богино гүйлт: баталгаажсан ч 3 км хүрэхгүй → check-in байхгүй.
  perform pg_temp.as_user(ub);
  a := (start_activity(run_c, 'run')->>'id')::uuid;
  s := pg_temp.backdate(a, 600);
  perform pg_temp.as_user(ub);
  r := finish_activity(a, pg_temp.track(s + 1000, 60, 10, 25));
  if not (r->>'verified')::boolean or (r->>'meets')::boolean or (r->>'checked_in')::boolean then
    raise exception 'short run should verify without check-in: %', r;
  end if;

  -- Дуусгасан бүртгэлийг дахин дуусгах боломжгүй; бусдынхыг дуусгахгүй.
  perform pg_temp.expect_error(format('select finish_activity(%L)', a), 'activity_closed');
  a := (start_activity(run_c, 'run')->>'id')::uuid;
  perform pg_temp.as_user(ua);
  perform pg_temp.expect_error(format('select finish_activity(%L)', a), 'activity_not_found');

  -- Самбар: A — 1 өдөр, ~4.2 км.
  select days into n from challenge_board(run_c) where user_id = ua;
  if n <> 1 then raise exception 'board days wrong: %', n; end if;

  -- ===== Байршил: фитнес заалд 45 мин =====
  place_c := create_challenge(g, 'Фитнес 45 мин', null, today, 14);
  perform set_challenge_verification(place_c, 'place', null, null, 45, 'Gym', 47.92, 106.92, 100);
  a := (start_activity(place_c, 'place')->>'id')::uuid;
  s := pg_temp.backdate(a, 2760);
  perform pg_temp.as_user(ua);
  -- 47 цэг минут тутам, бүгд заалд (≈20 м зайтай).
  r := finish_activity(a, (select jsonb_agg(jsonb_build_object('lat', 47.92 + 0.0002, 'lng', 106.92, 't', s + 1000 + i * 60000, 'acc', 15) order by i) from generate_series(0, 45) i));
  if not (r->>'verified')::boolean or not (r->>'checked_in')::boolean then raise exception 'gym visit rejected: %', r; end if;

  -- Заалнаас 2 км зайд → outside_place (маргааш биш өнөөдөр дахин — шинэ challenge дээр шалгана).
  perform pg_temp.as_user(ub);
  perform join_challenge(place_c);
  a := (start_activity(place_c, 'place')->>'id')::uuid;
  s := pg_temp.backdate(a, 2760);
  perform pg_temp.as_user(ub);
  r := finish_activity(a, (select jsonb_agg(jsonb_build_object('lat', 47.94, 'lng', 106.92, 't', s + 1000 + i * 60000, 'acc', 15) order by i) from generate_series(0, 45) i));
  if r->>'reason' <> 'outside_place' then raise exception 'far away accepted: %', r; end if;

  -- ===== Фокус: 25 мин =====
  perform pg_temp.as_user(ua);
  focus_c := create_challenge(g, 'Өдөрт 25 мин фокус', null, today, 7);
  perform set_challenge_verification(focus_c, 'focus', null, null, 25);
  a := (start_activity(focus_c, 'focus')->>'id')::uuid;
  perform pg_temp.backdate(a, 600);
  perform pg_temp.as_user(ua);
  r := finish_activity(a);
  if r->>'reason' <> 'too_short' then raise exception 'short focus accepted: %', r; end if;
  a := (start_activity(focus_c, 'focus')->>'id')::uuid;
  perform pg_temp.backdate(a, 1520);
  perform pg_temp.as_user(ua);
  r := finish_activity(a, '[]', false, true);
  if r->>'reason' <> 'interrupted' then raise exception 'interrupted focus accepted: %', r; end if;
  a := (start_activity(focus_c, 'focus')->>'id')::uuid;
  perform pg_temp.backdate(a, 1520);
  perform pg_temp.as_user(ua);
  r := finish_activity(a);
  if not (r->>'checked_in')::boolean then raise exception 'focus not checked in: %', r; end if;

  -- Бусдын идэвхжлийг харахгүй; клиент шууд бичихгүй.
  perform pg_temp.as_user(ub);
  select count(*) into n from activities where user_id = ua;
  if n <> 0 then raise exception 'activities leaked'; end if;
  perform pg_temp.expect_error(format($q$insert into activities (user_id, kind) values (%L, 'run')$q$, ub), 'permission denied');
  execute 'reset role';
end $$;

select 'activities OK';
