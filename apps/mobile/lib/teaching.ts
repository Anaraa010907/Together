import { Alert } from 'react-native';
import i18n from './i18n';
import { supabase } from './supabase';
import { makeSlug, type GroupSummary } from './groups';

export type TeacherProfile = {
  user_id: string;
  enabled: boolean;
  headline: string | null;
  subjects: string[];
  intro: string | null;
  verified_at: string | null;
  display_name?: string;
};

export type TeacherStats = { courses: number; students: number; helpful: number };

export type Lesson = {
  id: string;
  group_id: string;
  position: number;
  title: string;
  content: string | null;
  video_url: string | null;
};

const TCOLS = 'user_id, enabled, headline, subjects, intro, verified_at';
const LCOLS = 'id, group_id, position, title, content, video_url';
const one = (x: any) => (Array.isArray(x) ? x[0] : x);

const ERROR_CODES = [
  'not_teacher',
  'course_adults_only',
  'age_already_declared',
  'lesson_not_found',
  'not_member',
  'not_student',
  'previous_lesson_required',
  'already_completed',
] as const;

export function courseErrorKey(e: unknown): string | null {
  const msg = String((e as any)?.message ?? e);
  const code = ERROR_CODES.find((c) => msg.includes(c));
  return code ? `courses.errors.${code}` : null;
}

async function myId() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw error ?? new Error('Нэвтрээгүй байна.');
  return data.user.id;
}

// "Багш, пр, ielts" → ['Багш', 'пр', 'ielts'] (5 хүртэл, тус бүр 30 тэмдэгт)
export function parseSubjects(text: string) {
  return [...new Set(text.split(',').map((s) => s.trim()).filter(Boolean))].slice(0, 5).map((s) => s.slice(0, 30));
}

// ---------- нас ----------
export async function declareAge(adult: boolean) {
  const { error } = await supabase.rpc('declare_age', { p_adult: adult });
  if (error) throw error;
}

// Сургалтад нэгдэх үед нас зарлаагүй бол нэг удаа асууна. Зарласан бол true.
export function promptDeclareAge(onDeclared: () => void) {
  const pick = (adult: boolean) =>
    declareAge(adult)
      .then(onDeclared)
      .catch((e) => {
        const key = courseErrorKey(e);
        Alert.alert(i18n.t('common.error'), i18n.t(key === 'courses.errors.age_already_declared'
          ? 'courses.errors.course_adults_only'
          : key ?? 'common.error'));
      });
  Alert.alert(i18n.t('age.title'), i18n.t('age.body'), [
    { text: i18n.t('age.adult'), onPress: () => pick(true) },
    { text: i18n.t('age.minor'), onPress: () => pick(false) },
    { text: i18n.t('common.cancel'), style: 'cancel' },
  ]);
}

// ---------- багшийн профайл ----------
export async function fetchMyTeacherProfile(): Promise<TeacherProfile | null> {
  const uid = await myId();
  const { data, error } = await supabase.from('teacher_profiles').select(TCOLS).eq('user_id', uid).maybeSingle();
  if (error) throw error;
  return data as TeacherProfile | null;
}

export async function saveTeacherProfile(input: {
  enabled: boolean;
  headline: string;
  subjects: string[];
  intro: string;
}) {
  const uid = await myId();
  const row = {
    enabled: input.enabled,
    headline: input.headline.trim() || null,
    subjects: input.subjects,
    intro: input.intro.trim() || null,
  };
  const existing = await fetchMyTeacherProfile();
  const { error } = existing
    ? await supabase.from('teacher_profiles').update(row).eq('user_id', uid)
    : await supabase.from('teacher_profiles').insert({ user_id: uid, ...row });
  if (error) throw error;
}

export async function fetchTeachers(): Promise<TeacherProfile[]> {
  const { data, error } = await supabase
    .from('teacher_profiles')
    .select(`${TCOLS}, profiles(display_name)`)
    .eq('enabled', true)
    .order('verified_at', { ascending: false, nullsFirst: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []).map((r: any) => ({ ...r, display_name: one(r.profiles)?.display_name ?? '—', profiles: undefined }));
}

export async function fetchTeacher(userId: string) {
  const [t, s, c] = await Promise.all([
    supabase.from('teacher_profiles').select(`${TCOLS}, profiles(display_name)`).eq('user_id', userId).maybeSingle(),
    supabase.rpc('teacher_stats', { p_user_id: userId }),
    supabase
      .from('groups')
      .select('id, name, slug, description, visibility, join_policy, owner_id, kind')
      .eq('owner_id', userId)
      .eq('kind', 'course')
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
  ]);
  if (t.error) throw t.error;
  if (!t.data) return null;
  const r: any = t.data;
  return {
    profile: { ...r, display_name: one(r.profiles)?.display_name ?? '—', profiles: undefined } as TeacherProfile,
    stats: (s.data as TeacherStats | null) ?? { courses: 0, students: 0, helpful: 0 },
    courses: (c.data ?? []) as GroupSummary[],
  };
}

// ---------- сургалт, хичээл ----------
export async function createCourse(input: { name: string; description?: string; isPrivate: boolean }) {
  const { data, error } = await supabase.rpc('create_course', {
    p_name: input.name,
    p_slug: makeSlug(input.name),
    p_description: input.description ?? null,
    p_visibility: input.isPrivate ? 'private' : 'public',
  });
  if (error) throw error;
  return data as string;
}

export async function fetchLessons(groupId: string): Promise<Lesson[]> {
  const { data, error } = await supabase
    .from('course_lessons')
    .select(LCOLS)
    .eq('group_id', groupId)
    .order('position', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Lesson[];
}

export async function fetchLesson(id: string): Promise<Lesson | null> {
  const { data, error } = await supabase.from('course_lessons').select(LCOLS).eq('id', id).maybeSingle();
  if (error) throw error;
  return data as Lesson | null;
}

// Group-ийн бүх биелэлт (гишүүдэд харагдана): lesson_id → user_id[]
export async function fetchCompletions(lessonIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (lessonIds.length === 0) return out;
  const { data, error } = await supabase
    .from('lesson_completions')
    .select('lesson_id, user_id')
    .in('lesson_id', lessonIds);
  if (error) throw error;
  for (const r of data ?? []) out.set(r.lesson_id, [...(out.get(r.lesson_id) ?? []), r.user_id]);
  return out;
}

export async function addLesson(input: { groupId: string; position: number; title: string; content?: string; videoUrl?: string }) {
  const { data, error } = await supabase
    .from('course_lessons')
    .insert({
      group_id: input.groupId,
      position: input.position,
      title: input.title,
      content: input.content || null,
      video_url: input.videoUrl || null,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function deleteLesson(id: string) {
  const { error } = await supabase.from('course_lessons').delete().eq('id', id);
  if (error) throw error;
}

export async function completeLesson(id: string) {
  const { data, error } = await supabase.rpc('complete_lesson', { p_lesson_id: id });
  if (error) throw error;
  return data as { xp_gained: number; total_xp: number; level: number; done: number; total: number };
}
