import { Alert } from 'react-native';
import i18n from './i18n';
import { blockUser, reportTarget } from './account';

// Report-ийн шалтгаан сонгох. Android-д Alert 3 товч хүртэл тул 2 шалтгаан + болих.
export function promptReport(type: 'profile' | 'group' | 'goal', targetId: string) {
  const send = (reason: string) =>
    reportTarget(type, targetId, reason)
      .then(() => Alert.alert(i18n.t('report.sent')))
      .catch((e) => Alert.alert(i18n.t('common.error'), String(e.message ?? e)));

  Alert.alert(i18n.t('report.title'), undefined, [
    { text: i18n.t('report.spam'), onPress: () => send('spam') },
    { text: i18n.t('report.inappropriate'), onPress: () => send('inappropriate') },
    { text: i18n.t('common.cancel'), style: 'cancel' },
  ]);
}

// Гишүүн дээр удаан дарахад: мэдээлэх эсвэл блоклох.
export function promptMemberActions(name: string, userId: string, onBlocked: () => void) {
  Alert.alert(name, undefined, [
    { text: i18n.t('report.action'), onPress: () => promptReport('profile', userId) },
    {
      text: i18n.t('report.block'),
      style: 'destructive',
      onPress: () =>
        blockUser(userId)
          .then(() => {
            Alert.alert(i18n.t('report.blocked'));
            onBlocked();
          })
          .catch((e) => Alert.alert(i18n.t('common.error'), String(e.message ?? e))),
    },
    { text: i18n.t('common.cancel'), style: 'cancel' },
  ]);
}
