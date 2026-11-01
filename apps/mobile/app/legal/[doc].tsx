import { Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { font, lightTheme as t } from '@together/ui/tokens';
import { Caption, H1, Screen } from '../../components/ui';

// Үйлчилгээний нөхцөл (terms) ба Нууцлалын бодлого (privacy). Хуульчаар хянуулсны дараа эцэслэнэ.
export default function Legal() {
  const { doc } = useLocalSearchParams<{ doc: 'terms' | 'privacy' }>();
  const key = doc === 'privacy' ? 'privacy' : 'terms';
  const { t: tr } = useTranslation();
  const sections = tr(`legal.${key}.sections`, { returnObjects: true }) as { h: string; p: string }[];

  return (
    <Screen>
      <H1>{tr(`legal.${key}.title`)}</H1>
      <Caption>{tr('legal.updated')}</Caption>
      {Array.isArray(sections) &&
        sections.map((s, i) => (
          <View key={i} style={{ gap: 6, marginTop: 6 }}>
            <Text style={{ fontFamily: font.bold, fontSize: 16, color: t.text }}>{s.h}</Text>
            <Text style={{ fontFamily: font.medium, fontSize: 15, lineHeight: 22, color: t.text }}>{s.p}</Text>
          </View>
        ))}
      <Caption>{tr('legal.contact')}</Caption>
    </Screen>
  );
}
