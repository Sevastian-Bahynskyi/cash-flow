import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing, typography } from '@/ui/tokens';
import { useCategories } from './useCategories';
import type { CategoryOption } from './types';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSelect: (option: CategoryOption) => void;
};

export function CategorySheet({ visible, onClose, onSelect }: Props): JSX.Element {
  const state = useCategories();
  const [query, setQuery] = useState('');

  const filtered = useMemo<CategoryOption[]>(() => {
    if (state.status !== 'ready') return [];
    const q = query.trim().toLowerCase();
    if (q.length === 0) return state.options;
    return state.options.filter((o) => o.searchKey.includes(q));
  }, [state, query]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Text style={styles.title}>Pick a category</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={styles.close}>Close</Text>
          </Pressable>
        </View>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search categories"
          placeholderTextColor={colors.textMuted}
          autoCorrect={false}
          autoCapitalize="none"
          style={styles.search}
        />
        {state.status === 'loading' && (
          <View style={styles.center}>
            <ActivityIndicator color={colors.accent} />
          </View>
        )}
        {state.status === 'error' && (
          <View style={styles.center}>
            <Text style={styles.error}>{state.message}</Text>
          </View>
        )}
        {state.status === 'ready' && (
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            ItemSeparatorComponent={() => <View style={styles.sep} />}
            renderItem={({ item }) => (
              <Pressable
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                onPress={() => {
                  onSelect(item);
                  onClose();
                }}
              >
                <Text style={styles.rowParent}>{item.parentName}</Text>
                <Text style={styles.rowName}>{item.name}</Text>
              </Pressable>
            )}
            ListEmptyComponent={
              <View style={styles.center}>
                <Text style={styles.muted}>No matches</Text>
              </View>
            }
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  title: { ...typography.h2, color: colors.text },
  close: { ...typography.body, color: colors.accent },
  search: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    color: colors.text,
    ...typography.body,
  },
  row: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  rowPressed: { backgroundColor: colors.surface },
  rowParent: { ...typography.label, color: colors.textMuted },
  rowName: { ...typography.body, color: colors.text, marginTop: 2 },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: spacing.lg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xl },
  muted: { ...typography.body, color: colors.textMuted },
  error: { ...typography.body, color: colors.danger },
});
