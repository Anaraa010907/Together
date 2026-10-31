import '../lib/i18n';
import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SessionProvider, useSession } from '../lib/session';

// Нэвтрээгүй бол login, профайлгүй бол profile-setup руу чиглүүлнэ.
function AuthGate() {
  const { session, hasProfile, loading } = useSession();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const current = segments[0] as string | undefined;
    const isAuthScreen = current === 'login' || current === 'otp';
    const isSetup = current === 'profile-setup';

    if (!session) {
      if (!isAuthScreen && current !== 'index') router.replace('/login' as never);
      return;
    }
    if (!hasProfile) {
      if (!isSetup) router.replace('/profile-setup' as never);
      return;
    }
    if (isAuthScreen || isSetup) router.replace('/home' as never);
  }, [session, hasProfile, loading, segments, router]);

  return null;
}

export default function RootLayout() {
  return (
    <SessionProvider>
      <StatusBar style="dark" />
      <AuthGate />
      <Stack screenOptions={{ headerShown: false }} />
    </SessionProvider>
  );
}
