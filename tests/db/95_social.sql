-- Дагах, хадгалсан пост, профайл/группын статистик, хүн хайх.

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
  ('e5111111-1111-1111-1111-111111111111'),
  ('e5222222-2222-2222-2222-222222222222'),
  ('e5333333-3333-3333-3333-333333333333');
insert into profiles (id, username, display_name, is_minor, age_declared_at) values
  ('e5111111-1111-1111-1111-111111111111', 's_alpha', 'Alpha', false, now()),
  ('e5222222-2222-2222-2222-222222222222', 's_beta', 'Beta', false, now()),
  ('e5333333-3333-3333-3333-333333333333', 's_gamma', 'Gamma', false, now());

do $$
declare
  ua uuid := 'e5111111-1111-1111-1111-111111111111';
  ub uuid := 'e5222222-2222-2222-2222-222222222222';
  uc uuid := 'e5333333-3333-3333-3333-333333333333';
  g uuid; gp uuid; p uuid; pp uuid; n int; j jsonb;
begin
  -- ===== Дагах =====
  perform pg_temp.as_user(ua);
  insert into follows (follower_id, followee_id) values (ua, ub);
  perform pg_temp.expect_error(format($q$insert into follows (follower_id, followee_id) values (%L, %L)$q$, ub, uc),
    'row-level security');                                   -- бусдын нэрийн өмнөөс
  perform pg_temp.expect_error(format($q$insert into follows (follower_id, followee_id) values (%L, %L)$q$, ua, ua),
    'follows_check');                                        -- өөрийгөө

  -- Мэдэгдэл: B-д follow ирнэ.
  perform pg_temp.as_admin();
  select count(*) into n from notifications where user_id = ub and type = 'follow' and actor_id = ua;
  if n <> 1 then raise exception 'follow notification missing: %', n; end if;

  -- Блоклосон хүнийг дагах боломжгүй.
  perform pg_temp.as_user(uc);
  insert into user_blocks (blocker_id, blocked_id) values (uc, ua);
  perform pg_temp.as_user(ua);
  perform pg_temp.expect_error(format($q$insert into follows (follower_id, followee_id) values (%L, %L)$q$, ua, uc),
    'row-level security');

  -- Хүн хайх: өөрийгөө болон блоклосон хосыг хасна.
  select count(*) into n from search_people(null, 20) where id in (ua, uc);
  if n <> 0 then raise exception 'search_people leaked self/blocked: %', n; end if;
  select count(*) into n from search_people('s_be', 20) where id = ub and i_follow and followers = 1;
  if n <> 1 then raise exception 'search_people beta wrong'; end if;
  select count(*) into n from search_people('%', 20);        -- wildcard-ыг шүүнэ
  if n < 1 then raise exception 'search_people wildcard query failed'; end if;

  -- Профайлын статистик.
  j := profile_stats(ub);
  if (j->>'followers')::int <> 1 or not (j->>'i_follow')::boolean or j ? 'goals_done' then
    raise exception 'profile_stats(other) wrong: %', j;
  end if;
  j := profile_stats(ua);
  if (j->>'following')::int <> 1 or not (j ? 'goals_done') then
    raise exception 'profile_stats(self) wrong: %', j;
  end if;

  -- Дагахаа болих (зөвхөн өөрийнхөө).
  perform pg_temp.as_user(ub);
  delete from follows where follower_id = ua and followee_id = ub;   -- RLS: B устгаж чадахгүй
  perform pg_temp.as_user(ua);
  select count(*) into n from follows where follower_id = ua;
  if n <> 1 then raise exception 'other user removed my follow'; end if;
  delete from follows where follower_id = ua and followee_id = ub;
  select count(*) into n from follows where follower_id = ua;
  if n <> 0 then raise exception 'unfollow failed'; end if;

  -- ===== Хадгалсан пост =====
  perform pg_temp.as_user(ub);
  g  := create_group('Social Club', 'social-club', null, 'public', 'open');
  gp := create_group('Social Private', 'social-private', null, 'private', 'approval');
  insert into posts (group_id, author_id, body) values (g, ub, 'public post') returning id into p;
  insert into posts (group_id, author_id, body) values (gp, ub, 'secret post') returning id into pp;

  perform pg_temp.as_user(ua);
  perform pg_temp.expect_error(format($q$insert into post_saves (user_id, post_id) values (%L, %L)$q$, ua, p),
    'row-level security');                                   -- гишүүн биш
  perform join_group(g);
  insert into post_saves (user_id, post_id) values (ua, p);
  perform pg_temp.expect_error(format($q$insert into post_saves (user_id, post_id) values (%L, %L)$q$, ua, pp),
    'row-level security');                                   -- харах эрхгүй пост
  perform pg_temp.as_user(ub);
  select count(*) into n from post_saves;
  if n <> 0 then raise exception 'saves visible to others'; end if;

  -- ===== Группын статистик =====
  perform pg_temp.as_user(ua);
  select count(*) into n from group_stats(array[g, gp]);
  if n <> 1 then raise exception 'group_stats leaked private group: %', n; end if;
  select members into n from group_stats(array[g]);
  if n <> 2 then raise exception 'group_stats members wrong: %', n; end if;
  select jsonb_array_length(preview) into n from group_stats(array[g]);
  if n <> 2 then raise exception 'group_stats preview wrong: %', n; end if;

  -- anon эрхгүй.
  perform pg_temp.as_admin();
  execute 'set role anon';
  perform pg_temp.expect_error('select profile_stats(''e5111111-1111-1111-1111-111111111111'')', 'permission denied');
  execute 'reset role';
end $$;

select 'social OK';
