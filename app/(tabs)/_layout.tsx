import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Tabs, usePathname } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useComposer } from '@/features/transactions/composer/context/ComposerContext';
import { colors, radius, spacing, typography } from '@/ui/tokens';

const FAB_HIDE_TRANSLATE = 110;
const FAB_TOGGLE_MS = 300;

const iconForRoute = (name: string, focused: boolean): keyof typeof MaterialCommunityIcons.glyphMap => {
  switch (name) {
    case 'index':
      return focused ? 'home-variant' : 'home-variant-outline';
    case 'dashboard':
      return focused ? 'chart-donut' : 'chart-donut-variant';
    case 'shared':
      return focused ? 'account-group' : 'account-group-outline';
    case 'bank':
      return focused ? 'bank' : 'bank-outline';
    default:
      return 'circle-outline';
  }
};

function GlobalAddButton() {
  const composer = useComposer();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const leaf = pathname.split('/').filter(Boolean).pop() ?? '';
  const hidden = leaf === 'shared' || leaf === 'bank';

  const visibility = useSharedValue(hidden ? 1 : 0);

  useEffect(() => {
    visibility.value = withTiming(hidden ? 1 : 0, {
      duration: FAB_TOGGLE_MS,
      easing: Easing.out(Easing.cubic),
    });
  }, [hidden, visibility]);

  const fabMotion = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(visibility.value, [0, 1], [0, FAB_HIDE_TRANSLATE]) },
    ],
    opacity: interpolate(visibility.value, [0, 1], [1, 0]),
  }));

  const bottom = Math.max(insets.bottom, spacing.md) + 56;

  return (
    <Animated.View
      style={[styles.fabOuter, { bottom, right: spacing.xl }, fabMotion]}
      pointerEvents={hidden ? 'none' : 'box-none'}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add transaction"
        onPress={() => composer.openCreate()}
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
      >
        <MaterialCommunityIcons name="plus" size={30} color={colors.text} />
        <Text style={styles.fabLabel}>Add</Text>
      </Pressable>
    </Animated.View>
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
            <MaterialCommunityIcons
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
  fabOuter: {
    position: 'absolute',
    width: 72,
    height: 72,
  },
  fab: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.34,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 14,
  },
  fabPressed: { opacity: 0.86, transform: [{ scale: 0.98 }] },
  fabLabel: {
    ...typography.label,
    color: colors.text,
    marginTop: 2,
  },
});
