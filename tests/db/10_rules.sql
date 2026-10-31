-- TOGETHER DB дүрмийн тестүүд: constraint, RLS, column grant, функцийн логик.
-- Амжилтгүй бол exception гарч, скрипт зогсоно.

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

-- stmt нь алдаа гаргах ёстой; алдааны текст expected-г агуулсан байх ёстой.
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

-- Fixtures (superuser)
select pg_temp.as_admin() \gset
insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222'),
  ('33333333-3333-3333-3333-333333333333');
insert into profiles (id, username, display_name) values
  ('11111111-1111-1111-1111-111111111111', 'anna', 'Anna'),
  ('22222222-2222-2222-2222-222222222222', 'bat', 'Bat'),
  ('33333333-3333-3333-3333-333333333333', 'dorj', 'Dorj');

do $$
declare
  u1 uuid := '11111111-1111-1111-1111-111111111111';
  u2 uuid := '22222222-2222-2222-2222-222222222222';
  u3 uuid := '33333333-3333-3333-3333-333333333333';
  g_open uuid; g_priv uuid; g_invite uuid; goal uuid;
  res jsonb; st text; today date; n int; v int;
begin
  -- ===== Групп үүсгэх =====
  perform pg_temp.as_user(u1);
  select create_group('Morning Run', 'morning-run', 'desc', 'public', 'open') into g_open;
  select count(*) into n from group_members
    where group_id = g_open and user_id = u1 and role = 'owner' and status = 'active';
  assert n = 1, 'creator must be active owner';

  select create_group('Secret Club', 'secret-club', null, 'private', 'open') into g_priv;
  select create_group('Invite Only', 'invite-only', null, 'public', 'invite_only') into g_invite;

  perform pg_temp.expect_error($q$select create_group('Dup', 'morning-run', null, 'public', 'open')$q$, 'slug_taken');
  perform pg_temp.expect_error($q$select create_group('Xy', 'ab', null, 'public', 'open')$q$, 'invalid_slug');
  perform pg_temp.expect_error($q$select create_group('X', 'valid-slug', null, 'public', 'open')$q$, 'invalid_name');

  -- ===== Нэгдэх =====
  perform pg_temp.as_user(u2);
  select join_group(g_open) into st;
  assert st = 'active', 'open public group joins directly';
  perform pg_temp.expect_error(format('select join_group(%L)', g_open), 'already_member');

  select join_group(g_priv) into st;
  assert st = 'pending', 'private group needs approval';
  select join_group(g_priv) into st;
  assert st = 'pending', 'repeat join keeps pending';

  select count(*) into n from groups where id = g_priv;
  assert n = 0, 'pending user must not see private group';

  perform pg_temp.expect_error(format('select join_group(%L)', g_invite), 'invite_only');

  -- Клиент шууд бичиж болохгүй
  perform pg_temp.expect_error(
    format('insert into groups (owner_id, name, slug) values (%L, ''Hack'', ''hack-grp'')', u2),
    'permission denied');
  perform pg_temp.expect_error(
    format('insert into group_members (group_id, user_id) values (%L, %L)', g_priv, u2),
    'permission denied');

  -- ===== Эзэн зөвшөөрөх =====
  perform pg_temp.as_user(u3);
  perform pg_temp.expect_error(format('select review_join_request(%L, %L, true)', g_priv, u2), 'not_owner');

  perform pg_temp.as_user(u1);
  perform review_join_request(g_priv, u2, true);
  perform pg_temp.as_user(u2);
  select count(*) into n from groups where id = g_priv;
  assert n = 1, 'approved member sees private group';

  -- Эзэн гарч чадахгүй
  perform pg_temp.as_user(u1);
  perform pg_temp.expect_error(format('select leave_group(%L)', g_open), 'owner_cannot_leave');

  -- ===== Цэвэрлэгээ: гишүүн гарна =====
  perform pg_temp.as_user(u2);
  perform leave_group(g_open);
  select count(*) into n from group_members where group_id = g_open and user_id = u2;
  assert n = 0, 'member can leave';

  -- ===== Өдрийн зорилго, XP, streak =====
  perform pg_temp.as_user(u1);
  insert into goals (user_id, title, group_id) values (u1, 'Run 5km', g_open) returning id into goal;
  select (now() at time zone 'Asia/Ulaanbaatar')::date into today;

  res := complete_goal(goal, today);
  assert (res->>'xp_gained')::int = 20, 'first completion gives 20 xp';
  assert (res->>'streak')::int = 1, 'streak 1 after today';

  perform pg_temp.expect_error(format('select complete_goal(%L, %L)', goal, today), 'already_completed');

  -- Өчигдрийг backfill хийхэд streak буурахгүй (хамгийн сүүлийн өдрөөс тооцно)
  res := complete_goal(goal, today - 1);
  assert (res->>'streak')::int = 2, 'backfilling yesterday keeps streak';

  perform pg_temp.expect_error(format('select complete_goal(%L, %L)', goal, today - 2), 'date_out_of_range');
  perform pg_temp.expect_error(format('select complete_goal(%L, %L)', goal, today + 1), 'date_out_of_range');

  select total_xp into v from user_progress where user_id = u1;
  assert v = 40, 'total xp is sum of transactions (40), got ' || coalesce(v::text, 'null');

  -- Өөр хэрэглэгч чужим зорилгыг биелүүлж чадахгүй
  perform pg_temp.as_user(u2);
  perform pg_temp.expect_error(format('select complete_goal(%L, %L)', goal, today), 'goal_not_found');

  -- Биелэлтийн мөрийг шууд бичиж болохгүй
  perform pg_temp.as_user(u1);
  perform pg_temp.expect_error(
    format('insert into goal_completions (goal_id, user_id, completed_on) values (%L, %L, %L)', goal, u1, today - 3),
    'permission denied');

  -- XP / progress-ийг шууд засаж болохгүй
  perform pg_temp.expect_error(
    format('insert into xp_transactions (user_id, source_type, source_id, amount) values (%L, ''hack'', gen_random_uuid(), 999)', u1),
    'permission denied');

  -- ===== Профайлын багана хамгаалалт =====
  perform pg_temp.expect_error(format('update profiles set is_minor = true where id = %L', u1), 'permission denied');

  -- Гишүүдийн мэдээлэл: өөрийн профайлыг л өөрчилнө
  perform pg_temp.as_user(u2);
  update profiles set display_name = 'Bat X' where id = u1; -- 0 мөр, алдаа биш
  select display_name into st from profiles where id = u1;
  assert st = 'Anna', 'cannot edit another profile';

  -- ===== Invite-only + banned: хүснэгтэд шууд орох боломжгүй =====
  perform pg_temp.as_admin();
  insert into group_members (group_id, user_id, role, status) values (g_priv, u3, 'member', 'banned');
  perform pg_temp.as_user(u3);
  perform pg_temp.expect_error(format('select join_group(%L)', g_priv), 'banned');

  raise notice 'ALL RULE TESTS PASSED';
end $$;
