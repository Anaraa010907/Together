-- Чат, дагагчдын жагсаалт, админ самбар.

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
  ('e6111111-1111-1111-1111-111111111111'),
  ('e6222222-2222-2222-2222-222222222222'),
  ('e6333333-3333-3333-3333-333333333333'),
  ('e6444444-4444-4444-4444-444444444444');
insert into profiles (id, username, display_name, is_minor, age_declared_at) values
  ('e6111111-1111-1111-1111-111111111111', 'chat_a', 'ChatA', false, now()),
  ('e6222222-2222-2222-2222-222222222222', 'chat_b', 'ChatB', false, now()),
  ('e6333333-3333-3333-3333-333333333333', 'chat_c', 'ChatC', false, now()),
  ('e6444444-4444-4444-4444-444444444444', 'chat_admin', 'Admin', false, now());
insert into app_admins (user_id) values ('e6444444-4444-4444-4444-444444444444');

do $$
declare
  ua uuid := 'e6111111-1111-1111-1111-111111111111';
  ub uuid := 'e6222222-2222-2222-2222-222222222222';
  uc uuid := 'e6333333-3333-3333-3333-333333333333';
  ad uuid := 'e6444444-4444-4444-4444-444444444444';
  dm uuid; dm2 uuid; gc uuid; g uuid; m1 uuid; p uuid; rep uuid; n bigint; j jsonb;
begin
  -- ===== Шууд чат =====
  perform pg_temp.as_user(ua);
  dm := start_direct_chat(ub);
  dm2 := start_direct_chat(ub);
  if dm <> dm2 then raise exception 'direct chat not reused'; end if;
  perform pg_temp.expect_error(format('select start_direct_chat(%L)', ua), 'invalid_user');
  insert into messages (conversation_id, sender_id, body) values (dm, ua, 'сайн уу') returning id into m1;
  perform pg_temp.expect_error(format($q$insert into messages (conversation_id, sender_id, body) values (%L, %L, 'x')$q$, dm, ub),
    'row-level security');                                  -- бусдын нэрээр

  -- Гуравдагч хүн харж, бичиж чадахгүй.
  perform pg_temp.as_user(uc);
  select count(*) into n from messages where conversation_id = dm;
  if n <> 0 then raise exception 'outsider sees DM'; end if;
  select count(*) into n from conversations where id = dm;
  if n <> 0 then raise exception 'outsider sees conversation'; end if;
  perform pg_temp.expect_error(format($q$insert into messages (conversation_id, sender_id, body) values (%L, %L, 'x')$q$, dm, uc),
    'row-level security');

  -- B: уншаагүй 1, уншсаны дараа 0.
  perform pg_temp.as_user(ub);
  select unread into n from my_conversations() where id = dm;
  if n <> 1 then raise exception 'unread should be 1, got %', n; end if;
  if unread_chat_count() <> 1 then raise exception 'unread_chat_count wrong'; end if;
  perform mark_conversation_read(dm);
  select unread into n from my_conversations() where id = dm;
  if n <> 0 then raise exception 'unread should be 0 after read'; end if;
  insert into messages (conversation_id, sender_id, body) values (dm, ub, 'сайн');

  -- Блоклосны дараа бичих боломжгүй, шинэ чат эхлүүлэхгүй.
  insert into user_blocks (blocker_id, blocked_id) values (ub, ua);
  perform pg_temp.as_user(ua);
  perform pg_temp.expect_error(format($q$insert into messages (conversation_id, sender_id, body) values (%L, %L, 'x')$q$, dm, ua),
    'row-level security');
  perform pg_temp.expect_error(format('select start_direct_chat(%L)', ub), 'blocked');
  perform pg_temp.as_user(ub);
  select count(*) into n from my_conversations() where id = dm;    -- блоклосон хүнтэй чат жагсаалтад гарахгүй
  if n <> 0 then raise exception 'blocked chat still listed'; end if;
  delete from user_blocks where blocker_id = ub and blocked_id = ua;

  -- Хоосон мессеж болохгүй.
  perform pg_temp.as_user(ua);
  perform pg_temp.expect_error(format($q$insert into messages (conversation_id, sender_id, body) values (%L, %L, '   ')$q$, dm, ua),
    'messages_body_check');

  -- ===== Группын чат =====
  perform pg_temp.as_user(ua);
  g := create_group('Chat Club', 'chat-club', null, 'public', 'open');
  gc := group_chat(g);
  if group_chat(g) <> gc then raise exception 'group chat not reused'; end if;
  insert into messages (conversation_id, sender_id, body) values (gc, ua, 'бүгдэд нь сайн уу');
  perform pg_temp.as_user(uc);
  perform pg_temp.expect_error(format('select group_chat(%L)', g), 'not_member');
  select count(*) into n from messages where conversation_id = gc;
  if n <> 0 then raise exception 'non-member sees group chat'; end if;
  perform join_group(g);
  select count(*) into n from messages where conversation_id = gc;
  if n <> 1 then raise exception 'member cannot see group chat'; end if;
  insert into messages (conversation_id, sender_id, body) values (gc, uc, 'сайн');

  -- ===== Дагагч / дагаж буй =====
  perform pg_temp.as_user(ub);
  insert into follows (follower_id, followee_id) values (ub, ua);
  perform pg_temp.as_user(uc);
  insert into follows (follower_id, followee_id) values (uc, ua);
  select count(*) into n from follow_list(ua, 'followers');
  if n <> 2 then raise exception 'followers list wrong: %', n; end if;
  select count(*) into n from follow_list(uc, 'following') where id = ua;
  if n <> 1 then raise exception 'following list wrong'; end if;
  select count(*) into n from follow_list(ua, 'bogus');
  if n <> 0 then raise exception 'invalid kind should return nothing'; end if;

  -- ===== Админ =====
  -- Энгийн хэрэглэгч админ RPC дуудаж чадахгүй.
  perform pg_temp.as_user(ua);
  perform pg_temp.expect_error('select admin_overview()', 'forbidden');
  perform pg_temp.expect_error(format('select admin_set_ban(%L, true)', ub), 'forbidden');
  j := profile_stats(ua);
  if (j->>'is_admin')::boolean or (j->>'viewer_admin')::boolean then raise exception 'non-admin flagged admin'; end if;

  -- Гомдол → админ харна → нуух → гишүүдэд харагдахгүй.
  insert into posts (group_id, author_id, body) values (g, ua, 'муу пост') returning id into p;
  perform pg_temp.as_user(uc);
  insert into user_reports (reporter_id, target_type, target_id, reason) values (uc, 'post', p, 'spam') returning id into rep;
  insert into user_reports (reporter_id, target_type, target_id, reason) values (uc, 'message', m1, 'spam');

  perform pg_temp.as_user(ad);
  j := profile_stats(ad);
  if not (j->>'is_admin')::boolean then raise exception 'admin flag missing'; end if;
  j := admin_overview();
  if (j->>'open_reports')::int < 2 then raise exception 'overview open_reports wrong: %', j; end if;
  select count(*) into n from admin_reports('open', 100) r where r.id = rep and r.target_body = 'муу пост' and r.target_owner = ua;
  if n <> 1 then raise exception 'admin_reports target preview wrong'; end if;
  perform admin_hide_content('post', p, true);
  select count(*) into n from admin_reports('resolved', 100) r where r.id = rep and r.target_hidden;
  if n <> 1 then raise exception 'hiding should resolve report'; end if;

  perform pg_temp.as_user(uc);
  select count(*) into n from posts where id = p;
  if n <> 0 then raise exception 'hidden post still visible'; end if;
  perform pg_temp.as_user(ad);
  perform admin_hide_content('post', p, false);
  perform pg_temp.as_user(uc);
  select count(*) into n from posts where id = p;
  if n <> 1 then raise exception 'unhide failed'; end if;

  -- Хориглох: мессеж бичих, чат эхлүүлэх, хайлтад гарах боломжгүй.
  perform pg_temp.as_user(ad);
  perform admin_set_ban(ub, true);
  perform pg_temp.expect_error(format('select admin_set_ban(%L, true)', ad), 'cannot_ban_self');
  perform pg_temp.as_admin();
  select count(*) into n from auth.users where id = ub and banned_until = 'infinity';
  if n <> 1 then raise exception 'auth ban not set'; end if;
  perform pg_temp.as_user(ub);
  perform pg_temp.expect_error(format($q$insert into messages (conversation_id, sender_id, body) values (%L, %L, 'x')$q$, dm, ub),
    'row-level security');
  perform pg_temp.as_user(uc);
  select count(*) into n from search_people('chat_b', 10);
  if n <> 0 then raise exception 'banned user in search'; end if;
  perform pg_temp.expect_error(format('select start_direct_chat(%L)', ub), 'user_not_found');
  perform pg_temp.as_user(ad);
  perform admin_set_ban(ub, false);
  perform pg_temp.as_admin();
  select count(*) into n from auth.users where id = ub and banned_until is null;
  if n <> 1 then raise exception 'auth unban failed'; end if;

  -- Багш баталгаажуулах.
  perform pg_temp.as_user(uc);
  insert into teacher_profiles (user_id, headline) values (uc, 'English teacher');
  perform pg_temp.as_user(ad);
  select count(*) into n from admin_teachers(true) where user_id = uc;
  if n <> 1 then raise exception 'pending teacher missing'; end if;
  perform admin_verify_teacher(uc, true);
  select count(*) into n from admin_teachers(true) where user_id = uc;
  if n <> 0 then raise exception 'verified teacher still pending'; end if;
  perform pg_temp.as_user(ua);
  if not is_verified_teacher(uc) then raise exception 'teacher not verified'; end if;

  -- Клиент banned_at, hidden_at-ийг өөрөө өөрчилж чадахгүй.
  perform pg_temp.expect_error(format('update profiles set banned_at = null where id = %L', ua), 'permission denied');
  perform pg_temp.expect_error(format('update posts set hidden_at = null where id = %L', p), 'permission denied');
  execute 'reset role';
end $$;

select 'chat/admin OK';
