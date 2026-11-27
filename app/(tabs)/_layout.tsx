import { StyleSheet } from 'react-native';
import { Tabs } from 'expo-router';
import { C, F } from '@/ui/kit/theme';
import { Icon } from '@/ui/kit/ui';

// Four places on the phone, as in the PWA: budgets and analytics open from Cycle, the pot from People, settings pages from Settings.
const ICON: Record<string, string> = { index: 'cycle', activity: 'list', people: 'shared', settings: 'profile' };

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: C.ink,
        tabBarInactiveTintColor: C.ink3,
        tabBarStyle: styles.bar,
        tabBarLabelStyle: styles.label,
        sceneStyle: { backgroundColor: C.bg },
        tabBarIcon: ({ focused, color }) => <Icon name={ICON[route.name]} size={26} color={color} weight={focused ? 'fill' : 'duotone'} />,
      })}
    >
      <Tabs.Screen name="index" options={{ title: 'Cycle' }} />
      <Tabs.Screen name="activity" options={{ title: 'Activity' }} />
      <Tabs.Screen name="people" options={{ title: 'People' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', height: 88, backgroundColor: C.bg, borderTopWidth: 0, paddingTop: 8 },
  label: { fontFamily: F.strong, fontSize: 11 },
});
