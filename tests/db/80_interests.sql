-- Сонирхол, ангилал, санал болгох группууд, groups update хамгаалалт.

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
  ('d1111111-1111-1111-1111-111111111111'),
  ('d2222222-2222-2222-2222-222222222222'),
  ('d3333333-3333-3333-3333-333333333333');
insert into profiles (id, username, display_name) values
  ('d1111111-1111-1111-1111-111111111111', 'int_owner', 'Owner'),
  ('d2222222-2222-2222-2222-222222222222', 'int_user', 'User'),
  ('d3333333-3333-3333-3333-333333333333', 'int_other', 'Other');

do $$
declare
  uo uuid := 'd1111111-1111-1111-1111-111111111111';
  uu uuid := 'd2222222-2222-2222-2222-222222222222';
  ux uuid := 'd3333333-3333-3333-3333-333333333333';
  g_lang uuid; g_fit uuid; g_priv uuid; g_none uuid; n int; ids uuid[];
begin
  -- ===== Группын ангилал, update хамгаалалт =====
  perform pg_temp.as_user(uo);
  g_lang := create_group('English Club', 'english-club-int', null, 'public', 'open');
  g_fit  := create_group('Morning Runners', 'morning-runners-int', null, 'public', 'open');
  g_priv := create_group('Secret English', 'secret-english-int', null, 'private', 'approval');
  g_none := create_group('No Category', 'no-category-int', null, 'public', 'open');
  update groups set category_id = 'language' where id in (g_lang, g_priv);
  update groups set category_id = 'fitness' where id = g_fit;
  perform pg_temp.expect_error(format('update groups set kind = ''course'' where id = %L', g_lang), 'permission denied');
  perform pg_temp.expect_error(format('update groups set owner_id = %L where id = %L', uu, g_lang), 'permission denied');
  perform pg_temp.expect_error(format('update groups set category_id = ''nope'' where id = %L', g_lang), 'foreign key');

  -- Бусдын группыг засахгүй (0 мөр)
  perform pg_temp.as_user(uu);
  update groups set name = 'Hacked' where id = g_lang;
  perform pg_temp.as_admin();
  select count(*) into n from groups where id = g_lang and name = 'English Club';
  assert n = 1, 'non-owner cannot rename';

  -- ===== Сонирхол =====
  perform pg_temp.as_user(uu);
  select count(*) into n from categories;
  assert n = 12, 'categories readable';
  perform pg_temp.expect_error('insert into user_interests (user_id, category_id) values (auth.uid(), ''music'')', 'permission denied');

  -- Сонирхолгүй үед: нийтийн, гишүүн биш группууд (хаалттай ороогүй)
  select array_agg(id) into ids from suggested_groups(10);
  assert g_lang = any(ids) and g_fit = any(ids) and not (g_priv = any(ids)), 'no interests: popular public groups';

  perform set_interests(array['language', 'reading', 'bogus']);
  select count(*) into n from user_interests where user_id = uu;
  assert n = 2, 'unknown category ignored';
  select count(*) into n from profiles where id = uu and interests_set_at is not null;
  assert n = 1, 'interests_set_at stamped';

  select array_agg(id) into ids from suggested_groups(10);
  assert ids = array[g_lang], 'only matching public group suggested, got ' || coalesce(ids::text, 'null');

  perform join_group(g_lang);
  select count(*) into n from suggested_groups(10);
  assert n = 0, 'joined group not suggested again';

  perform set_interests('{}');  -- алгасах
  select count(*) into n from user_interests where user_id = uu;
  assert n = 0, 'skip clears interests';

  -- Бусдын сонирхол харагдахгүй
  perform set_interests(array['music']);
  perform pg_temp.as_user(ux);
  select count(*) into n from user_interests where user_id = uu;
  assert n = 0, 'cannot read others interests';

  -- Бүртгэл устгахад сонирхол устна
  perform pg_temp.as_user(uu);
  perform delete_my_account();
  perform pg_temp.as_admin();
  select count(*) into n from user_interests where user_id = uu;
  assert n = 0, 'interests removed with account';

  raise notice 'ALL INTEREST TESTS PASSED';
end $$;
