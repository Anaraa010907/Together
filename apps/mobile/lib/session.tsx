import { Alert } from 'react-native';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import type { Session } from '@supabase/supabase-js';
import i18n from './i18n';
import { supabase } from './supabase';
import { getRemember } from './biometric';

type SessionState = {
  session: Session | null;
  hasProfile: boolean;
  needsInterests: boolean;
  loading: boolean;
  refreshProfile: (userId?: string) => Promise<void>;
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
  const hadSession = useRef(false);

  // Профайл байгаа эсэхийг RLS-ээр шалгана (өөрийн мөр л харагдана).
  // userId өгөхгүй бол локал session-оос авна (сүлжээгээр getUser дуудахгүй).
  const refreshProfile = useCallback(async (userId?: string) => {
    const uid = userId ?? (await supabase.auth.getSession()).data.session?.user.id;
    if (!uid) {
      setHasProfile(false);
      setNeedsInterests(false);
      return;
    }
    let { data, error } = await supabase
      .from('profiles')
      .select('id, locale, interests_set_at, banned_at')
      .eq('id', uid)
      .maybeSingle();
    // Сервер 0012-гүй (interests_set_at багана байхгүй) бол сонирхлын алхмыг алгасна.
    if (error?.code === '42703') {
      const fallback = await supabase.from('profiles').select('id, locale').eq('id', uid).maybeSingle();
      data = fallback.data ? { ...fallback.data, interests_set_at: 'n/a', banned_at: null } : null;
      error = fallback.error;
    }
    // Сүлжээний алдаа: өмнөх төлөвийг хэвээр үлдээнэ (хэрэглэгчийг профайл үүсгэх рүү шилжүүлэхгүй).
    if (error && !data) return;
    // Админ хориглосон бол гаргана.
    if (data?.banned_at) {
      Alert.alert(i18n.t('admin.bannedTitle'), i18n.t('admin.bannedBody'));
      await supabase.auth.signOut().catch(() => {});
      setHasProfile(false);
      setNeedsInterests(false);
      return;
    }
    setHasProfile(!!data);
    // Onboarding-ийн сонирхлын алхмыг (алгассан ч) нэг удаа дуусгасан эсэх.
    setNeedsInterests(!!data && !data.interests_set_at);
    // Профайлд хадгалсан хэлийг ачаална.
    if (data?.locale && data.locale !== i18n.language) {
      await i18n.changeLanguage(data.locale);
    }
  }, []);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        let { data } = await supabase.auth.getSession();
        // "Намайг сана" унтраалттай нэвтэрсэн бол апп дахин нээгдэхэд гаргана.
        if (data.session && !(await getRemember())) {
          await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
          data = { session: null };
        }
        if (!active) return;
        hadSession.current = !!data.session;
        setSession(data.session);
        if (data.session) await refreshProfile(data.session.user.id);
      } catch {
        // сүлжээгүй гэх мэт — нэвтрэх дэлгэц рүү унахгүй, дараагийн event-ийг хүлээнэ
      } finally {
        if (active) setLoading(false);
      }
    })();

    // АНХААР: энэ callback-ийг supabase өөрийн auth lock дотроос дуудаж, дуусахыг нь хүлээдэг.
    // Дотор нь supabase-ийн өөр функцийг await хийвэл түгжигдэж, "Нэвтрэх" товч дуусахгүй
    // уншсаар байдаг. Тиймээс энд синхрон байлгаж, профайлын хүсэлтийг setTimeout-оор хойшлуулна.
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      if (!active || event === 'INITIAL_SESSION') return;
      setSession(next);
      if (!next) {
        hadSession.current = false;
        setHasProfile(false);
        setNeedsInterests(false);
        return;
      }
      if (event === 'TOKEN_REFRESHED') return;
      // Шинээр нэвтэрсэн: профайл ачаалагдах хүртэл чиглүүлэлтийг түр зогсооно (profile-setup руу анивчихгүй).
      const fresh = !hadSession.current;
      hadSession.current = true;
      if (fresh) setLoading(true);
      setTimeout(() => {
        refreshProfile(next.user.id)
          .catch(() => {})
          .finally(() => {
            if (active && fresh) setLoading(false);
          });
      }, 0);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [refreshProfile]);

  return (
    <SessionContext.Provider value={{ session, hasProfile, needsInterests, loading, refreshProfile }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  return useContext(SessionContext);
}
