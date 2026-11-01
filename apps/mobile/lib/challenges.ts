import { supabase } from './supabase';

export type Challenge = {
  id: string;
  group_id: string;
  creator_id: string | null;
  title: string;
  description: string | null;
  start_on: string; // YYYY-MM-DD
  end_on: string;
};

export type ChallengeStatus = 'upcoming' | 'active' | 'ended';

export type Participant = {
  user_id: string;
  display_name: string;
  days: number;
};

export type CheckinResult = {
  xp_gained: number;
  total_xp: number;
  level: number;
  completed: boolean;
  days_done: number;
  days_total: number;
};

const COLS = 'id, group_id, creator_id, title, description, start_on, end_on';

// ---------- огнооны тооцоо (YYYY-MM-DD, timezone-гүй) ----------
const dayNum = (iso: string) =>
  Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86_400_000;

export function addDays(iso: string, n: number) {
  return new Date((dayNum(iso) + n) * 86_400_000).toISOString().slice(0, 10);
}
export function totalDays(c: Challenge) {
  return dayNum(c.end_on) - dayNum(c.start_on) + 1;
}
export function dayNumber(c: Challenge, today: string) {
  return dayNum(today) - dayNum(c.start_on) + 1;
}
export function statusOf(c: Challenge, today: string): ChallengeStatus {
  if (today < c.start_on) return 'upcoming';
  if (today > c.end_on) return 'ended';
  return 'active';
}

// Серверийн алдааны кодыг орчуулгын түлхүүр болгоно.
const ERROR_CODES = [
  'not_member',
  'invalid_start',
  'invalid_duration',
  'invalid_title',
  'challenge_not_found',
  'challenge_ended',
  'not_participant',
  'already_checked_in',
  'date_out_of_range',
  'outside_challenge',
] as const;

export function challengeErrorKey(e: unknown): string | null {
  const msg = String((e as any)?.message ?? e);
  const code = ERROR_CODES.find((c) => msg.includes(c));
  return code ? `challenges.errors.${code}` : null;
}

async function myId() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw error ?? new Error('Нэвтрээгүй байна.');
  return data.user.id;
}

// ---------- унших ----------
export async function fetchGroupChallenges(groupId: string): Promise<Challenge[]> {
  const { data, error } = await supabase
    .from('challenges')
    .select(COLS)
    .eq('group_id', groupId)
    .order('start_on', { ascending: false })
    .limit(30);
  if (error) throw error;
  return (data ?? []) as Challenge[];
}

export async function fetchChallenge(id: string): Promise<Challenge | null> {
  const { data, error } = await supabase.from('challenges').select(COLS).eq('id', id).maybeSingle();
  if (error) throw error;
  return data as Challenge | null;
}

// Оролцогчид (нэгдсэн дарааллаар) + хүн бүрийн биелүүлсэн өдөр, мөн бүх check-in.
export async function fetchChallengeProgress(id: string) {
  const [p, c] = await Promise.all([
    supabase
      .from('challenge_participants')
      .select('user_id, joined_at, profiles(display_name)')
      .eq('challenge_id', id)
      .order('joined_at', { ascending: true }),
    supabase.from('challenge_checkins').select('user_id, checked_on').eq('challenge_id', id),
  ]);
  if (p.error) throw p.error;
  if (c.error) throw c.error;

  const checkins = (c.data ?? []) as { user_id: string; checked_on: string }[];
  const counts = new Map<string, number>();
  for (const row of checkins) counts.set(row.user_id, (counts.get(row.user_id) ?? 0) + 1);

  const participants: Participant[] = (p.data ?? []).map((r: any) => {
    const prof = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
    return { user_id: r.user_id, display_name: prof?.display_name ?? '—', days: counts.get(r.user_id) ?? 0 };
  });
  return { participants, checkins };
}

// Миний оролцож буй challenge-үүд.
export async function fetchMyChallenges(): Promise<Challenge[]> {
  const uid = await myId();
  const { data, error } = await supabase
    .from('challenge_participants')
    .select(`challenges(${COLS})`)
    .eq('user_id', uid);
  if (error) throw error;
  return (data ?? [])
    .map((r: any) => (Array.isArray(r.challenges) ? r.challenges[0] : r.challenges))
    .filter(Boolean) as Challenge[];
}

// Тухайн өдөр check-in хийсэн challenge-ийн id-ууд.
export async function fetchMyCheckinsOn(date: string): Promise<Set<string>> {
  const uid = await myId();
  const { data, error } = await supabase
    .from('challenge_checkins')
    .select('challenge_id')
    .eq('user_id', uid)
    .eq('checked_on', date);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.challenge_id as string));
}

// ---------- бичих (бүгд серверийн функц) ----------
export async function createChallenge(input: {
  groupId: string;
  title: string;
  description?: string;
  startOn: string;
  days: number;
}) {
  const { data, error } = await supabase.rpc('create_challenge', {
    p_group_id: input.groupId,
    p_title: input.title,
    p_description: input.description ?? null,
    p_start_on: input.startOn,
    p_days: input.days,
  });
  if (error) throw error;
  return data as string;
}

export async function joinChallenge(id: string) {
  const { error } = await supabase.rpc('join_challenge', { p_challenge_id: id });
  if (error) throw error;
}

export async function leaveChallenge(id: string) {
  const { error } = await supabase.rpc('leave_challenge', { p_challenge_id: id });
  if (error) throw error;
}

export async function checkInChallenge(id: string, date: string) {
  const { data, error } = await supabase.rpc('checkin_challenge', {
    p_challenge_id: id,
    p_checked_on: date,
  });
  if (error) throw error;
  return data as CheckinResult;
}
