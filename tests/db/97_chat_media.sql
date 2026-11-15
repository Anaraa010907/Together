-- Чатын зураг/видео/дуу: мессежийн шалгалт ба chat-media storage эрх.

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
  ('e7111111-1111-1111-1111-111111111111'),
  ('e7222222-2222-2222-2222-222222222222'),
  ('e7333333-3333-3333-3333-333333333333');
insert into profiles (id, username, display_name, is_minor, age_declared_at) values
  ('e7111111-1111-1111-1111-111111111111', 'media_a', 'MediaA', false, now()),
  ('e7222222-2222-2222-2222-222222222222', 'media_b', 'MediaB', false, now()),
  ('e7333333-3333-3333-3333-333333333333', 'media_c', 'MediaC', false, now());

do $$
declare
  ua uuid := 'e7111111-1111-1111-1111-111111111111';
  ub uuid := 'e7222222-2222-2222-2222-222222222222';
  uc uuid := 'e7333333-3333-3333-3333-333333333333';
  dm uuid; p text; n bigint; last text;
begin
  perform pg_temp.as_user(ua);
  dm := start_direct_chat(ub);
  p := dm::text || '/' || ua::text || '/photo.jpg';

  -- Зураг: файлын зам тухайн харилцаа + илгээгчийн хавтсанд.
  insert into messages (conversation_id, sender_id, body, kind, media_path, media_mime, media_width, media_height)
  values (dm, ua, '', 'image', p, 'image/jpeg', 1080, 1350);
  insert into messages (conversation_id, sender_id, body, kind, media_path, media_mime, media_duration_ms)
  values (dm, ua, '', 'audio', dm::text || '/' || ua::text || '/voice.m4a', 'audio/mp4', 4200);

  -- Буруу хавтас, файлгүй медиа, файлтай текст — бүгд хориотой.
  perform pg_temp.expect_error(format($q$insert into messages (conversation_id, sender_id, body, kind, media_path)
    values (%L, %L, '', 'image', 'other-conv/%s/x.jpg')$q$, dm, ua, ua), 'messages_media_folder_check');
  perform pg_temp.expect_error(format($q$insert into messages (conversation_id, sender_id, body, kind)
    values (%L, %L, '', 'video')$q$, dm, ua), 'messages_body_check');
  perform pg_temp.expect_error(format($q$insert into messages (conversation_id, sender_id, body, kind, media_path)
    values (%L, %L, 'hi', 'text', %L)$q$, dm, ua, p), 'messages_body_check');
  perform pg_temp.expect_error(format($q$insert into messages (conversation_id, sender_id, body, kind, media_path)
    values (%L, %L, '', 'sticker', %L)$q$, dm, ua, p), 'messages_kind_check');

  -- Чатын жагсаалтад медиа "[image]"/"[audio]" тэмдэгээр (нэг транзакцид цаг ижил).
  perform pg_temp.as_user(ub);
  select last_body into last from my_conversations() where id = dm;
  if last not in ('[audio]', '[image]') then raise exception 'last_body should be a media marker, got %', last; end if;

  -- Storage: оролцогч өөрийн хавтсанд оруулна, бусдын хавтсанд болохгүй.
  perform pg_temp.as_user(ua);
  insert into storage.objects (bucket_id, name) values ('chat-media', p);
  perform pg_temp.expect_error(format($q$insert into storage.objects (bucket_id, name) values ('chat-media', %L)$q$,
    dm::text || '/' || ub::text || '/fake.jpg'), 'row-level security');

  -- B (оролцогч) харна, C (гадны) харахгүй, бичихгүй.
  perform pg_temp.as_user(ub);
  select count(*) into n from storage.objects where bucket_id = 'chat-media' and name = p;
  if n <> 1 then raise exception 'participant cannot see chat media'; end if;
  perform pg_temp.as_user(uc);
  select count(*) into n from storage.objects where bucket_id = 'chat-media' and name = p;
  if n <> 0 then raise exception 'outsider sees chat media'; end if;
  perform pg_temp.expect_error(format($q$insert into storage.objects (bucket_id, name) values ('chat-media', %L)$q$,
    dm::text || '/' || uc::text || '/x.jpg'), 'row-level security');

  -- Блоклосны дараа файл оруулахгүй.
  perform pg_temp.as_user(ub);
  insert into user_blocks (blocker_id, blocked_id) values (ub, ua);
  perform pg_temp.as_user(ua);
  perform pg_temp.expect_error(format($q$insert into storage.objects (bucket_id, name) values ('chat-media', %L)$q$,
    dm::text || '/' || ua::text || '/after-block.jpg'), 'row-level security');
  execute 'reset role';
end $$;

select 'chat media OK';
