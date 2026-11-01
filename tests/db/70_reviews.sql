-- Үнэлгээний тестүүд: эрх, ахицын шаардлага, засах, харагдах байдал, багшийн дундаж.

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
  ('e1111111-1111-1111-1111-111111111111'),
  ('e2222222-2222-2222-2222-222222222222'),
  ('e3333333-3333-3333-3333-333333333333'),
  ('e4444444-4444-4444-4444-444444444444');
insert into profiles (id, username, display_name, is_minor, age_declared_at) values
  ('e1111111-1111-1111-1111-111111111111', 'rev_teacher', 'Teacher', false, now()),
  ('e2222222-2222-2222-2222-222222222222', 'rev_s1', 'Student 1', false, now()),
  ('e3333333-3333-3333-3333-333333333333', 'rev_s2', 'Student 2', false, now()),
  ('e4444444-4444-4444-4444-444444444444', 'rev_out', 'Outsider', false, now());

do $$
declare
  ut uuid := 'e1111111-1111-1111-1111-111111111111';
  s1 uuid := 'e2222222-2222-2222-2222-222222222222';
  s2 uuid := 'e3333333-3333-3333-3333-333333333333';
  uo uuid := 'e4444444-4444-4444-4444-444444444444';
  c uuid; cp uuid; g uuid; l1 uuid; l2 uuid; l3 uuid; rid uuid; n int; res jsonb;
begin
  perform pg_temp.as_user(ut);
  insert into teacher_profiles (user_id, subjects) values (ut, array['Math']);
  c := create_course('Algebra', 'algebra-rev');
  cp := create_course('Private Algebra', 'algebra-rev-private', null, 'private');
  g := create_group('Not a course', 'not-a-course-rev', null, 'public', 'open');
  insert into course_lessons (group_id, position, title) values (c, 1, 'L1') returning id into l1;
  insert into course_lessons (group_id, position, title) values (c, 2, 'L2') returning id into l2;
  insert into course_lessons (group_id, position, title) values (c, 3, 'L3') returning id into l3;

  perform pg_temp.expect_error(format('select review_course(%L, 5, null)', c), 'not_student');
  perform pg_temp.expect_error(format('select review_course(%L, 5, null)', g), 'not_course');

  perform pg_temp.as_user(uo);
  perform pg_temp.expect_error(format('select review_course(%L, 5, null)', c), 'not_member');

  -- ===== Ахицын шаардлага: 3-аас 2 (тал хувиас доошгүй) =====
  perform pg_temp.as_user(s1);
  perform join_group(c);
  perform pg_temp.expect_error(format('select review_course(%L, 5, null)', c), 'not_enough_progress');
  perform complete_lesson(l1);
  perform pg_temp.expect_error(format('select review_course(%L, 5, null)', c), 'not_enough_progress');
  perform complete_lesson(l2);
  perform pg_temp.expect_error(format('select review_course(%L, 6, null)', c), 'invalid_rating');
  perform review_course(c, 5, 'Great teacher!');
  perform review_course(c, 4, 'Good, a bit fast');  -- засах
  select count(*) into n from course_reviews where group_id = c and user_id = s1 and rating = 4;
  assert n = 1, 'review updated, single row';
  perform pg_temp.expect_error(
    format('insert into course_reviews (group_id, user_id, rating) values (%L, %L, 5)', c, s1), 'permission denied');
  perform pg_temp.expect_error(
    format('update course_reviews set rating = 5 where group_id = %L', c), 'permission denied');

  perform pg_temp.as_user(s2);
  perform join_group(c);
  perform complete_lesson(l1);
  perform complete_lesson(l2);
  perform review_course(c, 2, null);

  -- Өөр хүний үнэлгээг устгахгүй (0 мөр)
  delete from course_reviews where group_id = c and user_id = s1;
  perform pg_temp.as_admin();
  select count(*) into n from course_reviews where group_id = c;
  assert n = 2, 'cannot delete others review';

  -- ===== Харагдах байдал, report =====
  perform pg_temp.as_user(uo);
  select count(*) into n from course_reviews where group_id = c;
  assert n = 2, 'public course reviews visible to outsider';
  select id into rid from course_reviews where group_id = c and user_id = s2;
  insert into user_reports (reporter_id, target_type, target_id, reason) values (uo, 'review', rid, 'spam');

  -- ===== Багшийн дундаж =====
  res := teacher_stats(ut);
  assert (res->>'rating_count')::int = 2 and (res->>'rating_avg')::numeric = 3.0,
    'avg 3.0 of 2 reviews; got ' || res::text;

  -- Өөрийн үнэлгээг устгана
  perform pg_temp.as_user(s2);
  delete from course_reviews where group_id = c and user_id = s2;
  res := teacher_stats(ut);
  assert (res->>'rating_count')::int = 1 and (res->>'rating_avg')::numeric = 4.0, 'avg after delete';

  -- Бүртгэл устгахад үнэлгээ устна
  perform pg_temp.as_user(s1);
  perform delete_my_account();
  perform pg_temp.as_admin();
  select count(*) into n from course_reviews where user_id = s1;
  assert n = 0, 'reviews removed with account';

  raise notice 'ALL REVIEW TESTS PASSED';
end $$;
