import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing, typography } from '@/ui/tokens';
import AddTransactionModal from '@/features/transactions/AddTransactionModal';
import Overview from '@/features/overview/Overview';

export default function HomeScreen() {
  const [open, setOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Cash Flow</Text>
        <Overview refreshKey={refreshKey} />
      </ScrollView>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add transaction"
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
      >
        <Text style={styles.fabText}>+</Text>
      </Pressable>
      <AddTransactionModal
        visible={open}
        onClose={() => setOpen(false)}
        onSaved={() => setRefreshKey((k) => k + 1)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingTop: spacing.xl, paddingBottom: spacing.xxl * 3, gap: spacing.lg },
  title: {
    ...typography.h1,
    color: colors.text,
    paddingHorizontal: spacing.lg,
  },
  fab: {
    position: 'absolute',
    right: spacing.xl,
    bottom: spacing.xl,
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  fabPressed: { opacity: 0.85 },
  fabText: { color: colors.text, fontSize: 32, lineHeight: 34, fontWeight: '600' },
});
