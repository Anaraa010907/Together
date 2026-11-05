import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { lightTheme as t } from '@together/ui/tokens';
import { FloatingTabBar } from '../../components/TabBar';

// Доод таб: Нүүр · Групп · (+) · Мэдэгдэл · Профайл.
export default function TabsLayout() {
  const { t: tr } = useTranslation();
  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: t.background } }}
    >
      <Tabs.Screen name="home" options={{ title: tr('tabs.home') }} />
      <Tabs.Screen name="groups" options={{ title: tr('tabs.groups') }} />
      <Tabs.Screen name="notifications" options={{ title: tr('tabs.notifications') }} />
      <Tabs.Screen name="profile" options={{ title: tr('tabs.profile') }} />
    </Tabs>
  );
}
