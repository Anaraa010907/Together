import * as AppleAuthentication from 'expo-apple-authentication';
import { supabase } from './supabase';

// Google-ийн id_token-г expo-auth-session-ээс авч Supabase руу дамжуулна (login.tsx).
export async function signInWithGoogle(idToken: string) {
  const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken });
  if (error) throw error;
}

// Apple: зөвхөн iOS. Нэр, имэйлийг эхний нэвтрэлтэд л өгдөг.
export async function signInWithApple() {
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });
  if (!credential.identityToken) throw new Error('Apple identity token авсангүй.');

  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
  });
  if (error) throw error;
}

// Утас: +976 + 8 оронтой дугаар. Supabase SMS provider тохируулсан байх ёстой.
export function toMongolianE164(local: string) {
  return `+976${local.replace(/\D/g, '')}`;
}

export function isValidMongolianMobile(local: string) {
  return /^[5-9]\d{7}$/.test(local.replace(/\D/g, ''));
}

export async function sendPhoneOtp(phone: string) {
  const { error } = await supabase.auth.signInWithOtp({ phone });
  if (error) throw error;
}

export async function verifyPhoneOtp(phone: string, token: string) {
  const { error } = await supabase.auth.verifyOtp({ phone, token, type: 'sms' });
  if (error) throw error;
}

// Туршилтын build-д л ашиглана (EXPO_PUBLIC_ENABLE_EMAIL_LOGIN=1).
export async function signInWithEmail(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

// Буцаах: имэйлээ баталгаажуулах шаардлагатай эсэх.
export async function signUpWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return !data.session;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
