import i18n from './i18n';

// "одоо", "5 мин", "3 цаг", "2 өдөр", эсвэл огноо.
export function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return i18n.t('time.now');
  if (diff < 3600) return i18n.t('time.minutes', { n: Math.floor(diff / 60) });
  if (diff < 86400) return i18n.t('time.hours', { n: Math.floor(diff / 3600) });
  if (diff < 7 * 86400) return i18n.t('time.days', { n: Math.floor(diff / 86400) });
  return iso.slice(0, 10);
}
