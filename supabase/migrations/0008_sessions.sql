-- 0008: Товлосон хамтын сешн — "Пүрэв 20:00, Unit 5-ыг хамтдаа үзнэ".
-- Видео нь гадны (Meet, Zoom, YouTube) линк. "Очно" бүртгэл, дараа нь тэмдэглэл.
-- Оролцоог баталгаажуулах боломжгүй тул XP өгөхгүй.

create table group_sessions (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references groups (id) on delete cascade,
  host_id      uuid references profiles (id) on delete set null,
  title        text not null check (char_length(title) between 2 and 100),
  description  text check (char_length(description) <= 1000),
  starts_at    timestamptz not null,
  duration_min int not null default 60 check (duration_min between 15 and 480),
  meeting_url  text check (meeting_url ~* '^https://' and char_length(meeting_url) <= 500),
  notes        text check (char_length(notes) <= 4000),
  cancelled_at timestamptz,
  created_at   timestamptz not null default now()
);
create index group_sessions_group_idx on group_sessions (group_id, starts_at);

create table session_rsvps (
  session_id uuid not null references group_sessions (id) on delete cascade,
  user_id    uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (session_id, user_id)
);
create index session_rsvps_user_idx on session_rsvps (user_id);

alter table group_sessions enable row level security;
alter table session_rsvps enable row level security;
revoke all on group_sessions, session_rsvps from anon, authenticated;
grant select on group_sessions, session_rsvps to authenticated;

create policy sessions_select on group_sessions for select to authenticated
  using (public.is_group_member(group_id));
create policy rsvps_select on session_rsvps for select to authenticated
  using (exists (select 1 from group_sessions s where s.id = session_id));

-- ---------- functions ----------
create or replace function public.create_session(
  p_group_id uuid,
  p_title text,
  p_description text,
  p_starts_at timestamptz,
  p_duration_min int,
  p_meeting_url text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not public.is_group_member(p_group_id) then raise exception 'not_member'; end if;
  if char_length(trim(coalesce(p_title, ''))) not between 2 and 100 then raise exception 'invalid_title'; end if;
  if p_duration_min is null or p_duration_min not between 15 and 480 then raise exception 'invalid_duration'; end if;
  if p_starts_at is null or p_starts_at < now() - interval '5 minutes' or p_starts_at > now() + interval '90 days' then
    raise exception 'invalid_start';
  end if;
  if nullif(trim(p_meeting_url), '') is not null
     and (p_meeting_url !~* '^https://\S+$' or char_length(p_meeting_url) > 500) then
    raise exception 'invalid_url';
  end if;

  insert into group_sessions (group_id, host_id, title, description, starts_at, duration_min, meeting_url)
  values (p_group_id, v_uid, trim(p_title), nullif(trim(p_description), ''), p_starts_at, p_duration_min,
          nullif(trim(p_meeting_url), ''))
  returning id into v_id;

  insert into session_rsvps (session_id, user_id) values (v_id, v_uid);
  return v_id;
end;
$$;

-- Хөтлөгч эсвэл group эзэн: тэмдэглэл, линк шинэчлэх.
create or replace function public.update_session(p_session_id uuid, p_notes text, p_meeting_url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_s   group_sessions%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_s from group_sessions where id = p_session_id;
  if not found or not public.is_group_member(v_s.group_id) then raise exception 'session_not_found'; end if;
  if v_s.host_id is distinct from v_uid and not public.is_group_owner(v_s.group_id) then raise exception 'not_host'; end if;
  if nullif(trim(p_meeting_url), '') is not null
     and (p_meeting_url !~* '^https://\S+$' or char_length(p_meeting_url) > 500) then
    raise exception 'invalid_url';
  end if;
  if char_length(coalesce(p_notes, '')) > 4000 then raise exception 'notes_too_long'; end if;

  update group_sessions
  set notes = nullif(trim(p_notes), ''), meeting_url = nullif(trim(p_meeting_url), '')
  where id = p_session_id;
end;
$$;

create or replace function public.cancel_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_s   group_sessions%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_s from group_sessions where id = p_session_id;
  if not found or not public.is_group_member(v_s.group_id) then raise exception 'session_not_found'; end if;
  if v_s.host_id is distinct from v_uid and not public.is_group_owner(v_s.group_id) then raise exception 'not_host'; end if;
  update group_sessions set cancelled_at = coalesce(cancelled_at, now()) where id = p_session_id;
end;
$$;

-- "Очно" / болих. Цуцлагдсан эсвэл дууссан сешнд бүртгэхгүй.
create or replace function public.rsvp_session(p_session_id uuid, p_going boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_s   group_sessions%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_s from group_sessions where id = p_session_id;
  if not found or not public.is_group_member(v_s.group_id) then raise exception 'session_not_found'; end if;

  if not p_going then
    delete from session_rsvps where session_id = p_session_id and user_id = v_uid;
    return;
  end if;

  if v_s.cancelled_at is not null then raise exception 'session_cancelled'; end if;
  if v_s.starts_at + make_interval(mins => v_s.duration_min) < now() then raise exception 'session_ended'; end if;

  insert into session_rsvps (session_id, user_id) values (p_session_id, v_uid) on conflict do nothing;
end;
$$;

revoke execute on function public.create_session(uuid, text, text, timestamptz, int, text) from public, anon;
revoke execute on function public.update_session(uuid, text, text) from public, anon;
revoke execute on function public.cancel_session(uuid) from public, anon;
revoke execute on function public.rsvp_session(uuid, boolean) from public, anon;
grant execute on function public.create_session(uuid, text, text, timestamptz, int, text) to authenticated;
grant execute on function public.update_session(uuid, text, text) to authenticated;
grant execute on function public.cancel_session(uuid) to authenticated;
grant execute on function public.rsvp_session(uuid, boolean) to authenticated;
