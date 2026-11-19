import { supabase } from './supabase';

export type GoalVerification = 'manual' | 'gps' | 'focus';

export type Goal = {
  id: string;
  title: string;
  frequency: 'daily' | 'weekly';
  target: number;
  status: 'active' | 'paused' | 'archived';
  verification: GoalVerification;
  activity: 'run' | 'walk' | 'ride' | null;
  min_distance_m: number | null;
  min_minutes: number | null;
};

// Шинэ зорилгын баталгаажуулалт.
export type GoalConfig =
  | { verification: 'manual' }
  | { verification: 'gps'; activity: 'run' | 'walk' | 'ride'; minDistanceM: number }
  | { verification: 'focus'; minMinutes: number };

const GOAL_COLS = 'id, title, frequency, target, status, verification, activity, min_distance_m, min_minutes';

// GPS эсвэл фокусаар баталгаажих зорилгын төрөл (гараар бол null).
export function goalKind(g: Pick<Goal, 'verification' | 'activity'>): 'run' | 'walk' | 'ride' | 'focus' | null {
  if (g.verification === 'gps') return g.activity ?? 'run';
  if (g.verification === 'focus') return 'focus';
  return null;
}

export type Progress = {
  total_xp: number;
  current_level: number;
  current_streak: number;
  longest_streak: number;
};

// Хэрэглэгчийн timezone-оор өнөөдрийн огноо (YYYY-MM-DD).
export function todayIso(timeZone = 'Asia/Ulaanbaatar') {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());
}

export async function fetchActiveGoals(): Promise<Goal[]> {
  const { data, error } = await supabase
    .from('goals')
    .select(GOAL_COLS)
    .eq('status', 'active')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Goal[];
}

export async function fetchCompletionsOn(date: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('goal_completions')
    .select('goal_id')
    .eq('completed_on', date);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.goal_id as string));
}

export async function fetchProgress(): Promise<Progress> {
  const { data, error } = await supabase
    .from('user_progress')
    .select('total_xp, current_level, current_streak, longest_streak')
    .maybeSingle();
  if (error) throw error;
  return (
    (data as Progress | null) ?? { total_xp: 0, current_level: 1, current_streak: 0, longest_streak: 0 }
  );
}

export async function fetchGoal(id: string): Promise<Goal | null> {
  const { data, error } = await supabase.from('goals').select(GOAL_COLS).eq('id', id).maybeSingle();
  if (error) throw error;
  return data as Goal | null;
}

export async function createGoal(title: string, config: GoalConfig = { verification: 'manual' }) {
  const { data: sessionData } = await supabase.auth.getSession();
  const uid = sessionData.session?.user.id;
  if (!uid) throw new Error('Нэвтрээгүй байна.');

  const { error } = await supabase.from('goals').insert({
    user_id: uid,
    title,
    frequency: 'daily',
    target: 1,
    verification: config.verification,
    activity: config.verification === 'gps' ? config.activity : null,
    min_distance_m: config.verification === 'gps' ? config.minDistanceM : null,
    min_minutes: config.verification === 'focus' ? config.minMinutes : null,
  });
  if (error) throw error;
}

// Архивлах: жагсаалтаас нуугдана, өмнөх биелэлт ба XP хэвээр үлдэнэ.
export async function archiveGoal(goalId: string) {
  const { error } = await supabase.from('goals').update({ status: 'archived' }).eq('id', goalId);
  if (error) throw error;
}

// Server-side: XP, streak, level бүгд complete_goal() дотор тооцогдоно.
export async function completeGoal(goalId: string, date: string) {
  const { data, error } = await supabase.rpc('complete_goal', {
    p_goal_id: goalId,
    p_completed_on: date,
    p_proof_url: null,
  });
  if (error) throw error;
  return data as { xp_gained: number; total_xp: number; level: number; streak: number };
}
