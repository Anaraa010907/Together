-- Challenge тестүүд: үүсгэх, нэгдэх, check-in, XP, дуусгах урамшуулал, эрх, устгал.

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

select pg_temp.as_admin() \gset
insert into auth.users (id) values
  ('44444444-4444-4444-4444-444444444444'),
  ('55555555-5555-5555-5555-555555555555'),
  ('66666666-6666-6666-6666-666666666666');
insert into profiles (id, username, display_name) values
  ('44444444-4444-4444-4444-444444444444', 'erdene', 'Erdene'),
  ('55555555-5555-5555-5555-555555555555', 'gerel', 'Gerel'),
  ('66666666-6666-6666-6666-666666666666', 'tsetseg', 'Tsetseg');

do $$
declare
  u4 uuid := '44444444-4444-4444-4444-444444444444';
  u5 uuid := '55555555-5555-5555-5555-555555555555';
  u6 uuid := '66666666-6666-6666-6666-666666666666';
  g uuid; gp uuid; c1 uuid; c2 uuid; c3 uuid; c4 uuid; c5 uuid; cp uuid;
  res jsonb; today date; n int; v int;
begin
  today := (now() at time zone 'Asia/Ulaanbaatar')::date;

  -- ===== Үүсгэх =====
  perform pg_temp.as_user(u4);
  g  := create_group('Readers', 'readers', null, 'public', 'open');
  gp := create_group('Hidden Readers', 'hidden-readers', null, 'private', 'approval');
  c1 := create_challenge(g, 'Read 20 pages', null, today, 7);
  cp := create_challenge(gp, 'Secret plan', null, today, 7);

  select count(*) into n from challenge_participants where challenge_id = c1 and user_id = u4;
  assert n = 1, 'creator auto-joins';
  select end_on - start_on + 1 into n from challenges where id = c1;
  assert n = 7, '7-day challenge';

  perform pg_temp.expect_error(format('select create_challenge(%L, ''Bad one'', null, %L, 0)', g, today), 'invalid_duration');
  perform pg_temp.expect_error(format('select create_challenge(%L, ''Bad one'', null, %L, 91)', g, today), 'invalid_duration');
  perform pg_temp.expect_error(format('select create_challenge(%L, ''Bad one'', null, %L, 7)', g, today - 1), 'invalid_start');
  perform pg_temp.expect_error(format('select create_challenge(%L, ''X'', null, %L, 7)', g, today), 'invalid_title');

  -- ===== Гишүүн биш =====
  perform pg_temp.as_user(u6);
  perform pg_temp.expect_error(format('select create_challenge(%L, ''Mine'', null, %L, 7)', g, today), 'not_member');
  perform pg_temp.expect_error(format('select join_challenge(%L)', c1), 'not_member');
  select count(*) into n from challenges where id = c1;
  assert n = 1, 'public group challenge visible to non-member';
  select count(*) into n from challenges where id = cp;
  assert n = 0, 'private group challenge hidden from non-member';

  -- ===== Нэгдэх, check-in =====
  perform pg_temp.as_user(u5);
  perform join_group(g);
  perform join_challenge(c1);
  perform join_challenge(c1);  -- давтахад алдаагүй

  res := checkin_challenge(c1, today);
  assert (res->>'xp_gained')::int = 25, 'check-in gives 25 xp';
  assert not (res->>'completed')::boolean, 'not completed after 1 of 7';
  assert (res->>'days_done')::int = 1 and (res->>'days_total')::int = 7, 'progress 1/7';

  perform pg_temp.expect_error(format('select checkin_challenge(%L, %L)', c1, today), 'already_checked_in');
  perform pg_temp.expect_error(format('select checkin_challenge(%L, %L)', c1, today - 1), 'outside_challenge');
  perform pg_temp.expect_error(format('select checkin_challenge(%L, %L)', c1, today + 1), 'date_out_of_range');

  -- ===== Дуусгах урамшуулал =====
  c2 := create_challenge(g, 'One day sprint', null, today, 1);
  res := checkin_challenge(c2, today);
  assert (res->>'completed')::boolean, '1-day challenge completed';
  assert (res->>'xp_gained')::int = 225, 'completion bonus 25 + 200';
  select total_xp, current_level into v, n from user_progress where user_id = u5;
  assert v = 250 and n = 2, 'total 250 xp, level 2; got ' || v || '/' || n;
  select count(*) into n from challenge_participants where challenge_id = c2 and user_id = u5 and completed_at is not null;
  assert n = 1, 'completed_at set';

  -- ===== Гарч дахин нэгдэхэд XP давхардахгүй =====
  perform leave_challenge(c1);
  perform join_challenge(c1);
  perform pg_temp.expect_error(format('select checkin_challenge(%L, %L)', c1, today), 'already_checked_in');
  select total_xp into v from user_progress where user_id = u5;
  assert v = 250, 'no extra xp after rejoin';

  -- ===== Оролцогч биш =====
  perform pg_temp.as_user(u6);
  perform join_group(g);
  perform pg_temp.expect_error(format('select checkin_challenge(%L, %L)', c1, today), 'not_participant');

  -- ===== Өчигдрийг бүртгэх, дууссан challenge =====
  perform pg_temp.as_admin();
  insert into challenges (group_id, creator_id, title, start_on, end_on)
  values (g, u4, 'Started yesterday', today - 1, today + 5) returning id into c3;
  insert into challenge_participants (challenge_id, user_id) values (c3, u5);
  insert into challenges (group_id, creator_id, title, start_on, end_on)
  values (g, u4, 'Already over', today - 10, today - 3) returning id into c5;

  perform pg_temp.as_user(u5);
  res := checkin_challenge(c3, today - 1);
  assert (res->>'xp_gained')::int = 25, 'backfill yesterday allowed';

  perform pg_temp.as_user(u6);
  perform pg_temp.expect_error(format('select join_challenge(%L)', c5), 'challenge_ended');

  -- ===== Шууд бичих эрхгүй =====
  perform pg_temp.as_user(u5);
  perform pg_temp.expect_error(
    format('insert into challenge_checkins (challenge_id, user_id, checked_on) values (%L, %L, %L)', c3, u5, today),
    'permission denied');
  perform pg_temp.expect_error(
    format('insert into challenges (group_id, title, start_on, end_on) values (%L, ''Hack'', %L, %L)', g, today, today),
    'permission denied');
  perform pg_temp.expect_error(format('select _sync_xp(%L)', u5), 'permission denied');

  -- ===== Бүртгэл устгах =====
  c4 := create_challenge(g, 'Gerel plan', null, today, 3);
  perform delete_my_account();  -- u5
  perform pg_temp.as_admin();
  select count(*) into n from challenges where id = c4 and creator_id is null;
  assert n = 1, 'challenge survives creator deletion';
  select count(*) into n from challenge_checkins where user_id = u5;
  assert n = 0, 'deleted user check-ins removed';

  perform pg_temp.as_user(u4);
  perform delete_my_account();
  perform pg_temp.as_admin();
  select count(*) into n from challenges where group_id = g;
  assert n = 0, 'challenges removed with owned group';

  raise notice 'ALL CHALLENGE TESTS PASSED';
end $$;
