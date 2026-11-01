-- 0010: Сургалтын үнэлгээ (1–5 од + сэтгэгдэл). Хичээлийн тал хувиас доошгүйг дуусгасан суралцагч өгнө.
-- Багшийн профайл дээр дундаж үнэлгээ харагдана.

create table course_reviews (
  id         uuid not null unique default gen_random_uuid(),  -- report-д
  group_id   uuid not null references groups (id) on delete cascade,
  user_id    uuid not null references profiles (id) on delete cascade,
  rating     int not null check (rating between 1 and 5),
  comment    text check (char_length(comment) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

alter table course_reviews enable row level security;
revoke all on course_reviews from anon, authenticated;
grant select, delete on course_reviews to authenticated;

-- Group-ийг харж чадах хүн үнэлгээг харна (нийтийн сургалтад гаднаас ч).
create policy reviews_select on course_reviews for select to authenticated
  using (public.can_view_group(group_id));
create policy reviews_delete_own on course_reviews for delete to authenticated
  using (user_id = auth.uid());

alter table user_reports drop constraint user_reports_target_type_check;
alter table user_reports add constraint user_reports_target_type_check
  check (target_type in ('profile', 'group', 'goal', 'post', 'comment', 'review'));

-- Үнэлгээ өгөх / засах.
create or replace function public.review_course(p_group_id uuid, p_rating int, p_comment text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_total int;
  v_done  int;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from groups g where g.id = p_group_id and g.kind = 'course' and g.deleted_at is null) then
    raise exception 'not_course';
  end if;
  if not public.is_group_member(p_group_id) then raise exception 'not_member'; end if;
  if public.is_group_owner(p_group_id) then raise exception 'not_student'; end if;
  if p_rating is null or p_rating not between 1 and 5 then raise exception 'invalid_rating'; end if;
  if char_length(coalesce(p_comment, '')) > 500 then raise exception 'comment_too_long'; end if;

  select count(*) into v_total from course_lessons where group_id = p_group_id;
  select count(*) into v_done from lesson_completions c
    join course_lessons l on l.id = c.lesson_id
    where l.group_id = p_group_id and c.user_id = v_uid;
  if v_done < 1 or v_done * 2 < v_total then raise exception 'not_enough_progress'; end if;

  insert into course_reviews (group_id, user_id, rating, comment)
  values (p_group_id, v_uid, p_rating, nullif(trim(p_comment), ''))
  on conflict (group_id, user_id) do update set
    rating = excluded.rating, comment = excluded.comment, updated_at = now();
end;
$$;

revoke execute on function public.review_course(uuid, int, text) from public, anon;
grant execute on function public.review_course(uuid, int, text) to authenticated;

-- teacher_stats (0009) + дундаж үнэлгээ (хаалттай сургалтынх ч тоонд орно, текст нь харагдахгүй).
create or replace function public.teacher_stats(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'courses', (select count(*) from groups g where g.owner_id = p_user_id and g.kind = 'course' and g.deleted_at is null),
    'students', (select count(distinct m.user_id) from group_members m join groups g on g.id = m.group_id
                 where g.owner_id = p_user_id and g.kind = 'course' and m.status = 'active' and m.user_id <> p_user_id),
    'helpful', (select count(*) from post_helpful h join posts p on p.id = h.post_id where p.author_id = p_user_id),
    'rating_avg', (select round(avg(r.rating)::numeric, 1) from course_reviews r join groups g on g.id = r.group_id
                   where g.owner_id = p_user_id and g.deleted_at is null),
    'rating_count', (select count(*) from course_reviews r join groups g on g.id = r.group_id
                     where g.owner_id = p_user_id and g.deleted_at is null)
  )
  where exists (select 1 from teacher_profiles t where t.user_id = p_user_id and t.enabled)
$$;
