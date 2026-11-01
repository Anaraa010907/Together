-- 0005: Group-ийн урилгын код, бүртгэл устгах.

-- ---------- Урилгын код ----------
create table group_invites (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references groups (id) on delete cascade,
  code       text unique not null,
  created_by uuid not null references profiles (id) on delete cascade,
  expires_at timestamptz not null default now() + interval '7 days',
  max_uses   int not null default 50 check (max_uses > 0),
  uses       int not null default 0 check (uses >= 0),
  created_at timestamptz not null default now()
);

alter table group_invites enable row level security;
revoke all on group_invites from authenticated, anon;
grant select on group_invites to authenticated;

create policy invites_select_owner on group_invites for select to authenticated
  using (public.is_group_owner(group_id));

-- Эзэн 8 тэмдэгттэй код үүсгэнэ (7 хоног, 50 удаа).
create or replace function public.create_group_invite(p_group_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_code text;
  i      int;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not public.is_group_owner(p_group_id) then raise exception 'not_owner'; end if;

  for i in 1..5 loop
    v_code := upper(substr(md5(gen_random_uuid()::text), 1, 8));
    begin
      insert into group_invites (group_id, code, created_by)
      values (p_group_id, v_code, v_uid);
      return v_code;
    exception when unique_violation then
      -- давхардвал дахин оролдоно
    end;
  end loop;
  raise exception 'code_generation_failed';
end;
$$;

-- Код ашиглаж нэгдэх: invite_only / private group-д шууд active гишүүн болно.
create or replace function public.redeem_group_invite(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_invite   group_invites%rowtype;
  v_existing group_members%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select * into v_invite from group_invites
  where code = upper(trim(p_code))
  for update;

  if not found then raise exception 'invalid_code'; end if;
  if v_invite.expires_at < now() then raise exception 'invite_expired'; end if;
  if v_invite.uses >= v_invite.max_uses then raise exception 'invite_exhausted'; end if;

  select * into v_existing from group_members
  where group_id = v_invite.group_id and user_id = v_uid;

  if found then
    if v_existing.status = 'banned' then raise exception 'banned'; end if;
    if v_existing.status = 'active' then return v_invite.group_id; end if;
    update group_members set status = 'active'
    where group_id = v_invite.group_id and user_id = v_uid;
  else
    insert into group_members (group_id, user_id, role, status)
    values (v_invite.group_id, v_uid, 'member', 'active');
  end if;

  update group_invites set uses = uses + 1 where id = v_invite.id;
  return v_invite.group_id;
end;
$$;

-- ---------- Бүртгэл устгах (App Store / Google Play шаардлага) ----------
-- Эзэмшдэг group-ууд устна; бусад өгөгдөл profiles-ийн cascade-аар устна.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  delete from groups where owner_id = v_uid;
  delete from auth.users where id = v_uid;
end;
$$;

revoke execute on function public.create_group_invite(uuid) from public, anon;
revoke execute on function public.redeem_group_invite(text) from public, anon;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.create_group_invite(uuid) to authenticated;
grant execute on function public.redeem_group_invite(text) to authenticated;
grant execute on function public.delete_my_account() to authenticated;
