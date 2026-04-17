import { StyleSheet, View } from 'react-native';
import { Tabs, usePathname } from 'expo-router';
import { FontAwesome6 } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useComposer } from '@/features/transactions/composer/context/ComposerContext';
import { FloatingActionButton } from '@/ui/FloatingActionButton';
import { colors, spacing, typography } from '@/ui/tokens';

const iconForRoute = (name: string, focused: boolean): keyof typeof FontAwesome6.glyphMap => {
  switch (name) {
    case 'index':
      return focused ? 'house' : 'house';
    case 'dashboard':
      return focused ? 'chart-pie' : 'chart-pie';
    case 'shared':
      return focused ? 'users' : 'users';
    case 'bank':
      return focused ? 'building-columns' : 'building-columns';
    default:
      return 'circle';
  }
};

function GlobalAddButton() {
  const composer = useComposer();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const leaf = pathname.split('/').filter(Boolean).pop() ?? '';
  const hidden = leaf === 'shared' || leaf === 'bank';

  const bottom = Math.max(insets.bottom, spacing.md) + 56;

  return (
    <FloatingActionButton
      icon="plus"
      label="Add"
      accessibilityLabel="Add transaction"
      onPress={() => composer.openCreate()}
      bottom={bottom}
      right={spacing.xl}
      backgroundColor={colors.accent}
      hidden={hidden}
    />
  );
}

export default function TabsLayout() {
  return (
    <View style={styles.container}>
      <Tabs
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarShowLabel: true,
          tabBarActiveTintColor: colors.text,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarStyle: styles.tabBar,
          tabBarLabelStyle: styles.tabLabel,
          tabBarIcon: ({ focused, color }) => (
            <FontAwesome6
              name={iconForRoute(route.name, focused)}
              size={22}
              color={color}
            />
          ),
        })}
      >
        <Tabs.Screen name="index" options={{ title: 'Home' }} />
        <Tabs.Screen name="dashboard" options={{ title: 'Dashboard' }} />
        <Tabs.Screen name="shared" options={{ title: 'Shared' }} />
        <Tabs.Screen name="bank" options={{ title: 'Bank' }} />
      </Tabs>
      <GlobalAddButton />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  tabBar: {
    position: 'absolute',
    height: 88,
    backgroundColor: 'rgba(11,11,15,0.96)',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  tabLabel: {
    ...typography.label,
    fontSize: 12,
    marginTop: 2,
  },
});
