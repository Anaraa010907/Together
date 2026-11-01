-- Feed тестүүд: пост, хавсралт, storage, сэтгэгдэл, "Тустай" XP, санал, эрх, устгал.

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
  ('77777777-7777-7777-7777-777777777777'),
  ('88888888-8888-8888-8888-888888888888'),
  ('99999999-9999-9999-9999-999999999999'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
insert into profiles (id, username, display_name) values
  ('77777777-7777-7777-7777-777777777777', 'owner7', 'Owner'),
  ('88888888-8888-8888-8888-888888888888', 'author8', 'Author'),
  ('99999999-9999-9999-9999-999999999999', 'member9', 'Member'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'outsider', 'Outsider');

do $$
declare
  u7 uuid := '77777777-7777-7777-7777-777777777777';  -- group эзэн
  u8 uuid := '88888888-8888-8888-8888-888888888888';  -- зохиогч
  u9 uuid := '99999999-9999-9999-9999-999999999999';  -- гишүүн
  ua uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';  -- гадны хүн (дараа нэгдэнэ)
  g uuid; p uuid; prop uuid; c uuid; res jsonb; n int; v int; path text;
begin
  perform pg_temp.as_user(u7);
  g := create_group('English A2', 'english-a2', null, 'public', 'open');
  perform pg_temp.as_user(u8); perform join_group(g);
  perform pg_temp.as_user(u9); perform join_group(g);

  -- ===== Пост үүсгэх =====
  perform pg_temp.as_user(u8);
  insert into posts (group_id, author_id, kind, body, link_url)
  values (g, u8, 'share', 'Unit 5 notes', 'https://youtube.com/watch?v=abc') returning id into p;

  perform pg_temp.expect_error(
    format('insert into posts (group_id, author_id, body) values (%L, %L, ''x'')', g, u7), 'row-level security');
  perform pg_temp.expect_error(
    format('insert into posts (group_id, author_id, kind, body, vote_deadline) values (%L, %L, ''share'', ''x'', now())', g, u8),
    'check constraint');
  perform pg_temp.expect_error(
    format('insert into posts (group_id, author_id, body, link_url) values (%L, %L, ''x'', ''javascript:alert(1)'')', g, u8),
    'check constraint');
  perform pg_temp.expect_error(format('update posts set kind = ''question'' where id = %L', p), 'permission denied');
  update posts set body = 'Unit 5 notes (edited)' where id = p;

  -- ===== Гадны хүн харахгүй, бичихгүй =====
  perform pg_temp.as_user(ua);
  select count(*) into n from posts where group_id = g;
  assert n = 0, 'non-member sees no posts even in public group';
  perform pg_temp.expect_error(
    format('insert into posts (group_id, author_id, body) values (%L, %L, ''spam'')', g, ua), 'row-level security');
  perform pg_temp.expect_error(
    format('insert into comments (post_id, author_id, body) values (%L, %L, ''hi'')', p, ua), 'row-level security');
  perform pg_temp.expect_error(format('select mark_helpful(%L)', p), 'post_not_found');

  -- ===== Хавсралт + storage =====
  path := g::text || '/' || p::text || '/0-slide.jpg';
  perform pg_temp.as_user(u8);
  insert into post_attachments (post_id, storage_path, mime_type, file_name, size_bytes)
  values (p, path, 'image/jpeg', 'slide.jpg', 1000);
  insert into storage.objects (bucket_id, name) values ('post-media', path);
  perform pg_temp.expect_error(
    format('insert into post_attachments (post_id, storage_path, mime_type, file_name, size_bytes) values (%L, ''other/x.jpg'', ''image/jpeg'', ''x.jpg'', 10)', p),
    'row-level security');
  perform pg_temp.expect_error(
    format('insert into post_attachments (post_id, storage_path, mime_type, file_name, size_bytes) values (%L, %L, ''application/zip'', ''x.zip'', 10)', p, g::text || '/' || p::text || '/x.zip'),
    'check constraint');

  perform pg_temp.as_user(u9);
  perform pg_temp.expect_error(
    format('insert into storage.objects (bucket_id, name) values (''post-media'', %L)', g::text || '/' || p::text || '/1-hack.jpg'),
    'row-level security');
  select count(*) into n from storage.objects where name = path;
  assert n = 1, 'member can read group media';

  perform pg_temp.as_user(ua);
  select count(*) into n from storage.objects where name = path;
  assert n = 0, 'non-member cannot read group media';
  select count(*) into n from post_attachments where post_id = p;
  assert n = 0, 'non-member cannot see attachments';

  -- ===== "Тустай" + XP =====
  perform pg_temp.as_user(u8);
  perform pg_temp.expect_error(format('select mark_helpful(%L)', p), 'own_post');
  perform pg_temp.expect_error(format('insert into post_helpful (post_id, user_id) values (%L, %L)', p, u8), 'permission denied');

  perform pg_temp.as_user(u7);
  res := mark_helpful(p);
  assert (res->>'count')::int = 1 and not (res->>'awarded')::boolean, 'first helpful';
  perform pg_temp.as_user(u9);
  res := mark_helpful(p);
  res := mark_helpful(p);  -- давтахад тоо өсөхгүй
  assert (res->>'count')::int = 2, 'repeat mark does not count twice';

  perform pg_temp.as_user(ua);
  perform join_group(g);
  res := mark_helpful(p);
  assert (res->>'count')::int = 3 and (res->>'awarded')::boolean, 'third helpful awards xp';

  perform pg_temp.as_admin();
  select total_xp into v from user_progress where user_id = u8;
  assert v = 15, 'author got 15 xp, got ' || coalesce(v::text, 'null');

  perform pg_temp.as_user(u7);
  delete from post_helpful where post_id = p and user_id = u7;
  res := mark_helpful(p);
  assert not (res->>'awarded')::boolean, 'no second award after unmark/remark';
  perform pg_temp.as_admin();
  select total_xp into v from user_progress where user_id = u8;
  assert v = 15, 'xp unchanged after remark';

  -- ===== Санал =====
  perform pg_temp.as_user(u7);
  insert into posts (group_id, author_id, kind, body, vote_deadline)
  values (g, u7, 'proposal', 'Meet on Thursday?', now() + interval '1 day') returning id into prop;

  perform pg_temp.as_user(u8);
  perform vote_proposal(prop, 'support');
  perform vote_proposal(prop, 'against');
  select count(*) into n from proposal_votes where post_id = prop and user_id = u8 and vote = 'against';
  assert n = 1, 'vote changed, one row';
  perform pg_temp.expect_error(format('select vote_proposal(%L, ''support'')', p), 'not_proposal');
  perform pg_temp.expect_error(
    format('insert into proposal_votes (post_id, user_id, vote) values (%L, %L, ''support'')', prop, u8), 'permission denied');

  perform pg_temp.as_admin();
  update posts set vote_deadline = now() - interval '1 minute' where id = prop;
  perform pg_temp.as_user(u9);
  perform pg_temp.expect_error(format('select vote_proposal(%L, ''support'')', prop), 'voting_closed');

  -- ===== Сэтгэгдэл =====
  perform pg_temp.as_user(u9);
  insert into comments (post_id, author_id, body) values (p, u9, 'Thanks!') returning id into c;
  perform pg_temp.as_user(u8);
  delete from comments where id = c;  -- зохиогч бусдын сэтгэгдлийг устгахгүй (0 мөр)
  perform pg_temp.as_admin();
  select count(*) into n from comments where id = c;
  assert n = 1, 'post author cannot delete others comment';
  perform pg_temp.as_user(u7);
  delete from comments where id = c;  -- group эзэн устгана
  perform pg_temp.as_admin();
  select count(*) into n from comments where id = c;
  assert n = 0, 'group owner can delete comment';

  -- ===== Report =====
  perform pg_temp.as_user(u9);
  insert into user_reports (reporter_id, target_type, target_id, reason) values (u9, 'post', p, 'spam');

  -- ===== Постыг устгах =====
  delete from posts where id = p;  -- гишүүн бусдын постыг устгахгүй
  perform pg_temp.as_admin();
  select count(*) into n from posts where id = p;
  assert n = 1, 'member cannot delete others post';

  perform pg_temp.as_user(u7);
  delete from storage.objects where name = path;  -- эзэн файлыг устгаж чадна
  delete from posts where id = p;
  perform pg_temp.as_admin();
  select count(*) into n from posts where id = p;               assert n = 0, 'owner deletes post';
  select count(*) into n from post_attachments where post_id = p; assert n = 0, 'attachments cascade';
  select count(*) into n from storage.objects where name = path;  assert n = 0, 'owner deleted media';

  -- ===== Бүртгэл устгах =====
  perform pg_temp.as_user(u8);
  insert into posts (group_id, author_id, body) values (g, u8, 'bye') returning id into p;
  perform delete_my_account();
  perform pg_temp.as_admin();
  select count(*) into n from posts where author_id = u8;  assert n = 0, 'deleted user posts removed';
  select count(*) into n from proposal_votes where user_id = u8; assert n = 0, 'deleted user votes removed';

  raise notice 'ALL FEED TESTS PASSED';
end $$;
