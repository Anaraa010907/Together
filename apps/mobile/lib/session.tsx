import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

type SessionState = {
  session: Session | null;
  hasProfile: boolean;
  loading: boolean;
  refreshProfile: () => Promise<void>;
};

const SessionContext = createContext<SessionState>({
  session: null,
  hasProfile: false,
  loading: true,
  refreshProfile: async () => {},
});

export function SessionProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [hasProfile, setHasProfile] = useState(false);
  const [loading, setLoading] = useState(true);

  // Профайл байгаа эсэхийг RLS-ээр шалгана (өөрийн мөр л харагдана).
  const refreshProfile = async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      setHasProfile(false);
      return;
    }
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', userData.user.id)
      .maybeSingle();
    setHasProfile(!error && !!data);
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
    <SessionContext.Provider value={{ session, hasProfile, loading, refreshProfile }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  return useContext(SessionContext);
}
