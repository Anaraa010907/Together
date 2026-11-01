-- Мэдэгдэл ба avatar storage тестүүд.

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
  ('c1111111-1111-1111-1111-111111111111'),
  ('c2222222-2222-2222-2222-222222222222'),
  ('c3333333-3333-3333-3333-333333333333');
insert into profiles (id, username, display_name, is_minor, age_declared_at) values
  ('c1111111-1111-1111-1111-111111111111', 'n_owner', 'Owner', false, now()),
  ('c2222222-2222-2222-2222-222222222222', 'n_member', 'Member', false, now()),
  ('c3333333-3333-3333-3333-333333333333', 'n_third', 'Third', false, now());

do $$
declare
  uo uuid := 'c1111111-1111-1111-1111-111111111111';
  um uuid := 'c2222222-2222-2222-2222-222222222222';
  u3 uuid := 'c3333333-3333-3333-3333-333333333333';
  g uuid; gp uuid; p uuid; prop uuid; s uuid; c uuid; n int; nid uuid;
begin
  perform pg_temp.as_user(uo);
  g  := create_group('Notify Club', 'notify-club', null, 'public', 'open');
  gp := create_group('Notify Private', 'notify-private', null, 'private', 'approval');

  -- ===== Нэгдэх хүсэлт / зөвшөөрөл =====
  perform pg_temp.as_user(um);
  perform join_group(gp);
  perform pg_temp.as_admin();
  select count(*) into n from notifications where user_id = uo and type = 'join_request' and actor_id = um and group_id = gp;
  assert n = 1, 'owner notified of join request';
  perform pg_temp.as_user(uo);
  perform review_join_request(gp, um, true);
  perform pg_temp.as_admin();
  select count(*) into n from notifications where user_id = um and type = 'join_approved' and group_id = gp;
  assert n = 1, 'member notified of approval';

  -- ===== Сэтгэгдэл, Тустай =====
  perform pg_temp.as_user(um);
  perform join_group(g);
  insert into posts (group_id, author_id, body) values (g, um, 'My notes') returning id into p;
  perform pg_temp.as_user(uo);
  insert into comments (post_id, author_id, body) values (p, uo, 'Nice!');
  perform mark_helpful(p);
  perform pg_temp.as_user(um);
  insert into comments (post_id, author_id, body) values (p, um, 'Thanks');  -- өөртөө мэдэгдэхгүй
  perform pg_temp.as_admin();
  select count(*) into n from notifications where user_id = um and type = 'comment' and entity_id = p;
  assert n = 1, 'author notified once (not for own comment)';
  select count(*) into n from notifications where user_id = um and type = 'helpful' and entity_id = p;
  assert n = 1, 'author notified of helpful';

  -- ===== Блоклосон хүнээс мэдэгдэл ирэхгүй =====
  perform pg_temp.as_user(u3);
  perform join_group(g);
  perform pg_temp.as_user(um);
  insert into user_blocks (blocker_id, blocked_id) values (um, u3);
  perform pg_temp.as_user(u3);
  insert into comments (post_id, author_id, body) values (p, u3, 'spam');
  perform pg_temp.as_admin();
  select count(*) into n from notifications where user_id = um and actor_id = u3;
  assert n = 0, 'no notifications from blocked user';

  -- ===== Санал, сешн → группын гишүүдэд =====
  perform pg_temp.as_user(uo);
  insert into posts (group_id, author_id, kind, body) values (g, uo, 'proposal', 'Meet Friday?') returning id into prop;
  s := create_session(g, 'Study night', null, now() + interval '1 day', 60, null);
  perform pg_temp.as_admin();
  select count(*) into n from notifications where type = 'proposal' and entity_id = prop;
  assert n = 2, 'proposal to 2 members (not author)';
  select count(*) into n from notifications where type = 'session' and entity_id = s and user_id <> uo;
  assert n = 2, 'session to 2 members';
  select count(*) into n from notifications where user_id = uo and type in ('proposal', 'session');
  assert n = 0, 'actor not notified';

  -- ===== Хичээл → суралцагчдад =====
  perform pg_temp.as_user(uo);
  insert into teacher_profiles (user_id, subjects) values (uo, array['English']);
  c := create_course('Notify Course', 'notify-course');
  perform pg_temp.as_user(um);
  perform join_group(c);
  perform pg_temp.as_user(uo);
  insert into course_lessons (group_id, position, title) values (c, 1, 'Lesson one');
  perform pg_temp.as_admin();
  select count(*) into n from notifications where type = 'lesson' and group_id = c;
  assert n = 1, 'one student notified of lesson';

  -- ===== Эрх: өөрийнхөө л харна, уншсан гэж тэмдэглэнэ, шууд бичихгүй =====
  perform pg_temp.as_user(u3);
  select count(*) into n from notifications where user_id = um;
  assert n = 0, 'cannot read others notifications';
  perform pg_temp.expect_error(
    format('insert into notifications (user_id, type) values (%L, ''comment'')', um), 'permission denied');
  perform pg_temp.expect_error(format('select _notify(%L, ''comment'', null, null, null, ''{}'')', um), 'permission denied');

  perform pg_temp.as_user(um);
  select id into nid from notifications where user_id = um limit 1;
  update notifications set read_at = now() where user_id = um;
  perform pg_temp.expect_error(format('update notifications set type = ''lesson'' where id = %L', nid), 'permission denied');
  select count(*) into n from notifications where user_id = um and read_at is null;
  assert n = 0, 'marked all read';

  -- ===== Avatar storage =====
  insert into storage.objects (bucket_id, name) values ('avatars', um::text || '/avatar.jpg');
  perform pg_temp.expect_error(
    format('insert into storage.objects (bucket_id, name) values (''avatars'', %L)', uo::text || '/avatar.jpg'),
    'row-level security');
  update profiles set avatar_url = 'https://example.supabase.co/storage/v1/object/public/avatars/x.jpg' where id = um;
  perform pg_temp.expect_error(format('update profiles set avatar_url = ''javascript:x'' where id = %L', um), 'check constraint');

  -- Бүртгэл устгахад мэдэгдэл устна
  perform delete_my_account();
  perform pg_temp.as_admin();
  select count(*) into n from notifications where user_id = um or actor_id = um;
  assert n = 0, 'notifications removed with account';

  raise notice 'ALL NOTIFICATION TESTS PASSED';
end $$;
