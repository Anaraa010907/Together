-- Урилгын код, report/block, бүртгэл устгах тестүүд. 10_rules.sql-ийн дараа ажиллана.

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

do $$
declare
  u1 uuid := '11111111-1111-1111-1111-111111111111';
  u2 uuid := '22222222-2222-2222-2222-222222222222';
  u3 uuid := '33333333-3333-3333-3333-333333333333';
  g uuid; v_code text; gid uuid; n int;
begin
  -- ===== Урилгын код =====
  perform pg_temp.as_user(u1);
  select create_group('Book Club', 'book-club', null, 'private', 'invite_only') into g;
  select create_group_invite(g) into v_code;
  assert length(v_code) = 8, 'invite code is 8 chars';

  perform pg_temp.as_user(u2);
  perform pg_temp.expect_error(format('select create_group_invite(%L)', g), 'not_owner');
  perform pg_temp.expect_error($q$select redeem_group_invite('NOPE1234')$q$, 'invalid_code');

  select redeem_group_invite(lower(v_code)) into gid;  -- жижиг үсгээр ч ажиллана
  assert gid = g, 'redeem returns group id';
  select count(*) into n from groups where id = g;
  assert n = 1, 'member sees private invite-only group after redeem';
  select redeem_group_invite(v_code) into gid;         -- давтан ашиглахад алдаагүй
  assert gid = g, 'repeat redeem is idempotent';

  -- Урилгыг зөвхөн эзэн харна
  select count(*) into n from group_invites where group_id = g;
  assert n = 0, 'non-owner cannot read invites';

  -- Хориглогдсон хэрэглэгч
  perform pg_temp.as_admin();
  insert into group_members (group_id, user_id, role, status) values (g, u3, 'member', 'banned');
  perform pg_temp.as_user(u3);
  perform pg_temp.expect_error(format('select redeem_group_invite(%L)', v_code), 'banned');

  -- Хугацаа дууссан код
  perform pg_temp.as_admin();
  update group_invites set expires_at = now() - interval '1 minute' where code = v_code;
  perform pg_temp.as_user(u3);
  perform pg_temp.expect_error(format('select redeem_group_invite(%L)', v_code), 'invite_expired');

  -- Урилгын хүснэгтэд шууд бичих эрхгүй
  perform pg_temp.as_user(u1);
  perform pg_temp.expect_error(
    format('insert into group_invites (group_id, code, created_by) values (%L, ''HACK0001'', %L)', g, u1),
    'permission denied');

  -- ===== Report / block =====
  perform pg_temp.as_user(u2);
  insert into user_reports (reporter_id, target_type, target_id, reason) values (u2, 'group', g, 'spam');
  perform pg_temp.expect_error(
    format('insert into user_reports (reporter_id, target_type, target_id, reason) values (%L, ''group'', %L, ''x'')', u1, g),
    'row-level security');
  insert into user_blocks (blocker_id, blocked_id) values (u2, u1);
  perform pg_temp.expect_error(
    format('insert into user_blocks (blocker_id, blocked_id) values (%L, %L)', u2, u2),
    'check constraint');

  -- ===== Бүртгэл устгах =====
  perform delete_my_account();  -- u2
  perform pg_temp.as_admin();
  select count(*) into n from auth.users where id = u2;   assert n = 0, 'auth user deleted';
  select count(*) into n from profiles where id = u2;     assert n = 0, 'profile deleted';
  select count(*) into n from group_members where user_id = u2; assert n = 0, 'memberships deleted';
  select count(*) into n from user_blocks where blocker_id = u2; assert n = 0, 'blocks deleted';

  -- Эзэн устахад эзэмшдэг group-ууд устна
  perform pg_temp.as_user(u1);
  perform delete_my_account();
  perform pg_temp.as_admin();
  select count(*) into n from groups where owner_id = u1;  assert n = 0, 'owned groups deleted';
  select count(*) into n from goals where user_id = u1;    assert n = 0, 'goals deleted';
  select count(*) into n from xp_transactions where user_id = u1; assert n = 0, 'xp deleted';

  raise notice 'ALL INVITE/ACCOUNT TESTS PASSED';
end $$;
