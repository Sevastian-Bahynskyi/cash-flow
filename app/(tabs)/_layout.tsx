import { Pressable, StyleSheet, View } from 'react-native';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C } from '@/ui/kit/theme';
import { Icon, tap } from '@/ui/kit/ui';

type BottomTabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

// Four places on the phone, as in the PWA: budgets and analytics open from Cycle, the pot from People, settings pages from Settings.
const ICON: Record<string, string> = { index: 'cycle', activity: 'list', people: 'shared', settings: 'profile' };

/** The dock from the prototype: a floating black pill, the current place in a lighter pill. */
function Dock({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.dock, { bottom: Math.max(insets.bottom, 12) }]} accessibilityRole="tablist">
      {state.routes.map((route, i) => {
        const focused = state.index === i;
        const title = descriptors[route.key]?.options.title ?? route.name;
        return (
          <Pressable
            key={route.key}
            onPress={() => {
              tap();
              const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!focused && !e.defaultPrevented) navigation.navigate(route.name);
            }}
            style={[styles.item, focused && styles.on]}
            accessibilityRole="tab"
            accessibilityLabel={title}
            accessibilityState={{ selected: focused }}
          >
            <Icon name={ICON[route.name]} size={26} color={focused ? C.ink : C.ink3} strong={focused} />
          </Pressable>
        );
      })}
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs tabBar={(props) => <Dock {...props} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: C.bg } }}>
      <Tabs.Screen name="index" options={{ title: 'Cycle' }} />
      <Tabs.Screen name="activity" options={{ title: 'Activity' }} />
      <Tabs.Screen name="people" options={{ title: 'People' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  dock: { position: 'absolute', left: 24, right: 24, height: 64, borderRadius: 32, backgroundColor: '#0D0D0F', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.12)', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 8 },
  item: { width: 64, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  on: { backgroundColor: '#232327' },
});
