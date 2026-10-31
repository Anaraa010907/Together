-- Supabase-ийн орчинг локал Postgres дээр дуурайх shim.
-- Жинхэнэ Supabase дээр эдгээр нь аль хэдийн бэлэн байдаг.

-- Роль нь кластер даяар тул аль хэдийн байвал алгасна.
do $$
begin
  create role anon nologin;
exception when duplicate_object then null;
end $$;
do $$
begin
  create role authenticated nologin;
exception when duplicate_object then null;
end $$;
do $$
begin
  create role service_role nologin bypassrls;
exception when duplicate_object then null;
end $$;

drop schema if exists auth cascade;
create schema auth;

create table auth.users (
  id uuid primary key default gen_random_uuid()
);

-- JWT-ийн sub-г request.jwt.claim.sub-аас уншина (Supabase-ийн хэрэгжилттэй ижил).
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;

-- Supabase-ийн default grant: public дээрх шинэ хүснэгт/функцэд бүх эрх.
-- Migration-ууд эдгээрийг revoke хийж хязгаарлана.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
