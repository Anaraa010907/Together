import { Alert, type AlertButton } from 'react-native';
import i18n from './i18n';
import { blockUser, reportTarget, type ReportType } from './account';

const fail = (e: any) => Alert.alert(i18n.t('common.error'), String(e?.message ?? e));

// Report-ийн шалтгаан сонгох. Android-д Alert 3 товч хүртэл тул 2 шалтгаан + болих.
export function promptReport(type: ReportType, targetId: string) {
  const send = (reason: string) =>
    reportTarget(type, targetId, reason)
      .then(() => Alert.alert(i18n.t('report.sent')))
      .catch(fail);

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
          .catch(fail),
    },
    { text: i18n.t('common.cancel'), style: 'cancel' },
  ]);
}

// Пост / сэтгэгдэл дээр удаан дарахад: өөрийнх эсвэл group эзэн бол устгах, бусдынх бол мэдээлэх.
export function promptContentActions(opts: {
  type: 'post' | 'comment';
  id: string;
  isMine: boolean;
  canDelete: boolean;
  onDelete: () => Promise<void>;
}) {
  const buttons: AlertButton[] = [];
  if (opts.canDelete) {
    buttons.push({
      text: i18n.t('feed.delete'),
      style: 'destructive',
      onPress: () =>
        Alert.alert(i18n.t('feed.deleteTitle'), undefined, [
          { text: i18n.t('common.cancel'), style: 'cancel' },
          { text: i18n.t('feed.delete'), style: 'destructive', onPress: () => opts.onDelete().catch(fail) },
        ]),
    });
  }
  if (!opts.isMine) {
    buttons.push({ text: i18n.t('report.action'), onPress: () => promptReport(opts.type, opts.id) });
  }
  buttons.push({ text: i18n.t('common.cancel'), style: 'cancel' });
  Alert.alert(i18n.t('feed.actions'), undefined, buttons);
}
