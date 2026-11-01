import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { lightTheme as t, radius, space } from '@together/ui/tokens';
import { useSession } from '../lib/session';
import { createProfile, isUsernameTaken, USERNAME_PATTERN } from '../lib/profile';
import { declareAge } from '../lib/teaching';

// Нэвтэрсний дараа нэг удаа: username + нэр + насны бүлэг (18+ эсэх). Төрсөн огноо хадгалахгүй.
export default function ProfileSetup() {
  const { t: tr, i18n } = useTranslation();
  const router = useRouter();
  const { refreshProfile } = useSession();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [adult, setAdult] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  const onSave = async () => {
    const u = username.trim().toLowerCase();
    const name = displayName.trim();
    if (!USERNAME_PATTERN.test(u)) return Alert.alert(tr('common.error'), tr('profile.usernameInvalid'));
    if (name.length < 1 || name.length > 40) return Alert.alert(tr('common.error'), tr('profile.nameInvalid'));
    if (adult === null) return Alert.alert(tr('common.error'), tr('age.required'));

    setBusy(true);
    try {
      if (await isUsernameTaken(u)) {
        Alert.alert(tr('common.error'), tr('profile.usernameTaken'));
        return;
      }
      await createProfile({
        username: u,
        displayName: name,
        locale: i18n.language === 'en' ? 'en' : 'mn',
      });
      await declareAge(adult);
      await refreshProfile();
      router.replace('/home' as never);
    } catch (e: any) {
      Alert.alert(tr('common.error'), String(e.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: t.background }]}>
      <Text style={[styles.title, { color: t.text }]}>{tr('profile.title')}</Text>
      <Text style={[styles.subtitle, { color: t.textMuted }]}>{tr('profile.subtitle')}</Text>

      <Text style={[styles.label, { color: t.textMuted }]}>{tr('profile.displayName')}</Text>
      <TextInput
        style={[styles.input, { borderColor: t.border, backgroundColor: t.surface, color: t.text }]}
        value={displayName}
        onChangeText={setDisplayName}
        maxLength={40}
        accessibilityLabel={tr('profile.displayName')}
      />

      <Text style={[styles.label, { color: t.textMuted }]}>{tr('profile.username')}</Text>
      <TextInput
        style={[styles.input, { borderColor: t.border, backgroundColor: t.surface, color: t.text }]}
        value={username}
        onChangeText={(v) => setUsername(v.toLowerCase())}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={20}
        placeholder="your_name"
        placeholderTextColor={t.textMuted}
        accessibilityLabel={tr('profile.username')}
      />
      <Text style={[styles.hint, { color: t.textMuted }]}>{tr('profile.usernameHint')}</Text>

      <Text style={[styles.label, { color: t.textMuted }]}>{tr('age.title')}</Text>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        {[true, false].map((v) => {
          const active = adult === v;
          return (
            <Pressable
              key={String(v)}
              onPress={() => setAdult(v)}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: t.border,
                borderRadius: radius.pill,
                paddingVertical: 12,
                alignItems: 'center',
                backgroundColor: active ? t.accent : t.surface,
              }}
            >
              <Text style={{ color: active ? t.onAccent : t.text, fontWeight: '600' }}>
                {v ? tr('age.adult') : tr('age.minor')}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={[styles.hint, { color: t.textMuted }]}>{tr('age.hint')}</Text>

      <Pressable
        style={[styles.primary, { backgroundColor: t.accent, opacity: busy ? 0.6 : 1 }]}
        disabled={busy}
        onPress={onSave}
        accessibilityRole="button"
      >
        {busy ? (
          <ActivityIndicator color={t.onAccent} />
        ) : (
          <Text style={[styles.primaryText, { color: t.onAccent }]}>{tr('profile.save')}</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: space.lg, gap: space.sm, justifyContent: 'center' },
  title: { fontSize: 28, fontWeight: '700' },
  subtitle: { fontSize: 15, lineHeight: 21, marginBottom: space.md },
  label: { fontSize: 13, marginTop: space.sm },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: 12, fontSize: 16 },
  hint: { fontSize: 12 },
  primary: { borderRadius: radius.pill, paddingVertical: 16, alignItems: 'center', marginTop: space.lg },
  primaryText: { fontSize: 16, fontWeight: '600' },
});
