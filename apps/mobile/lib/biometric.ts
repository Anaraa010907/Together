import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import i18n from './i18n';

// "Намайг сана" ба хурууны хээ / Face ID-аар нэвтрэх.
//
// Нэвтрэх мэдээллийг (имэйл + нууц үг) зөвхөн утасны хамгаалагдсан сан (Android Keystore /
// iOS Keychain)-д, хурууны хээгээр баталгаажсаны дараа л уншина. Энэ төхөөрөмжөөс гадагш гарахгүй,
// нөөцлөлтөд орохгүй (THIS_DEVICE_ONLY). AsyncStorage-д зөвхөн "идэвхтэй" гэсэн тэмдэг ба имэйл.

const REMEMBER_KEY = 'together:remember'; // '0' = намайг бүү сана
const LAST_EMAIL_KEY = 'together:lastEmail';
const BIO_FLAG_KEY = 'together:bio'; // утга = хурууны хээ холбосон имэйл
const BIO_ASKED_KEY = 'together:bioAsked'; // санал болгоод "Дараа" гэсэн
const BIO_SECRET_KEY = 'together.bio.credentials';

export async function getRemember(): Promise<boolean> {
  return (await AsyncStorage.getItem(REMEMBER_KEY).catch(() => null)) !== '0';
}

export async function setRemember(on: boolean, email?: string) {
  await AsyncStorage.setItem(REMEMBER_KEY, on ? '1' : '0');
  if (on && email) await AsyncStorage.setItem(LAST_EMAIL_KEY, email);
  if (!on) await AsyncStorage.removeItem(LAST_EMAIL_KEY);
}

export const getLastEmail = () => AsyncStorage.getItem(LAST_EMAIL_KEY).catch(() => null);

export type BiometricKind = 'fingerprint' | 'face' | 'iris';

// Төхөөрөмж хурууны хээ / царай таних боломжтой бөгөөд бүртгүүлсэн эсэх.
export async function biometricSupport(): Promise<BiometricKind | null> {
  if (Platform.OS === 'web') return null;
  try {
    const [hardware, enrolled] = await Promise.all([LocalAuthentication.hasHardwareAsync(), LocalAuthentication.isEnrolledAsync()]);
    if (!hardware || !enrolled) return null;
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) return 'fingerprint';
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) return 'face';
    if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) return 'iris';
    return 'fingerprint';
  } catch {
    return null;
  }
}

export async function authenticate(prompt: string): Promise<boolean> {
  try {
    const r = await LocalAuthentication.authenticateAsync({
      promptMessage: prompt,
      cancelLabel: i18n.t('common.cancel'),
      disableDeviceFallback: false,
    });
    return r.success;
  } catch {
    return false;
  }
}

// Хурууны хээ холбосон имэйл (холбоогүй бол null).
export async function biometricEmail(): Promise<string | null> {
  return AsyncStorage.getItem(BIO_FLAG_KEY).catch(() => null);
}

export async function enableBiometric(email: string, password: string) {
  await SecureStore.setItemAsync(BIO_SECRET_KEY, JSON.stringify({ email, password }), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  await AsyncStorage.setItem(BIO_FLAG_KEY, email);
}

export async function disableBiometric() {
  await SecureStore.deleteItemAsync(BIO_SECRET_KEY).catch(() => {});
  await AsyncStorage.removeItem(BIO_FLAG_KEY).catch(() => {});
}

// Хурууны хээгээр баталгаажуулж хадгалсан нэвтрэх мэдээллийг буцаана.
export async function unlockCredentials(prompt: string): Promise<{ email: string; password: string } | null> {
  if (!(await authenticate(prompt))) return null;
  const raw = await SecureStore.getItemAsync(BIO_SECRET_KEY).catch(() => null);
  if (!raw) {
    await disableBiometric();
    return null;
  }
  try {
    const v = JSON.parse(raw);
    return typeof v?.email === 'string' && typeof v?.password === 'string' ? v : null;
  } catch {
    return null;
  }
}

export async function wasBiometricOffered() {
  return (await AsyncStorage.getItem(BIO_ASKED_KEY).catch(() => null)) === '1';
}

export async function markBiometricOffered() {
  await AsyncStorage.setItem(BIO_ASKED_KEY, '1').catch(() => {});
}
