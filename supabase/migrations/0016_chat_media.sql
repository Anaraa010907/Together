-- 0016: Чатад зураг, видео, дуут мессеж.
-- Файл: chat-media (private) bucket, зам: {conversation_id}/{sender_id}/{файл}.
-- Харах: тухайн харилцааны оролцогч/гишүүн; оруулах: бичих эрхтэй өөрийн хавтсанд.

alter table messages add column kind text not null default 'text'
  check (kind in ('text', 'image', 'video', 'audio'));
alter table messages add column media_path text check (media_path is null or char_length(media_path) <= 300);
alter table messages add column media_mime text check (media_mime is null or char_length(media_mime) <= 100);
alter table messages add column media_duration_ms int check (media_duration_ms is null or media_duration_ms between 0 and 600000);
alter table messages add column media_width int check (media_width is null or media_width between 1 and 20000);
alter table messages add column media_height int check (media_height is null or media_height between 1 and 20000);

-- Текст: 1–2000 тэмдэгт, файлгүй. Медиа: файл заавал, тайлбар 0–2000.
alter table messages drop constraint messages_body_check;
alter table messages add constraint messages_body_check check (
  (kind = 'text' and char_length(btrim(body)) between 1 and 2000 and media_path is null)
  or (kind <> 'text' and media_path is not null and char_length(body) <= 2000)
);
-- Файл заавал тухайн харилцааны хавтсанд, илгээгчийн дэд хавтсанд байна.
alter table messages add constraint messages_media_folder_check check (
  media_path is null
  or (split_part(media_path, '/', 1) = conversation_id::text and split_part(media_path, '/', 2) = sender_id::text)
);

grant insert (kind, media_path, media_mime, media_duration_ms, media_width, media_height) on messages to authenticated;

-- ---------- storage: chat-media (private, 25MB) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-media', 'chat-media', false, 26214400,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
              'video/mp4', 'video/quicktime', 'video/3gpp',
              'audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/aac', 'audio/mpeg', 'audio/3gpp', 'audio/webm'])
on conflict (id) do nothing;

create policy chat_media_select on storage.objects for select to authenticated
  using (
    bucket_id = 'chat-media'
    and public.can_access_conversation(public.safe_uuid((storage.foldername(name))[1]))
  );

create policy chat_media_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'chat-media'
    and (storage.foldername(name))[2] = auth.uid()::text
    and public.can_send_message(public.safe_uuid((storage.foldername(name))[1]))
  );

create policy chat_media_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'chat-media'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

-- Чатуудын жагсаалтад медиа мессежийг "[image]" гэх мэт тэмдэгээр (апп орчуулна).
create or replace function public.my_conversations()
returns table (
  id uuid, kind text, group_id uuid, title text, avatar_url text, other_id uuid,
  last_body text, last_sender_id uuid, last_at timestamptz, unread bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with mine as (
    select c.*,
           case when c.kind = 'direct' then (case when c.user_a = auth.uid() then c.user_b else c.user_a end) end as other
    from conversations c
    where public.can_access_conversation(c.id)
  )
  select c.id, c.kind, c.group_id,
         coalesce(g.name, op.display_name) as title,
         case when c.kind = 'group' then g.cover_url else op.avatar_url end as avatar_url,
         c.other as other_id,
         case when lm.kind = 'text' then lm.body else '[' || lm.kind || ']' end,
         lm.sender_id, lm.created_at,
         (select count(*) from messages m
          where m.conversation_id = c.id and m.hidden_at is null and m.sender_id <> auth.uid()
            and m.created_at > coalesce(r.last_read_at, '-infinity'::timestamptz)
            and not exists (select 1 from user_blocks b where b.blocker_id = auth.uid() and b.blocked_id = m.sender_id)
         ) as unread
  from mine c
  left join groups g on g.id = c.group_id
  left join profiles op on op.id = c.other
  left join conversation_reads r on r.conversation_id = c.id and r.user_id = auth.uid()
  join lateral (
    select m.body, m.kind, m.sender_id, m.created_at from messages m
    where m.conversation_id = c.id and m.hidden_at is null
      and not exists (select 1 from user_blocks b where b.blocker_id = auth.uid() and b.blocked_id = m.sender_id)
    order by m.created_at desc
    limit 1
  ) lm on true
  where (c.kind = 'group' and g.deleted_at is null)
     or (c.kind = 'direct' and op.deleted_at is null
         and not exists (select 1 from user_blocks b where b.blocker_id = auth.uid() and b.blocked_id = c.other))
  order by lm.created_at desc
  limit 200;
$$;
