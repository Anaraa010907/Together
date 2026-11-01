import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// Тохиргоогүй build (жишээ нь туршилтын APK) унахгүй; _layout тохиргооны мэдэгдэл харуулна.
export const supabaseConfigured = !!url && !!anonKey;

// Anon key нь нийтэд харагдах боломжтой; өгөгдлийг RLS хамгаална.
// service_role key-г аппд хэзээ ч оруулахгүй.
export const supabase = createClient(url || 'https://not-configured.invalid', anonKey || 'not-configured', {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: supabaseConfigured,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
