-- 0007: Group feed — хуваалцах / санал / асуулт пост, файл (зураг, PDF), сэтгэгдэл,
-- "Тустай" тэмдэг (3 хүн дарвал зохиогч +15 XP), саналын хариулт.
-- Зөвхөн group-ийн идэвхтэй гишүүд харна (бүх насны платформ тул гаднаас нээлттэй биш).

create type post_kind as enum ('share', 'proposal', 'question');
create type proposal_vote as enum ('support', 'against', 'question');

-- Буруу текстийг uuid болгох гэж алдаа шидэхгүй (storage path шалгахад).
create or replace function public.safe_uuid(t text)
returns uuid language sql immutable as $$
  select case
    when t ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then t::uuid
  end
$$;

-- ---------- tables ----------
create table posts (
  id            uuid primary key default gen_random_uuid(),
  group_id      uuid not null references groups (id) on delete cascade,
  author_id     uuid not null references profiles (id) on delete cascade,
  kind          post_kind not null default 'share',
  body          text not null check (char_length(body) between 1 and 4000),
  link_url      text check (link_url ~* '^https?://' and char_length(link_url) <= 500),
  vote_deadline timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (kind = 'proposal' or vote_deadline is null)
);
create index posts_group_idx on posts (group_id, created_at desc);

-- Файлын зам: {group_id}/{post_id}/{нэр}
create table post_attachments (
  id           uuid primary key default gen_random_uuid(),
  post_id      uuid not null references posts (id) on delete cascade,
  storage_path text not null unique check (char_length(storage_path) <= 300),
  mime_type    text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  file_name    text not null check (char_length(file_name) between 1 and 200),
  size_bytes   int not null check (size_bytes between 1 and 20971520),
  position     int not null default 0,
  created_at   timestamptz not null default now()
);

create table comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references posts (id) on delete cascade,
  author_id  uuid not null references profiles (id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index comments_post_idx on comments (post_id, created_at);

create table post_helpful (
  post_id    uuid not null references posts (id) on delete cascade,
  user_id    uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table proposal_votes (
  post_id    uuid not null references posts (id) on delete cascade,
  user_id    uuid not null references profiles (id) on delete cascade,
  vote       proposal_vote not null,
  updated_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create trigger posts_touch before update on posts
  for each row execute function public.touch_updated_at();

-- Report: пост, сэтгэгдэл мэдээлэх
alter table user_reports drop constraint user_reports_target_type_check;
alter table user_reports add constraint user_reports_target_type_check
  check (target_type in ('profile', 'group', 'goal', 'post', 'comment'));

-- ---------- privileges ----------
alter table posts            enable row level security;
alter table post_attachments enable row level security;
alter table comments         enable row level security;
alter table post_helpful     enable row level security;
alter table proposal_votes   enable row level security;

revoke all on posts, post_attachments, comments, post_helpful, proposal_votes from anon, authenticated;

grant select, delete on posts to authenticated;
grant insert (group_id, author_id, kind, body, link_url, vote_deadline) on posts to authenticated;
grant update (body, link_url) on posts to authenticated;
grant select, insert on post_attachments to authenticated;
grant select, delete on comments to authenticated;
grant insert (post_id, author_id, body) on comments to authenticated;
grant select, delete on post_helpful to authenticated;   -- нэмэх нь mark_helpful()-ээр
grant select on proposal_votes to authenticated;         -- санал өгөх нь vote_proposal()-оор

-- ---------- policies ----------
create policy posts_select on posts for select to authenticated
  using (public.is_group_member(group_id));
create policy posts_insert on posts for insert to authenticated
  with check (author_id = auth.uid() and public.is_group_member(group_id));
create policy posts_update on posts for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy posts_delete on posts for delete to authenticated
  using (author_id = auth.uid() or public.is_group_owner(group_id));

-- posts-ийн RLS дэд асуулгад үйлчилнэ: харж чадах пост л тооцогдоно.
create policy attachments_select on post_attachments for select to authenticated
  using (exists (select 1 from posts p where p.id = post_id));
create policy attachments_insert on post_attachments for insert to authenticated
  with check (exists (
    select 1 from posts p
    where p.id = post_id and p.author_id = auth.uid()
      and storage_path like p.group_id::text || '/' || p.id::text || '/%'
  ));

create policy comments_select on comments for select to authenticated
  using (exists (select 1 from posts p where p.id = post_id));
create policy comments_insert on comments for insert to authenticated
  with check (author_id = auth.uid() and exists (select 1 from posts p where p.id = post_id));
create policy comments_delete on comments for delete to authenticated
  using (
    author_id = auth.uid()
    or exists (select 1 from posts p where p.id = post_id and public.is_group_owner(p.group_id))
  );

create policy helpful_select on post_helpful for select to authenticated
  using (exists (select 1 from posts p where p.id = post_id));
create policy helpful_delete_own on post_helpful for delete to authenticated
  using (user_id = auth.uid());

create policy votes_select on proposal_votes for select to authenticated
  using (exists (select 1 from posts p where p.id = post_id));

-- ---------- functions ----------
-- "Тустай": өөрийн постонд дарах боломжгүй. Бусад 3 хүн дарвал зохиогч нэг удаа +15 XP.
-- Буцааж аваад дахин дарсан ч XP давхардахгүй (xp_transactions-ийн unique key).
create or replace function public.mark_helpful(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_post    posts%rowtype;
  v_count   int;
  v_awarded boolean := false;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select * into v_post from posts where id = p_post_id;
  if not found or not public.is_group_member(v_post.group_id) then raise exception 'post_not_found'; end if;
  if v_post.author_id = v_uid then raise exception 'own_post'; end if;

  insert into post_helpful (post_id, user_id) values (p_post_id, v_uid) on conflict do nothing;
  select count(*) into v_count from post_helpful where post_id = p_post_id;

  if v_count >= 3 then
    insert into xp_transactions (user_id, source_type, source_id, amount)
    values (v_post.author_id, 'post_helpful', p_post_id, 15)
    on conflict (user_id, source_type, source_id) do nothing;
    if found then
      v_awarded := true;
      perform public._sync_xp(v_post.author_id);
    end if;
  end if;

  return jsonb_build_object('count', v_count, 'awarded', v_awarded);
end;
$$;

-- Санал: дэмжих / эсрэг / асуулттай. Хугацаа дуустал өөрчилж болно.
create or replace function public.vote_proposal(p_post_id uuid, p_vote proposal_vote)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_post posts%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select * into v_post from posts where id = p_post_id;
  if not found or not public.is_group_member(v_post.group_id) then raise exception 'post_not_found'; end if;
  if v_post.kind <> 'proposal' then raise exception 'not_proposal'; end if;
  if v_post.vote_deadline is not null and v_post.vote_deadline < now() then raise exception 'voting_closed'; end if;

  insert into proposal_votes (post_id, user_id, vote) values (p_post_id, v_uid, p_vote)
  on conflict (post_id, user_id) do update set vote = excluded.vote, updated_at = now();
end;
$$;

revoke execute on function public.mark_helpful(uuid) from public, anon;
revoke execute on function public.vote_proposal(uuid, proposal_vote) from public, anon;
grant execute on function public.mark_helpful(uuid) to authenticated;
grant execute on function public.vote_proposal(uuid, proposal_vote) to authenticated;

-- ---------- storage: post-media (private) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('post-media', 'post-media', false, 20971520,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

create policy post_media_select on storage.objects for select to authenticated
  using (
    bucket_id = 'post-media'
    and public.is_group_member(public.safe_uuid((storage.foldername(name))[1]))
  );

create policy post_media_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'post-media'
    and exists (
      select 1 from public.posts p
      where p.id = public.safe_uuid((storage.foldername(name))[2])
        and p.group_id = public.safe_uuid((storage.foldername(name))[1])
        and p.author_id = auth.uid()
    )
  );

-- Постыг устгахаас ӨМНӨ файлыг устгана (client дараалал).
create policy post_media_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'post-media'
    and exists (
      select 1 from public.posts p
      where p.id = public.safe_uuid((storage.foldername(name))[2])
        and (p.author_id = auth.uid() or public.is_group_owner(p.group_id))
    )
  );
