import { supabase } from './supabase';
import type { ActivityKind, TrackPoint } from './tracking';

export type Verification = 'manual' | 'gps' | 'place' | 'focus';

export type FinishResult = {
  verified: boolean;
  reason: string | null;
  meets: boolean;
  distance_m: number;
  duration_s: number;
  avg_speed_mps: number;
  checked_in: boolean;
  checkin: { total_xp: number; level: number; xp_gained: number; days_done: number; days_total: number } | null;
};

export type Activity = {
  id: string;
  kind: ActivityKind;
  status: 'active' | 'verified' | 'rejected' | 'abandoned';
  started_at: string;
  distance_m: number | null;
  duration_s: number | null;
  avg_speed_mps: number | null;
  reject_reason: string | null;
  checked_in: boolean;
};

export type BoardRow = { user_id: string; display_name: string; avatar_url: string | null; days: number; distance_m: number; minutes: number };

export async function startActivity(challengeId: string | null, kind: ActivityKind): Promise<{ id: string; started_at: string }> {
  const { data, error } = await supabase.rpc('start_activity', { p_challenge: challengeId, p_kind: kind });
  if (error) throw error;
  return data as { id: string; started_at: string };
}

export async function finishActivity(id: string, points: TrackPoint[], interrupted = false): Promise<FinishResult> {
  const mocked = points.some((p) => p.mocked);
  const clean = points.map((p) => ({ lat: Number(p.lat.toFixed(6)), lng: Number(p.lng.toFixed(6)), t: Math.round(p.t), acc: Math.round(p.acc) }));
  const { data, error } = await supabase.rpc('finish_activity', {
    p_activity: id,
    p_points: clean,
    p_mocked: mocked,
    p_interrupted: interrupted,
  });
  if (error) throw error;
  return data as FinishResult;
}

export async function cancelActivity(id: string) {
  const { error } = await supabase.rpc('cancel_activity', { p_activity: id });
  if (error) throw error;
}

export async function fetchMyActivities(challengeId: string, limit = 20): Promise<Activity[]> {
  const { data, error } = await supabase
    .from('activities')
    .select('id, kind, status, started_at, distance_m, duration_s, avg_speed_mps, reject_reason, checked_in')
    .eq('challenge_id', challengeId)
    .neq('status', 'abandoned')
    .order('started_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as Activity[];
}

export async function fetchBoard(challengeId: string): Promise<BoardRow[]> {
  const { data, error } = await supabase.rpc('challenge_board', { p_challenge: challengeId });
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({ ...r, days: Number(r.days), distance_m: Number(r.distance_m), minutes: Number(r.minutes) }));
}

export type VerificationConfig =
  | { verification: 'manual' }
  | { verification: 'gps'; activity: 'run' | 'walk' | 'ride'; minDistanceM: number }
  | { verification: 'place'; placeName: string; lat: number; lng: number; radiusM: number; minMinutes: number }
  | { verification: 'focus'; minMinutes: number };

export async function setChallengeVerification(challengeId: string, c: VerificationConfig) {
  const args: Record<string, unknown> = { p_challenge: challengeId, p_verification: c.verification };
  if (c.verification === 'gps') Object.assign(args, { p_activity: c.activity, p_min_distance_m: c.minDistanceM });
  if (c.verification === 'place')
    Object.assign(args, { p_place_name: c.placeName, p_place_lat: c.lat, p_place_lng: c.lng, p_place_radius_m: c.radiusM, p_min_minutes: c.minMinutes });
  if (c.verification === 'focus') Object.assign(args, { p_min_minutes: c.minMinutes });
  const { error } = await supabase.rpc('set_challenge_verification', args);
  if (error) throw error;
}

export function activityErrorKey(e: unknown): string | null {
  const msg = String((e as any)?.message ?? e);
  for (const k of ['not_participant', 'kind_mismatch', 'outside_challenge', 'activity_closed', 'activity_not_found', 'too_many_points', 'invalid_kind', 'banned', 'already_started', 'not_creator']) {
    if (msg.includes(k)) return `track.errors.${k}`;
  }
  return null;
}

export const KIND_ICON: Record<ActivityKind, string> = { run: '🏃', walk: '🚶', ride: '🚴', place: '📍', focus: '⏱️' };
