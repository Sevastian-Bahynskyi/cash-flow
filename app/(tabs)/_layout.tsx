import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { Tabs, usePathname } from 'expo-router';
import { FontAwesome6 } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useComposer } from '@/features/transactions/composer/context/ComposerContext';
import { FloatingActionButton } from '@/ui/FloatingActionButton';
import { colors, radius, spacing, typography } from '@/ui/tokens';

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
  const { width } = useWindowDimensions();
  const leaf = pathname.split('/').filter(Boolean).pop() ?? '';
  const hidden = leaf === 'shared' || leaf === 'bank';
  const isWide = width >= 900;

  const bottom = isWide ? spacing.xl : Math.max(insets.bottom, spacing.md) + 56;

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
  const { width } = useWindowDimensions();
  const isWide = width >= 900;

  return (
    <View style={styles.container}>
      <Tabs
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarShowLabel: true,
          tabBarPosition: isWide ? 'left' : 'bottom',
          tabBarLabelPosition: isWide ? 'beside-icon' : 'below-icon',
          tabBarVariant: isWide ? 'material' : 'uikit',
          tabBarActiveTintColor: colors.text,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarActiveBackgroundColor: isWide ? colors.surfaceAlt : undefined,
          tabBarStyle: isWide ? styles.sideBar : styles.tabBar,
          tabBarItemStyle: isWide ? styles.sideBarItem : undefined,
          tabBarIconStyle: isWide ? styles.sideBarIcon : undefined,
          tabBarLabelStyle: [styles.tabLabel, isWide && styles.sideBarLabel],
          sceneStyle: isWide ? styles.wideScene : undefined,
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
  sideBar: {
    width: 216,
    height: '100%',
    paddingTop: spacing.xxl,
    paddingHorizontal: spacing.md,
    backgroundColor: 'rgba(11,11,15,0.98)',
    borderTopWidth: 0,
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  sideBarItem: {
    flexGrow: 0,
    height: 44,
    marginBottom: spacing.xs,
    borderRadius: radius.md,
  },
  sideBarIcon: { marginRight: spacing.sm },
  sideBarLabel: {
    marginTop: 0,
    fontSize: 13,
    fontWeight: '600',
  },
  wideScene: {
    width: '100%',
    maxWidth: 1440,
    alignSelf: 'center',
    borderRightWidth: 1,
    borderRightColor: 'rgba(42,42,54,0.56)',
  },
});
