-- 0003: Өдрийн зорилгын биелэлт + XP/streak. Бүх бичилт сервер талд (security definer).

-- Client шууд insert хийхгүй; complete_goal()-оор л орно.
revoke insert on goal_completions from authenticated, anon;

-- Биелэлт бүртгэж, XP олгож, streak-ийг шинэчилнэ.
-- Давхар олголт: goal_completions (goal_id, completed_on) unique + xp_transactions idempotency key.
-- Зөвхөн хэрэглэгчийн timezone-ийн өнөөдөр эсвэл өчигдрийн огноо зөвшөөрнө (backfill хязгаар).
create or replace function public.complete_goal(
  p_goal_id uuid,
  p_completed_on date,
  p_proof_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid         uuid := auth.uid();
  v_tz          text;
  v_today       date;
  v_completion  uuid;
  v_xp_per_goal constant int := 20;
  v_total_xp    int;
  v_level       int;
  v_streak      int := 0;
  v_day         date;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if not exists (
    select 1 from goals g
    where g.id = p_goal_id and g.user_id = v_uid and g.status = 'active'
  ) then
    raise exception 'goal_not_found';
  end if;

  select coalesce(p.timezone, 'Asia/Ulaanbaatar') into v_tz
  from profiles p where p.id = v_uid;

  v_today := (now() at time zone v_tz)::date;
  if p_completed_on not in (v_today, v_today - 1) then
    raise exception 'date_out_of_range';
  end if;

  insert into goal_completions (goal_id, user_id, completed_on, proof_url)
  values (p_goal_id, v_uid, p_completed_on, p_proof_url)
  on conflict (goal_id, completed_on) do nothing
  returning id into v_completion;

  if v_completion is null then
    raise exception 'already_completed';
  end if;

  insert into xp_transactions (user_id, source_type, source_id, amount)
  values (v_uid, 'goal_completion', v_completion, v_xp_per_goal)
  on conflict (user_id, source_type, source_id) do nothing;

  -- Streak: p_completed_on-оос эхлэн өдөр бүр биелэлттэй байгаа тоо
  v_day := p_completed_on;
  loop
    exit when not exists (
      select 1 from goal_completions c
      where c.user_id = v_uid and c.completed_on = v_day
    );
    v_streak := v_streak + 1;
    v_day := v_day - 1;
  end loop;

  select coalesce(sum(x.amount), 0) into v_total_xp
  from xp_transactions x where x.user_id = v_uid;

  -- Түвшин: 0→1, 100→2, 400→3, 900→4 ... (tunable)
  v_level := floor(sqrt(v_total_xp / 100.0))::int + 1;

  insert into user_progress (user_id, total_xp, current_level, current_streak, longest_streak)
  values (v_uid, v_total_xp, v_level, v_streak, v_streak)
  on conflict (user_id) do update set
    total_xp       = excluded.total_xp,
    current_level  = excluded.current_level,
    current_streak = excluded.current_streak,
    longest_streak = greatest(user_progress.longest_streak, excluded.current_streak),
    updated_at     = now();

  return jsonb_build_object(
    'completion_id', v_completion,
    'xp_gained', v_xp_per_goal,
    'total_xp', v_total_xp,
    'level', v_level,
    'streak', v_streak
  );
end;
$$;

revoke execute on function public.complete_goal(uuid, date, text) from public, anon;
grant execute on function public.complete_goal(uuid, date, text) to authenticated;
