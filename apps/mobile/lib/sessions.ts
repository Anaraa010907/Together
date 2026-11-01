import { supabase } from './supabase';

export type Session = {
  id: string;
  group_id: string;
  host_id: string | null;
  host_name: string;
  title: string;
  description: string | null;
  starts_at: string;
  duration_min: number;
  meeting_url: string | null;
  notes: string | null;
  cancelled_at: string | null;
};

export type SessionStatus = 'upcoming' | 'live' | 'ended' | 'cancelled';
export type Attendee = { user_id: string; display_name: string };

const COLS =
  'id, group_id, host_id, title, description, starts_at, duration_min, meeting_url, notes, cancelled_at, profiles(display_name)';

const one = (x: any) => (Array.isArray(x) ? x[0] : x);
const mapSession = (r: any): Session => ({ ...r, host_name: one(r.profiles)?.display_name ?? '—', profiles: undefined });

export const endsAt = (s: Session) => new Date(new Date(s.starts_at).getTime() + s.duration_min * 60_000);

export function statusOf(s: Session, now = new Date()): SessionStatus {
  if (s.cancelled_at) return 'cancelled';
  if (now < new Date(s.starts_at)) return 'upcoming';
  if (now <= endsAt(s)) return 'live';
  return 'ended';
}

// Эхлэхээс 15 минутын өмнөөс линкийг онцолж харуулна.
export const startsSoon = (s: Session, now = new Date()) =>
  statusOf(s, now) === 'upcoming' && new Date(s.starts_at).getTime() - now.getTime() <= 15 * 60_000;

const ERROR_CODES = [
  'not_member',
  'invalid_title',
  'invalid_duration',
  'invalid_start',
  'invalid_url',
  'session_not_found',
  'not_host',
  'notes_too_long',
  'session_cancelled',
  'session_ended',
] as const;

export function sessionErrorKey(e: unknown): string | null {
  const msg = String((e as any)?.message ?? e);
  const code = ERROR_CODES.find((c) => msg.includes(c));
  return code ? `sessions.errors.${code}` : null;
}

// ---------- унших ----------
// Удахгүй болох + сүүлийн 7 хоногийн (тэмдэглэлтэй байж болох) сешнүүд.
export async function fetchGroupSessions(groupId: string): Promise<Session[]> {
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from('group_sessions')
    .select(COLS)
    .eq('group_id', groupId)
    .gte('starts_at', since)
    .order('starts_at', { ascending: true })
    .limit(30);
  if (error) throw error;
  return (data ?? []).map(mapSession);
}

export async function fetchSession(id: string): Promise<Session | null> {
  const { data, error } = await supabase.from('group_sessions').select(COLS).eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? mapSession(data) : null;
}

export async function fetchAttendees(sessionId: string): Promise<Attendee[]> {
  const { data, error } = await supabase
    .from('session_rsvps')
    .select('user_id, created_at, profiles(display_name)')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({ user_id: r.user_id, display_name: one(r.profiles)?.display_name ?? '—' }));
}

// Миний "Очно" гэсэн, хараахан дуусаагүй сешнүүд (Өнөөдөр таб).
export async function fetchMyUpcomingSessions(limit = 3): Promise<Session[]> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return [];
  const { data, error } = await supabase
    .from('session_rsvps')
    .select(`group_sessions(${COLS})`)
    .eq('user_id', userData.user.id);
  if (error) throw error;
  const now = new Date();
  return (data ?? [])
    .map((r: any) => one(r.group_sessions))
    .filter(Boolean)
    .map(mapSession)
    .filter((s) => statusOf(s, now) === 'upcoming' || statusOf(s, now) === 'live')
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    .slice(0, limit);
}

// ---------- бичих ----------
export async function createSession(input: {
  groupId: string;
  title: string;
  description?: string;
  startsAt: Date;
  durationMin: number;
  meetingUrl?: string;
}) {
  const { data, error } = await supabase.rpc('create_session', {
    p_group_id: input.groupId,
    p_title: input.title,
    p_description: input.description ?? null,
    p_starts_at: input.startsAt.toISOString(),
    p_duration_min: input.durationMin,
    p_meeting_url: input.meetingUrl ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function updateSession(id: string, notes: string, meetingUrl: string) {
  const { error } = await supabase.rpc('update_session', {
    p_session_id: id,
    p_notes: notes,
    p_meeting_url: meetingUrl,
  });
  if (error) throw error;
}

export async function cancelSession(id: string) {
  const { error } = await supabase.rpc('cancel_session', { p_session_id: id });
  if (error) throw error;
}

export async function rsvpSession(id: string, going: boolean) {
  const { error } = await supabase.rpc('rsvp_session', { p_session_id: id, p_going: going });
  if (error) throw error;
}
