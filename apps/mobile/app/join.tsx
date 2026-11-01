import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { lightTheme as t, radius, space } from '@together/ui/tokens';
import { redeemInvite } from '../lib/groups';

// Урилгын кодоор group-д нэгдэх (private / invite_only group-д ч ажиллана).
export default function Join() {
  const { t: tr } = useTranslation();
  const router = useRouter();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const onJoin = async () => {
    const c = code.trim().toUpperCase();
    if (!/^[0-9A-F]{8}$/.test(c)) return Alert.alert(tr('common.error'), tr('join.invalid'));
    setBusy(true);
    try {
      const groupId = await redeemInvite(c);
      router.replace(`/group/${groupId}` as never);
    } catch (e: any) {
      const msg = String(e.message ?? e);
      const key = msg.includes('invite_expired')
        ? 'join.expired'
        : msg.includes('invite_exhausted')
          ? 'join.exhausted'
          : msg.includes('banned')
            ? 'groups.banned'
            : msg.includes('invalid_code')
              ? 'join.invalid'
              : null;
      Alert.alert(tr('common.error'), key ? tr(key) : msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: t.background }]}>
      <Text style={[styles.title, { color: t.text }]}>{tr('join.title')}</Text>
      <TextInput
        style={[styles.input, { borderColor: t.border, backgroundColor: t.surface, color: t.text }]}
        value={code}
        onChangeText={(v) => setCode(v.toUpperCase())}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={8}
        placeholder="AB12CD34"
        placeholderTextColor={t.textMuted}
        accessibilityLabel={tr('join.title')}
      />
      <Pressable
        style={[styles.primary, { backgroundColor: t.accent, opacity: busy ? 0.6 : 1 }]}
        onPress={onJoin}
        disabled={busy}
        accessibilityRole="button"
      >
        {busy ? (
          <ActivityIndicator color={t.onAccent} />
        ) : (
          <Text style={[styles.primaryText, { color: t.onAccent }]}>{tr('join.action')}</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: space.lg, gap: space.md, paddingTop: space.xl },
  title: { fontSize: 24, fontWeight: '700' },
  input: {
    borderWidth: 1, borderRadius: radius.md, paddingVertical: 14,
    fontSize: 24, textAlign: 'center', letterSpacing: 6,
  },
  primary: { borderRadius: radius.pill, paddingVertical: 16, alignItems: 'center' },
  primaryText: { fontSize: 16, fontWeight: '600' },
});
