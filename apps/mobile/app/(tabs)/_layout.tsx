import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { font, lightTheme as t } from '@together/ui/tokens';

// Доод таб: Өнөөдөр (зорилго) · Группууд · Профайл
export default function TabsLayout() {
  const { t: tr } = useTranslation();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.text,
        tabBarInactiveTintColor: t.textMuted,
        tabBarStyle: { backgroundColor: t.surface, borderTopColor: '#EFEAE0', height: 64, paddingTop: 6, paddingBottom: 8 },
        tabBarLabelStyle: { fontFamily: font.semibold, fontSize: 12 },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: tr('tabs.home'),
          tabBarIcon: ({ color, size }) => <Ionicons name="sunny-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="groups"
        options={{
          title: tr('tabs.groups'),
          tabBarIcon: ({ color, size }) => <Ionicons name="people-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: tr('tabs.profile'),
          tabBarIcon: ({ color, size }) => <Ionicons name="person-circle-outline" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
