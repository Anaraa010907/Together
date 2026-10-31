-- 0004: Group үүсгэх, нэгдэх, зөвшөөрөх. Гишүүнчлэлийг сервер талд (security definer) бичнэ.

-- Client шууд group_members-д insert хийхгүй. Бүх урсгал функцээр.
-- groups-д client insert эрх өгөхгүй: эзэн гишүүнчлэлгүй group үүсэхээс сэргийлнэ.
revoke insert on group_members from authenticated, anon;
revoke insert on groups from authenticated, anon;

-- Group үүсгэх: group + эзнийг owner гишүүнээр атомаар.
create or replace function public.create_group(
  p_name text,
  p_slug text,
  p_description text default null,
  p_visibility group_visibility default 'public',
  p_join_policy join_policy default 'open'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_group uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if char_length(trim(p_name)) not between 2 and 60 then raise exception 'invalid_name'; end if;
  if p_slug !~ '^[a-z0-9-]{3,40}$' then raise exception 'invalid_slug'; end if;

  insert into groups (owner_id, name, slug, description, visibility, join_policy)
  values (v_uid, trim(p_name), p_slug, p_description, p_visibility, p_join_policy)
  returning id into v_group;

  insert into group_members (group_id, user_id, role, status)
  values (v_group, v_uid, 'owner', 'active');

  return v_group;
exception
  when unique_violation then raise exception 'slug_taken';
end;
$$;

-- Нэгдэх. Үр дүн: 'active' (шууд орсон) эсвэл 'pending' (зөвшөөрөл хүлээж байна).
create or replace function public.join_group(p_group_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_group groups%rowtype;
  v_existing group_members%rowtype;
  v_status member_status;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select * into v_group from groups where id = p_group_id and deleted_at is null;
  if not found then raise exception 'group_not_found'; end if;

  select * into v_existing from group_members
  where group_id = p_group_id and user_id = v_uid;

  if found then
    if v_existing.status = 'banned' then raise exception 'banned'; end if;
    if v_existing.status = 'active' then raise exception 'already_member'; end if;
    return v_existing.status::text; -- pending хэвээр
  end if;

  if v_group.join_policy = 'invite_only' then raise exception 'invite_only'; end if;

  -- Private group нь open байсан ч зөвшөөрөл шаардана.
  if v_group.join_policy = 'open' and v_group.visibility = 'public' then
    v_status := 'active';
  else
    v_status := 'pending';
  end if;

  insert into group_members (group_id, user_id, role, status)
  values (p_group_id, v_uid, 'member', v_status);

  return v_status::text;
end;
$$;

-- Эзэн: хүсэлт зөвшөөрөх эсвэл татгалзах (татгалзахад мөр устгана).
create or replace function public.review_join_request(
  p_group_id uuid,
  p_user_id uuid,
  p_approve boolean
)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_group_owner(p_group_id) then raise exception 'not_owner'; end if;

  if p_approve then
    update group_members set status = 'active'
    where group_id = p_group_id and user_id = p_user_id and status = 'pending';
    if not found then raise exception 'request_not_found'; end if;
    return 'active';
  else
    delete from group_members
    where group_id = p_group_id and user_id = p_user_id and status = 'pending';
    if not found then raise exception 'request_not_found'; end if;
    return 'rejected';
  end if;
end;
$$;

-- Гарах: эзэн гарч чадахгүй (group-ийг эхлээд шилжүүлэх ёстой).
create or replace function public.leave_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if public.is_group_owner(p_group_id) then raise exception 'owner_cannot_leave'; end if;

  delete from group_members where group_id = p_group_id and user_id = v_uid;
end;
$$;

-- Функцүүдийг зөвхөн нэвтэрсэн хэрэглэгч ажиллуулна.
revoke execute on function public.create_group(text, text, text, group_visibility, join_policy) from public, anon;
revoke execute on function public.join_group(uuid) from public, anon;
revoke execute on function public.review_join_request(uuid, uuid, boolean) from public, anon;
revoke execute on function public.leave_group(uuid) from public, anon;
grant execute on function public.create_group(text, text, text, group_visibility, join_policy) to authenticated;
grant execute on function public.join_group(uuid) to authenticated;
grant execute on function public.review_join_request(uuid, uuid, boolean) to authenticated;
grant execute on function public.leave_group(uuid) to authenticated;
