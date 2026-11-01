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
    // Нэвтэрсэн + профайлтай: Welcome / auth дэлгэц дээр үлдэхгүй.
    if (isAuthScreen || isSetup || current === undefined || current === 'index') {
      router.replace('/home' as never);
    }
  }, [session, hasProfile, loading, segments, router]);

  return null;
}

export default function RootLayout() {
  return (
    <SessionProvider>
      <StatusBar style="dark" />
      <AuthGate />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        {/* Дэд дэлгэцүүдэд буцах товчтой header */}
        <Stack.Screen name="group/[id]" options={{ headerShown: true, title: '', headerBackTitle: '' }} />
        <Stack.Screen name="group/new" options={{ headerShown: true, title: '', headerBackTitle: '' }} />
        <Stack.Screen name="join" options={{ headerShown: true, title: '', headerBackTitle: '' }} />
        <Stack.Screen name="challenge/[id]" options={{ headerShown: true, title: '', headerBackTitle: '' }} />
        <Stack.Screen name="challenge/new" options={{ headerShown: true, title: '', headerBackTitle: '' }} />
        <Stack.Screen name="feed/[groupId]" options={{ headerShown: true, title: 'Feed', headerBackTitle: '' }} />
        <Stack.Screen name="post/new" options={{ headerShown: true, title: '', headerBackTitle: '' }} />
        <Stack.Screen name="post/[id]" options={{ headerShown: true, title: '', headerBackTitle: '' }} />
        <Stack.Screen name="session/new" options={{ headerShown: true, title: '', headerBackTitle: '' }} />
        <Stack.Screen name="session/[id]" options={{ headerShown: true, title: '', headerBackTitle: '' }} />
        <Stack.Screen name="teach/edit" options={{ headerShown: true, title: '', headerBackTitle: '' }} />
        <Stack.Screen name="teachers" options={{ headerShown: true, title: '', headerBackTitle: '' }} />
        <Stack.Screen name="teacher/[id]" options={{ headerShown: true, title: '', headerBackTitle: '' }} />
        <Stack.Screen name="lesson/new" options={{ headerShown: true, title: '', headerBackTitle: '' }} />
        <Stack.Screen name="lesson/[id]" options={{ headerShown: true, title: '', headerBackTitle: '' }} />
        <Stack.Screen name="review/[groupId]" options={{ headerShown: true, title: '', headerBackTitle: '' }} />
      </Stack>
    </SessionProvider>
  );
}
