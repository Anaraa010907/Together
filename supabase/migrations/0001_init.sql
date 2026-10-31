-- TOGETHER — 0001 init: MVP хүснэгтүүд, constraint, RLS
-- Зарчим: XP / progress-ийг зөвхөн сервер талд бичнэ. Client эдгээрт insert хийхгүй.

create extension if not exists pgcrypto;

-- ---------- enums ----------
create type group_visibility as enum ('public', 'private');
create type join_policy      as enum ('open', 'approval', 'invite_only');
create type member_role      as enum ('owner', 'admin', 'member');
create type member_status    as enum ('active', 'pending', 'banned');

-- ---------- profiles ----------
create table profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  username     text unique not null check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name text not null check (char_length(display_name) between 1 and 40),
  bio          text check (char_length(bio) <= 300),
  avatar_url   text,
  locale       text not null default 'mn' check (locale in ('mn', 'en')),
  timezone     text not null default 'Asia/Ulaanbaatar',
  is_minor     boolean not null default false,      -- birth_date-г хадгалахгүй
  privacy      text not null default 'private' check (privacy in ('public', 'private')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

-- Client зөвхөн өөрийн харагдах талбаруудаа засна (is_minor, role-ыг оруулаагүй)
revoke update on profiles from authenticated, anon;
grant update (username, display_name, bio, avatar_url, locale, timezone, privacy)
  on profiles to authenticated;

-- ---------- groups ----------
create table groups (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references profiles (id),
  name        text not null check (char_length(name) between 2 and 60),
  slug        text unique not null,
  description text check (char_length(description) <= 500),
  cover_url   text,
  visibility  group_visibility not null default 'public',
  join_policy join_policy not null default 'open',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

-- Нэг хүснэгт: pending хүсэлт нь status='pending' мөр
create table group_members (
  group_id  uuid not null references groups (id) on delete cascade,
  user_id   uuid not null references profiles (id) on delete cascade,
  role      member_role not null default 'member',
  status    member_status not null default 'active',
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

-- ---------- goals ----------
create table goals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles (id) on delete cascade,
  group_id    uuid references groups (id) on delete set null,
  title       text not null check (char_length(title) between 1 and 120),
  description text check (char_length(description) <= 500),
  frequency   text not null default 'daily' check (frequency in ('daily', 'weekly')),
  target      int not null default 1 check (target > 0),
  status      text not null default 'active' check (status in ('active', 'paused', 'archived')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Өдөр бүр нэг удаа: completed_on нь хэрэглэгчийн timezone-оор тооцсон огноо
create table goal_completions (
  id           uuid primary key default gen_random_uuid(),
  goal_id      uuid not null references goals (id) on delete cascade,
  user_id      uuid not null references profiles (id) on delete cascade,
  completed_on date not null,
  proof_url    text,
  created_at   timestamptz not null default now(),
  unique (goal_id, completed_on)
);

-- ---------- XP / progress (server-only write) ----------
create table xp_transactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles (id) on delete cascade,
  source_type text not null,
  source_id   uuid not null,
  amount      int not null check (amount > 0),
  created_at  timestamptz not null default now(),
  unique (user_id, source_type, source_id)          -- давхар олголтоос хамгаална
);

create table user_progress (
  user_id         uuid primary key references profiles (id) on delete cascade,
  total_xp        int not null default 0 check (total_xp >= 0),
  current_level   int not null default 1 check (current_level >= 1),
  current_streak  int not null default 0 check (current_streak >= 0),
  longest_streak  int not null default 0 check (longest_streak >= 0),
  updated_at      timestamptz not null default now()
);

-- ---------- moderation ----------
create table user_blocks (
  blocker_id uuid not null references profiles (id) on delete cascade,
  blocked_id uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table user_reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references profiles (id) on delete cascade,
  target_type text not null check (target_type in ('profile', 'group', 'goal')),
  target_id   uuid not null,
  reason      text not null check (char_length(reason) between 1 and 500),
  status      text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  created_at  timestamptz not null default now()
);

-- ---------- helpers (RLS-д рекурсгүйгээр шалгах) ----------
create or replace function public.is_group_member(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from group_members gm
    where gm.group_id = gid and gm.user_id = auth.uid() and gm.status = 'active'
  );
$$;

create or replace function public.is_group_owner(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from groups g where g.id = gid and g.owner_id = auth.uid());
$$;

-- ---------- RLS ----------
alter table profiles          enable row level security;
alter table groups            enable row level security;
alter table group_members     enable row level security;
alter table goals             enable row level security;
alter table goal_completions  enable row level security;
alter table xp_transactions   enable row level security;
alter table user_progress     enable row level security;
alter table user_blocks       enable row level security;
alter table user_reports      enable row level security;

-- profiles: нэвтэрсэн хэрэглэгч устгагдаагүй профайлыг харна; өөрийгөө л засна
create policy profiles_select on profiles for select to authenticated
  using (deleted_at is null);
create policy profiles_update_self on profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- groups: public эсвэл гишүүн/эзэн харна; үүсгэгч нь owner
create policy groups_select on groups for select to authenticated
  using (deleted_at is null and (visibility = 'public' or public.is_group_member(id) or owner_id = auth.uid()));
create policy groups_insert on groups for insert to authenticated
  with check (owner_id = auth.uid());
create policy groups_update_owner on groups for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- group_members: гишүүд харна (public group-ийн гишүүнчлэл нийтэд харагдана)
-- INSERT-ийг client-д нээхгүй: join_group() функцээр л орно (join_policy-г шалгана)
create policy gm_select on group_members for select to authenticated
  using (
    public.is_group_member(group_id)
    or exists (select 1 from groups g where g.id = group_id and g.visibility = 'public')
  );
create policy gm_delete_self on group_members for delete to authenticated
  using (user_id = auth.uid());
create policy gm_manage_owner on group_members for update to authenticated
  using (public.is_group_owner(group_id)) with check (public.is_group_owner(group_id));
create policy gm_delete_owner on group_members for delete to authenticated
  using (public.is_group_owner(group_id));

-- goals / completions: зөвхөн өөрийнх
create policy goals_own on goals for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy completions_select_own on goal_completions for select to authenticated
  using (user_id = auth.uid());
create policy completions_insert_own on goal_completions for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from goals g where g.id = goal_id and g.user_id = auth.uid()));

-- XP / progress: зөвхөн унших (бичих нь service role / security definer функц)
create policy xp_select_own on xp_transactions for select to authenticated
  using (user_id = auth.uid());
create policy progress_select_own on user_progress for select to authenticated
  using (user_id = auth.uid());

-- moderation
create policy blocks_own on user_blocks for all to authenticated
  using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());
create policy reports_insert_own on user_reports for insert to authenticated
  with check (reporter_id = auth.uid());
create policy reports_select_own on user_reports for select to authenticated
  using (reporter_id = auth.uid());

-- ---------- updated_at trigger ----------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch before update on profiles
  for each row execute function public.touch_updated_at();
create trigger groups_touch before update on groups
  for each row execute function public.touch_updated_at();
create trigger goals_touch before update on goals
  for each row execute function public.touch_updated_at();
