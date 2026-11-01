-- 0012: Сонирхол (onboarding), группын ангилал, санал болгох группууд.
-- Мөн: groups-ийн update-ийг багана тус бүрээр хязгаарлана (эзэн kind-ийг 'course' болгож багшийн шалгалтыг тойрохгүй).

create table categories (
  id       text primary key check (id ~ '^[a-z_]{2,30}$'),
  name_mn  text not null,
  name_en  text not null,
  icon     text not null,
  position int not null default 0
);

insert into categories (id, name_mn, name_en, icon, position) values
  ('language',    'Гадаад хэл',        'Languages',        '🗣️', 1),
  ('programming', 'Програмчлал',       'Programming',      '💻', 2),
  ('business',    'Бизнес, стартап',   'Business',         '📈', 3),
  ('study',       'Хичээл, шалгалт',   'Study & exams',    '📚', 4),
  ('fitness',     'Фитнес, спорт',     'Fitness & sport',  '🏃', 5),
  ('health',      'Эрүүл амьдрал',     'Healthy living',   '🥗', 6),
  ('reading',     'Ном унших',         'Reading',          '📖', 7),
  ('mindfulness', 'Сэтгэл амар байдал', 'Mindfulness',     '🧘', 8),
  ('career',      'Ажил мэргэжил',     'Career',           '💼', 9),
  ('finance',     'Санхүүгийн боловсрол', 'Personal finance', '💰', 10),
  ('art',         'Урлаг, дизайн',     'Art & design',     '🎨', 11),
  ('music',       'Хөгжим',            'Music',            '🎵', 12);

alter table categories enable row level security;
revoke all on categories from anon, authenticated;
grant select on categories to authenticated;
create policy categories_select on categories for select to authenticated using (true);

-- ---------- хэрэглэгчийн сонирхол ----------
alter table profiles add column interests_set_at timestamptz;

create table user_interests (
  user_id     uuid not null references profiles (id) on delete cascade,
  category_id text not null references categories (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, category_id)
);
create index user_interests_category_idx on user_interests (category_id);

alter table user_interests enable row level security;
revoke all on user_interests from anon, authenticated;
grant select on user_interests to authenticated;
create policy interests_select_own on user_interests for select to authenticated
  using (user_id = (select auth.uid()));

-- Сонирхлыг бүхэлд нь солино (хоосон = алгассан). interests_set_at тавина.
create or replace function public.set_interests(p_categories text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if coalesce(array_length(p_categories, 1), 0) > 12 then raise exception 'too_many_interests'; end if;
  if not exists (select 1 from profiles where id = v_uid) then raise exception 'profile_required'; end if;

  delete from user_interests where user_id = v_uid;
  insert into user_interests (user_id, category_id)
  select v_uid, c.id from categories c where c.id = any (coalesce(p_categories, '{}'));

  update profiles set interests_set_at = now() where id = v_uid;
end;
$$;

-- ---------- группын ангилал ----------
alter table groups add column category_id text references categories (id) on delete set null;
create index groups_category_idx on groups (category_id) where deleted_at is null;

-- Эзэн зөвхөн эдгээр баганыг засна (kind, owner_id, deleted_at-ийг биш).
revoke update on groups from authenticated, anon;
grant update (name, description, cover_url, visibility, join_policy, category_id) on groups to authenticated;

-- Санал болгох группууд: миний сонирхлын ангилалд байгаа, би гишүүн биш нийтийн группууд,
-- гишүүний тоогоор. Сонирхолгүй бол хамгийн идэвхтэй нийтийн группууд.
-- security invoker: RLS хэвээр үйлчилнэ.
create or replace function public.suggested_groups(p_limit int default 10)
returns table (
  id uuid,
  name text,
  description text,
  kind text,
  category_id text,
  join_policy join_policy,
  members bigint
)
language sql
stable
set search_path = public
as $$
  with mine as (
    select category_id from user_interests where user_id = auth.uid()
  )
  select g.id, g.name, g.description, g.kind, g.category_id, g.join_policy,
         (select count(*) from group_members m where m.group_id = g.id and m.status = 'active') as members
  from groups g
  where g.deleted_at is null
    and g.visibility = 'public'
    and g.join_policy <> 'invite_only'
    and not exists (select 1 from group_members m where m.group_id = g.id and m.user_id = auth.uid())
    and (not exists (select 1 from mine) or g.category_id in (select category_id from mine))
  order by (g.category_id in (select category_id from mine)) desc nulls last, members desc, g.created_at desc
  limit least(greatest(coalesce(p_limit, 10), 1), 30)
$$;

revoke execute on function public.set_interests(text[]) from public, anon;
revoke execute on function public.suggested_groups(int) from public, anon;
grant execute on function public.set_interests(text[]) to authenticated;
grant execute on function public.suggested_groups(int) to authenticated;
