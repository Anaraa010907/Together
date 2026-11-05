import { Alert } from 'react-native';
import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import type { Session } from '@supabase/supabase-js';
import i18n from './i18n';
import { supabase } from './supabase';

type SessionState = {
  session: Session | null;
  hasProfile: boolean;
  needsInterests: boolean;
  loading: boolean;
  refreshProfile: () => Promise<void>;
};

const SessionContext = createContext<SessionState>({
  session: null,
  hasProfile: false,
  needsInterests: false,
  loading: true,
  refreshProfile: async () => {},
});

export function SessionProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [hasProfile, setHasProfile] = useState(false);
  const [needsInterests, setNeedsInterests] = useState(false);
  const [loading, setLoading] = useState(true);

  // Профайл байгаа эсэхийг RLS-ээр шалгана (өөрийн мөр л харагдана).
  const refreshProfile = async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      setHasProfile(false);
      setNeedsInterests(false);
      return;
    }
    let { data, error } = await supabase
      .from('profiles')
      .select('id, locale, interests_set_at, banned_at')
      .eq('id', userData.user.id)
      .maybeSingle();
    // Сервер 0012-гүй (interests_set_at багана байхгүй) бол сонирхлын алхмыг алгасна.
    if (error?.code === '42703') {
      const fallback = await supabase.from('profiles').select('id, locale').eq('id', userData.user.id).maybeSingle();
      data = fallback.data ? { ...fallback.data, interests_set_at: 'n/a', banned_at: null } : null;
      error = fallback.error;
    }
    // Админ хориглосон бол гаргана.
    if (data?.banned_at) {
      Alert.alert(i18n.t('admin.bannedTitle'), i18n.t('admin.bannedBody'));
      await supabase.auth.signOut().catch(() => {});
      setHasProfile(false);
      setNeedsInterests(false);
      return;
    }
    setHasProfile(!error && !!data);
    // Onboarding-ийн сонирхлын алхмыг (алгассан ч) нэг удаа дуусгасан эсэх.
    setNeedsInterests(!error && !!data && !data.interests_set_at);
    // Профайлд хадгалсан хэлийг ачаална.
    if (data?.locale && data.locale !== i18n.language) {
      await i18n.changeLanguage(data.locale);
    }
  };

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      await refreshProfile();
      if (active) setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, next) => {
      setSession(next);
      if (next) await refreshProfile();
      else setHasProfile(false);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return (
    <SessionContext.Provider value={{ session, hasProfile, needsInterests, loading, refreshProfile }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  return useContext(SessionContext);
}
