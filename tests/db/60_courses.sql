-- Сургалт тестүүд: багшийн профайл, нас, сургалт үүсгэх/нэгдэх, хичээл, XP, багшийн статистик.

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
  ('f1111111-1111-1111-1111-111111111111'),
  ('f2222222-2222-2222-2222-222222222222'),
  ('f3333333-3333-3333-3333-333333333333'),
  ('f4444444-4444-4444-4444-444444444444');
insert into profiles (id, username, display_name) values
  ('f1111111-1111-1111-1111-111111111111', 'teacher_t', 'Teacher'),
  ('f2222222-2222-2222-2222-222222222222', 'adult_a', 'Adult'),
  ('f3333333-3333-3333-3333-333333333333', 'minor_m', 'Minor'),
  ('f4444444-4444-4444-4444-444444444444', 'other_o', 'Other');

do $$
declare
  ut uuid := 'f1111111-1111-1111-1111-111111111111';  -- багш
  ua uuid := 'f2222222-2222-2222-2222-222222222222';  -- насанд хүрсэн суралцагч
  um uuid := 'f3333333-3333-3333-3333-333333333333';  -- 18 хүрээгүй
  uo uuid := 'f4444444-4444-4444-4444-444444444444';  -- бусад
  c uuid; cg uuid; l1 uuid; l2 uuid; res jsonb; n int; v int; i int;
begin
  -- ===== Багшийн профайл =====
  perform pg_temp.as_user(ut);
  perform pg_temp.expect_error($q$select create_course('English A2', 'english-a2-course')$q$, 'not_teacher');
  insert into teacher_profiles (user_id, headline, subjects, intro)
  values (ut, 'English teacher, 5 years', array['English', 'IELTS'], 'Hi!');
  perform pg_temp.expect_error(format('update teacher_profiles set verified_at = now() where user_id = %L', ut), 'permission denied');
  perform pg_temp.expect_error(
    format('update teacher_profiles set subjects = %L where user_id = %L', array['a','b','c','d','e','f'], ut), 'check constraint');
  perform pg_temp.expect_error(
    format('insert into teacher_profiles (user_id) values (%L)', ua), 'row-level security');

  c := create_course('English A2', 'english-a2-course', 'Beginner course');
  select count(*) into n from groups where id = c and kind = 'course' and join_policy = 'open';
  assert n = 1, 'course group created';
  cg := create_group('Plain group', 'plain-group-t', null, 'public', 'open');

  -- ===== Хичээл нэмэх: зөвхөн эзэн, зөвхөн сургалтад =====
  insert into course_lessons (group_id, position, title, content) values (c, 1, 'Greetings', 'Hello…') returning id into l1;
  insert into course_lessons (group_id, position, title, video_url) values (c, 2, 'Numbers', 'https://youtube.com/x') returning id into l2;
  perform pg_temp.expect_error(
    format('insert into course_lessons (group_id, position, title) values (%L, 1, ''Nope'')', cg), 'row-level security');

  -- ===== Нас =====
  perform pg_temp.as_user(ua);
  perform pg_temp.expect_error(format('select join_group(%L)', c), 'course_adults_only');  -- нас зарлаагүй
  perform pg_temp.expect_error(
    format('insert into course_lessons (group_id, position, title) values (%L, 3, ''Hack'')', c), 'row-level security');
  perform declare_age(true);
  perform pg_temp.expect_error('select declare_age(false)', 'age_already_declared');
  perform pg_temp.expect_error(format('update profiles set is_minor = true where id = %L', ua), 'permission denied');
  perform join_group(c);
  perform join_group(cg);  -- энгийн group-д насны шалгалт хамаарахгүй

  perform pg_temp.as_user(um);
  perform declare_age(false);
  perform pg_temp.expect_error(format('select join_group(%L)', c), 'course_adults_only');

  -- Урилгын кодоор ч тойрохгүй
  perform pg_temp.as_user(ut);
  perform pg_temp.as_admin();
  insert into group_invites (group_id, code, created_by) values (c, 'COURSE01', ut);
  perform pg_temp.as_user(um);
  perform pg_temp.expect_error($q$select redeem_group_invite('COURSE01')$q$, 'course_adults_only');

  -- Баталгаажсан багшийн сургалтад хүүхэд нэгдэнэ
  perform pg_temp.as_admin();
  update teacher_profiles set verified_at = now() where user_id = ut;
  perform pg_temp.as_user(um);
  perform join_group(c);

  -- ===== Хичээл дуусгах =====
  perform pg_temp.as_user(ua);
  perform pg_temp.expect_error(format('select complete_lesson(%L)', l2), 'previous_lesson_required');
  res := complete_lesson(l1);
  assert (res->>'xp_gained')::int = 30 and (res->>'done')::int = 1 and (res->>'total')::int = 2, 'lesson 1 done';
  perform pg_temp.expect_error(format('select complete_lesson(%L)', l1), 'already_completed');
  res := complete_lesson(l2);
  assert (res->>'done')::int = 2, 'course finished';
  select total_xp into v from user_progress where user_id = ua;
  assert v = 60, 'adult has 60 xp, got ' || v;
  perform pg_temp.expect_error(
    format('insert into lesson_completions (lesson_id, user_id) values (%L, %L)', l1, um), 'permission denied');

  perform pg_temp.as_user(ut);
  perform pg_temp.expect_error(format('select complete_lesson(%L)', l1), 'not_student');
  perform pg_temp.as_user(uo);
  perform pg_temp.expect_error(format('select complete_lesson(%L)', l1), 'not_member');

  -- Хөтөлбөр нийтийн сургалтад гаднаас харагдана, ахиц харагдахгүй
  select count(*) into n from course_lessons where group_id = c;
  assert n = 2, 'public syllabus visible';
  select count(*) into n from lesson_completions where lesson_id = l1;
  assert n = 0, 'non-member cannot see completions';

  -- ===== 50 хичээлийн хязгаар =====
  perform pg_temp.as_user(ut);
  for i in 3..50 loop
    insert into course_lessons (group_id, position, title) values (c, i, 'Lesson ' || i);
  end loop;
  perform pg_temp.expect_error(
    format('insert into course_lessons (group_id, position, title) values (%L, 51, ''Too many'')', c), 'check constraint');

  -- ===== Багшийн статистик, харагдах байдал =====
  perform pg_temp.as_user(uo);
  res := teacher_stats(ut);
  assert (res->>'courses')::int = 1 and (res->>'students')::int = 2, 'stats: 1 course, 2 students; got ' || res::text;
  select count(*) into n from teacher_profiles where user_id = ut;
  assert n = 1, 'enabled teacher profile visible';

  perform pg_temp.as_user(ut);
  update teacher_profiles set enabled = false where user_id = ut;
  perform pg_temp.as_user(uo);
  select count(*) into n from teacher_profiles where user_id = ut;
  assert n = 0, 'disabled teacher profile hidden';
  assert teacher_stats(ut) is null, 'no stats for disabled teacher';

  -- ===== Бүртгэл устгах =====
  perform pg_temp.as_user(ut);
  perform delete_my_account();
  perform pg_temp.as_admin();
  select count(*) into n from groups where id = c;           assert n = 0, 'course deleted with teacher';
  select count(*) into n from course_lessons where group_id = c; assert n = 0, 'lessons deleted';
  select count(*) into n from teacher_profiles where user_id = ut; assert n = 0, 'teacher profile deleted';

  raise notice 'ALL COURSE TESTS PASSED';
end $$;
