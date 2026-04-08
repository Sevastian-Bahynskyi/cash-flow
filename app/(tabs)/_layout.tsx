import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Tabs } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useComposer } from '@/features/transactions/ComposerContext';
import { colors, radius, spacing, typography } from '@/ui/tokens';

const iconForRoute = (name: string, focused: boolean): keyof typeof MaterialCommunityIcons.glyphMap => {
  switch (name) {
    case 'index':
      return focused ? 'home-variant' : 'home-variant-outline';
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

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Add transaction"
      onPress={() => composer.openCreate()}
      style={({ pressed }) => [
        styles.fab,
        { bottom: Math.max(insets.bottom, spacing.md) + 56 },
        pressed && styles.fabPressed,
      ]}
    >
      <MaterialCommunityIcons name="plus" size={30} color={colors.text} />
      <Text style={styles.fabLabel}>Add</Text>
    </Pressable>
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
  fab: {
    position: 'absolute',
    right: spacing.xl,
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
