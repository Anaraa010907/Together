import i18n from './i18n';
import { supabase } from './supabase';

export type Category = { id: string; name_mn: string; name_en: string; icon: string };

export type SuggestedGroup = {
  id: string;
  name: string;
  description: string | null;
  kind: 'community' | 'course';
  category_id: string | null;
  join_policy: 'open' | 'approval' | 'invite_only';
  members: number;
};

export const categoryName = (c: Category) => (i18n.language === 'en' ? c.name_en : c.name_mn);

// Ангилал бүрт тогтмол бараан градиент (Night Violet палитртай зохицсон). id-аас hash-аар сонгоно.
const GRADIENTS: [string, string][] = [
  ['#6D28D9', '#2E1065'], // нил ягаан
  ['#1D4ED8', '#172554'], // цэнхэр
  ['#BE185D', '#500724'], // ягаан
  ['#C2410C', '#431407'], // улбар шар
  ['#0F766E', '#042F2E'], // ногоон
  ['#B45309', '#451A03'], // алтан
];
export function categoryColor(id: string | null | undefined): [string, string] {
  if (!id) return ['#3B2F78', '#1C1638'];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return GRADIENTS[Math.abs(h) % GRADIENTS.length];
}

let cache: Category[] | null = null;

export async function fetchCategories(): Promise<Category[]> {
  if (cache) return cache;
  const { data, error } = await supabase.from('categories').select('id, name_mn, name_en, icon').order('position');
  if (error) throw error;
  cache = (data ?? []) as Category[];
  return cache;
}

export async function fetchMyInterests(): Promise<string[]> {
  const { data, error } = await supabase.from('user_interests').select('category_id');
  if (error) throw error;
  return (data ?? []).map((r) => r.category_id as string);
}

// Хоосон жагсаалт = алгассан (onboarding дахин асуухгүй).
export async function setInterests(ids: string[]) {
  const { error } = await supabase.rpc('set_interests', { p_categories: ids });
  if (error) throw error;
}

export async function fetchSuggestedGroups(limit = 10): Promise<SuggestedGroup[]> {
  const { data, error } = await supabase.rpc('suggested_groups', { p_limit: limit });
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({ ...r, members: Number(r.members) }));
}

export async function setGroupCategory(groupId: string, categoryId: string | null) {
  const { error } = await supabase.from('groups').update({ category_id: categoryId }).eq('id', groupId);
  if (error) throw error;
}
