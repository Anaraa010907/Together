-- Сешн тестүүд: үүсгэх дүрэм, харагдах байдал, "Очно", тэмдэглэл, цуцлах, устгал.

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
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee');
insert into profiles (id, username, display_name) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'owner_b', 'Owner'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'host_c', 'Host'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'member_d', 'Member'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'outsider_e', 'Outsider');

do $$
declare
  ub uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';  -- group эзэн
  uc uuid := 'cccccccc-cccc-cccc-cccc-cccccccccccc';  -- хөтлөгч
  ud uuid := 'dddddddd-dddd-dddd-dddd-dddddddddddd';  -- гишүүн
  ue uuid := 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';  -- гадны
  g uuid; s uuid; s_old uuid; n int; txt text;
begin
  perform pg_temp.as_user(ub);
  g := create_group('Study Club', 'study-club', null, 'public', 'open');
  perform pg_temp.as_user(uc); perform join_group(g);
  perform pg_temp.as_user(ud); perform join_group(g);

  -- ===== Үүсгэх =====
  perform pg_temp.as_user(uc);
  s := create_session(g, 'Unit 5 together', 'Watch and discuss', now() + interval '2 days', 60, 'https://meet.google.com/abc-defg-hij');
  select count(*) into n from session_rsvps where session_id = s and user_id = uc;
  assert n = 1, 'host auto-rsvps';

  perform pg_temp.expect_error(format('select create_session(%L, ''Old'', null, now() - interval ''1 hour'', 60, null)', g), 'invalid_start');
  perform pg_temp.expect_error(format('select create_session(%L, ''Far'', null, now() + interval ''100 days'', 60, null)', g), 'invalid_start');
  perform pg_temp.expect_error(format('select create_session(%L, ''Short'', null, now() + interval ''1 day'', 5, null)', g), 'invalid_duration');
  perform pg_temp.expect_error(format('select create_session(%L, ''Bad link'', null, now() + interval ''1 day'', 60, ''http://x.com'')', g), 'invalid_url');
  perform pg_temp.expect_error(format('select create_session(%L, ''X'', null, now() + interval ''1 day'', 60, null)', g), 'invalid_title');
  perform pg_temp.expect_error(
    format('insert into group_sessions (group_id, title, starts_at) values (%L, ''Hack'', now())', g), 'permission denied');

  -- ===== Гадны хүн =====
  perform pg_temp.as_user(ue);
  select count(*) into n from group_sessions where id = s;
  assert n = 0, 'non-member cannot see sessions';
  perform pg_temp.expect_error(format('select create_session(%L, ''Mine'', null, now() + interval ''1 day'', 60, null)', g), 'not_member');
  perform pg_temp.expect_error(format('select rsvp_session(%L, true)', s), 'session_not_found');

  -- ===== "Очно" =====
  perform pg_temp.as_user(ud);
  perform rsvp_session(s, true);
  perform rsvp_session(s, true);  -- давтахад алдаагүй
  select count(*) into n from session_rsvps where session_id = s;
  assert n = 2, 'two attendees';
  perform rsvp_session(s, false);
  select count(*) into n from session_rsvps where session_id = s and user_id = ud;
  assert n = 0, 'rsvp removed';
  perform pg_temp.expect_error(format('insert into session_rsvps (session_id, user_id) values (%L, %L)', s, ud), 'permission denied');

  -- ===== Тэмдэглэл: зөвхөн хөтлөгч / эзэн =====
  perform pg_temp.expect_error(format('select update_session(%L, ''hi'', null)', s), 'not_host');
  perform pg_temp.as_user(uc);
  perform update_session(s, 'Key phrases: ...', 'https://zoom.us/j/123');
  perform pg_temp.expect_error(format('select update_session(%L, ''x'', ''ftp://x'')', s), 'invalid_url');
  perform pg_temp.as_user(ub);
  perform update_session(s, 'Edited by owner', 'https://zoom.us/j/123');
  select notes into txt from group_sessions where id = s;
  assert txt = 'Edited by owner', 'owner can edit notes';

  -- ===== Дууссан сешн =====
  perform pg_temp.as_admin();
  insert into group_sessions (group_id, host_id, title, starts_at, duration_min)
  values (g, uc, 'Last week', now() - interval '3 days', 60) returning id into s_old;
  perform pg_temp.as_user(ud);
  perform pg_temp.expect_error(format('select rsvp_session(%L, true)', s_old), 'session_ended');

  -- ===== Цуцлах =====
  perform pg_temp.expect_error(format('select cancel_session(%L)', s), 'not_host');
  perform pg_temp.as_user(uc);
  perform cancel_session(s);
  perform pg_temp.as_user(ud);
  perform pg_temp.expect_error(format('select rsvp_session(%L, true)', s), 'session_cancelled');

  -- ===== Бүртгэл устгах: сешн үлдэнэ, хөтлөгч null =====
  perform pg_temp.as_user(uc);
  perform delete_my_account();
  perform pg_temp.as_admin();
  select count(*) into n from group_sessions where id = s and host_id is null;
  assert n = 1, 'session survives host deletion';
  select count(*) into n from session_rsvps where user_id = uc;
  assert n = 0, 'host rsvps removed';

  -- Group устахад сешн устна
  perform pg_temp.as_user(ub);
  perform delete_my_account();
  perform pg_temp.as_admin();
  select count(*) into n from group_sessions where group_id = g;
  assert n = 0, 'sessions removed with group';

  raise notice 'ALL SESSION TESTS PASSED';
end $$;
