import '../lib/i18n';
import { useEffect } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import {
  useFonts,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from '@expo-google-fonts/manrope';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { font, lightTheme as t } from '@together/ui/tokens';
import { SessionProvider, useSession } from '../lib/session';
import { supabaseConfigured } from '../lib/supabase';

// Сервер тохируулаагүй туршилтын build: дэлгэцүүд харагдана, нэвтрэх ажиллахгүй.
function ConfigBanner() {
  const { t: tr } = useTranslation();
  if (supabaseConfigured) return null;
  return (
    <View style={{ backgroundColor: t.warning, paddingTop: 44, paddingBottom: 8, paddingHorizontal: 16 }}>
      <Text style={{ color: t.onAccent, fontFamily: font.semibold, textAlign: 'center' }}>{tr('common.notConfigured')}</Text>
    </View>
  );
}

// Нэвтрээгүй бол login, профайлгүй бол profile-setup руу чиглүүлнэ.
function AuthGate() {
  const { session, hasProfile, loading } = useSession();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const current = segments[0] as string | undefined;
    const isAuthScreen = ['login', 'register', 'phone', 'otp'].includes(current ?? '');
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

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, fontError]);

  // Фонт ачаалагдах хүртэл splash харагдана (алдаа гарвал системийн фонтоор үргэлжилнэ).
  if (!fontsLoaded && !fontError) return null;

  return (
    <SessionProvider>
      <StatusBar style="dark" />
      <ConfigBanner />
      <AuthGate />
      <Stack
        screenOptions={{
          headerShown: false,
          headerTintColor: t.text,
          headerStyle: { backgroundColor: t.background },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: t.background },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="register" options={{ headerShown: true, title: '', headerBackTitle: '', headerTransparent: true }} />
        <Stack.Screen name="login" options={{ headerShown: true, title: '', headerBackTitle: '', headerTransparent: true }} />
        <Stack.Screen name="phone" options={{ headerShown: true, title: '', headerBackTitle: '', headerTransparent: true }} />
        <Stack.Screen name="otp" options={{ headerShown: true, title: '', headerBackTitle: '', headerTransparent: true }} />
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
