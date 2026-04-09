import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ScreenHeader } from '@/ui/ScreenHeader';
import { CategorySheet } from '@/features/categories/CategorySheet';
import { NumericKeypad } from '@/ui/NumericKeypad';
import { colors, radius, spacing, typography } from '@/ui/tokens';
import type { CategoryOption } from '@/features/categories/types';
import { currencyOptions } from '@/lib/currency';
import { resolveSuggestedCategory } from './suggestions';
import type { ImportedTransactionDraft } from './imageImport';
import type { TransactionKind } from './types';

type BudgetIndicator = {
  tone: 'neutral' | 'warning' | 'critical';
  label: string;
};

type Props = {
  visible: boolean;
  rows: ImportedTransactionDraft[];
  saving: boolean;
  errorMessage: string | null;
  categoriesById: Record<string, CategoryOption>;
  categoryOptions: CategoryOption[];
  frequentIds?: readonly string[];
  recentIds?: readonly string[];
  budgetStateByCategory?: Record<string, BudgetIndicator>;
  onClose: () => void;
  onSave: () => void;
  onChangeRow: (id: string, patch: Partial<ImportedTransactionDraft>) => void;
  onRemoveRow: (id: string) => void;
};

const kindOptions: readonly TransactionKind[] = ['expense', 'income'];

const parseIsoDate = (iso: string): Date => {
  const [year = 1970, month = 1, day = 1] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const toIsoDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatAmountDisplay = (raw: string): string => {
  if (raw.length === 0) return '0.00';
  const normalized = raw.trim().replace(',', '.');
  const value = Number(normalized);
  if (!Number.isFinite(value)) return raw;
  return value.toFixed(2);
};

export function ImageImportPreviewModal({
  visible,
  rows,
  saving,
  errorMessage,
  categoriesById,
  categoryOptions,
  frequentIds,
  recentIds,
  budgetStateByCategory,
  onClose,
  onSave,
  onChangeRow,
  onRemoveRow,
}: Props) {
  const [categoryPickerRowId, setCategoryPickerRowId] = useState<string | null>(null);
  const [datePickerRowId, setDatePickerRowId] = useState<string | null>(null);
  const [amountPickerRowId, setAmountPickerRowId] = useState<string | null>(null);
  const rowsRef = useRef(rows);
  const suggestionAttemptByRow = useRef(new Map<string, string>());
  const canSave = rows.length > 0 && !saving;
  const categoryCandidates = useMemo(
    () =>
      categoryOptions.map((option) => ({
        id: option.id,
        parent: option.parentName,
        name: option.name,
      })),
    [categoryOptions],
  );
  const activeDateRow = datePickerRowId ? rows.find((row) => row.id === datePickerRowId) ?? null : null;
  const activeDateValue = activeDateRow ? parseIsoDate(activeDateRow.occurredOn) : new Date();

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  useEffect(() => {
    if (amountPickerRowId && !rows.some((row) => row.id === amountPickerRowId)) {
      setAmountPickerRowId(null);
    }
    if (categoryPickerRowId && !rows.some((row) => row.id === categoryPickerRowId)) {
      setCategoryPickerRowId(null);
    }
    if (datePickerRowId && !rows.some((row) => row.id === datePickerRowId)) {
      setDatePickerRowId(null);
    }
  }, [amountPickerRowId, categoryPickerRowId, datePickerRowId, rows]);

  useEffect(() => {
    const subscription = Keyboard.addListener('keyboardDidShow', () => {
      setAmountPickerRowId(null);
    });

    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!visible) {
      setAmountPickerRowId(null);
      setCategoryPickerRowId(null);
      setDatePickerRowId(null);
      suggestionAttemptByRow.current.clear();
      return;
    }

    rows.forEach((row) => {
      if (row.kind !== 'expense' || row.categoryId) return;

      const trimmedName = row.name.trim();
      const trimmedComment = row.comment.trim();
      const lookupText = trimmedName.length >= 2 ? trimmedName : trimmedComment;
      if (lookupText.length < 2) return;

      const attemptKey = `${row.kind}:${trimmedName.toLowerCase()}|${trimmedComment.toLowerCase()}`;
      if (suggestionAttemptByRow.current.get(row.id) === attemptKey) return;
      suggestionAttemptByRow.current.set(row.id, attemptKey);

      void (async () => {
        const result = await resolveSuggestedCategory(
          lookupText,
          trimmedComment.length > 0 ? trimmedComment : null,
          categoryCandidates,
        );
        if (!result) return;

        const currentRow = rowsRef.current.find((candidate) => candidate.id === row.id);
        if (!currentRow || currentRow.kind !== 'expense' || currentRow.categoryId) return;

        const currentName = currentRow.name.trim();
        const currentComment = currentRow.comment.trim();
        const currentLookupText = currentName.length >= 2 ? currentName : currentComment;
        const currentAttemptKey = `${currentRow.kind}:${currentName.toLowerCase()}|${currentComment.toLowerCase()}`;
        if (currentLookupText.length < 2 || currentAttemptKey !== attemptKey) return;

        onChangeRow(row.id, { categoryId: result.categoryId });
      })();
    });
  }, [categoryCandidates, onChangeRow, rows, visible]);

  const handleDateChange = (event: DateTimePickerEvent, selected?: Date): void => {
    if (!datePickerRowId) return;

    if (Platform.OS === 'android') {
      if (selected) onChangeRow(datePickerRowId, { occurredOn: toIsoDate(selected) });
      setDatePickerRowId(null);
      return;
    }

    if (event.type === 'dismissed') {
      setDatePickerRowId(null);
      return;
    }

    if (selected) onChangeRow(datePickerRowId, { occurredOn: toIsoDate(selected) });
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <ScreenHeader
          back
          onBack={onClose}
          title="Review import"
          subtitle={`${rows.length} ${rows.length === 1 ? 'transaction' : 'transactions'}`}
          actions={[{ icon: 'check', onPress: onSave, disabled: !canSave }]}
        />

        <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

          {rows.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="image-off-outline" size={28} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>No transactions left</Text>
              <Text style={styles.emptyText}>Close this review and pick another image when you want to try again.</Text>
            </View>
          ) : null}

          {rows.map((row, index) => {
            const category = row.categoryId ? categoriesById[row.categoryId] : null;
            const categoryLabel = category
              ? `${category.parentName} · ${category.name}`
              : row.kind === 'expense'
                ? 'Pick a category'
                : 'No category needed';

            return (
              <View key={row.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>Transaction {index + 1}</Text>
                  <Pressable onPress={() => onRemoveRow(row.id)} hitSlop={12}>
                    <MaterialCommunityIcons name="close" size={18} color={colors.textMuted} />
                  </Pressable>
                </View>

                <View style={styles.kindRow}>
                  {kindOptions.map((option) => {
                    const active = row.kind === option;
                    return (
                      <Pressable
                        key={option}
                        style={({ pressed }) => [
                          styles.kindChip,
                          active && styles.kindChipActive,
                          pressed && styles.rowPressed,
                        ]}
                        onPress={() =>
                          onChangeRow(row.id, {
                            kind: option,
                            categoryId: option === 'income' ? null : row.categoryId,
                          })
                        }
                      >
                        <Text style={[styles.kindChipText, active && styles.kindChipTextActive]}>
                          {option === 'expense' ? 'Expense' : 'Income'}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Text style={styles.label}>Name</Text>
                <TextInput
                  value={row.name}
                  onChangeText={(value) => onChangeRow(row.id, { name: value })}
                  onFocus={() => setAmountPickerRowId(null)}
                  placeholder="Transaction name"
                  placeholderTextColor={colors.textMuted}
                  style={styles.input}
                />

                <View style={styles.inlineRow}>
                  <View style={styles.inlineField}>
                    <Text style={styles.label}>Amount</Text>
                    <Pressable
                      style={({ pressed }) => [styles.categoryButton, pressed && styles.rowPressed]}
                      onPress={() => {
                        Keyboard.dismiss();
                        setCategoryPickerRowId(null);
                        setDatePickerRowId(null);
                        setAmountPickerRowId((current) => (current === row.id ? null : row.id));
                      }}
                    >
                      <Text style={styles.categoryText}>{formatAmountDisplay(row.amount)}</Text>
                      <MaterialCommunityIcons name="keyboard-outline" size={18} color={colors.textMuted} />
                    </Pressable>
                  </View>
                </View>

                {amountPickerRowId === row.id ? (
                  <View style={styles.inlineKeypadWrap}>
                    <NumericKeypad
                      value={row.amount}
                      onChange={(value) => onChangeRow(row.id, { amount: value })}
                    />
                  </View>
                ) : null}

                <Text style={styles.label}>Currency</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.currencyRow}
                >
                  {currencyOptions.map((currency) => {
                    const active = row.currencyCode === currency.code;
                    return (
                      <Pressable
                        key={`${row.id}-${currency.code}`}
                        style={({ pressed }) => [
                          styles.currencyChip,
                          active && styles.currencyChipActive,
                          pressed && styles.rowPressed,
                        ]}
                        onPress={() => onChangeRow(row.id, { currencyCode: currency.code })}
                      >
                        <Text style={[styles.currencyChipText, active && styles.currencyChipTextActive]}>
                          {currency.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                <Text style={styles.label}>Date</Text>
                <Pressable
                  style={({ pressed }) => [styles.categoryButton, pressed && styles.rowPressed]}
                  onPress={() => {
                    setAmountPickerRowId(null);
                    setCategoryPickerRowId(null);
                    setDatePickerRowId(row.id);
                  }}
                >
                  <Text style={styles.categoryText}>{row.occurredOn}</Text>
                  <MaterialCommunityIcons name="calendar-month-outline" size={18} color={colors.textMuted} />
                </Pressable>

                {row.kind === 'expense' ? (
                  <>
                    <Text style={styles.label}>Category</Text>
                    <Pressable
                      style={({ pressed }) => [styles.categoryButton, pressed && styles.rowPressed]}
                      onPress={() => {
                        setAmountPickerRowId(null);
                        setDatePickerRowId(null);
                        setCategoryPickerRowId(row.id);
                      }}
                    >
                      <Text style={[styles.categoryText, !category && styles.placeholder]}>{categoryLabel}</Text>
                      <MaterialCommunityIcons name="chevron-right" size={18} color={colors.textMuted} />
                    </Pressable>
                  </>
                ) : null}

                <Text style={styles.label}>Note</Text>
                <TextInput
                  value={row.comment}
                  onChangeText={(value) => onChangeRow(row.id, { comment: value })}
                  onFocus={() => setAmountPickerRowId(null)}
                  placeholder="Optional"
                  placeholderTextColor={colors.textMuted}
                  style={[styles.input, styles.noteInput]}
                  multiline
                />
              </View>
            );
          })}

          <Pressable
            style={({ pressed }) => [
              styles.saveButton,
              (!canSave || pressed) && styles.rowPressed,
              !canSave && styles.saveButtonDisabled,
            ]}
            onPress={onSave}
            disabled={!canSave}
          >
            <Text style={styles.saveButtonText}>
              {saving ? 'Saving...' : rows.length === 0 ? 'Nothing to save' : `Save ${rows.length} transactions`}
            </Text>
          </Pressable>
        </ScrollView>

        <CategorySheet
          visible={categoryPickerRowId !== null}
          onClose={() => setCategoryPickerRowId(null)}
          onSelect={(option) => {
            if (!categoryPickerRowId) return;
            onChangeRow(categoryPickerRowId, { categoryId: option.id });
            setCategoryPickerRowId(null);
          }}
          frequentIds={frequentIds}
          recentIds={recentIds}
          selectedId={categoryPickerRowId ? rows.find((row) => row.id === categoryPickerRowId)?.categoryId ?? null : null}
          budgetStateByCategory={budgetStateByCategory}
        />

        {datePickerRowId && Platform.OS === 'android' ? (
          <DateTimePicker value={activeDateValue} mode="date" display="default" onChange={handleDateChange} />
        ) : null}

        {datePickerRowId && Platform.OS === 'ios' ? (
          <Modal transparent animationType="fade" onRequestClose={() => setDatePickerRowId(null)}>
            <View style={styles.pickerOverlay}>
              <Pressable style={styles.pickerBackdrop} onPress={() => setDatePickerRowId(null)} />
              <SafeAreaView style={styles.pickerCard} edges={['bottom']}>
                <View style={styles.pickerHeader}>
                  <Text style={styles.pickerTitle}>Pick a date</Text>
                  <Pressable onPress={() => setDatePickerRowId(null)} hitSlop={12}>
                    <Text style={styles.pickerDone}>Done</Text>
                  </Pressable>
                </View>
                <DateTimePicker
                  value={activeDateValue}
                  mode="date"
                  display="spinner"
                  themeVariant="dark"
                  onChange={handleDateChange}
                />
              </SafeAreaView>
            </View>
          </Modal>
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl * 2, gap: spacing.md },
  error: { ...typography.body, color: colors.danger },
  emptyState: {
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  emptyTitle: { ...typography.body, color: colors.text, fontWeight: '700' },
  emptyText: { ...typography.label, color: colors.textMuted, textAlign: 'center' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  cardTitle: { ...typography.body, color: colors.text, fontWeight: '700' },
  kindRow: { flexDirection: 'row', gap: spacing.sm },
  kindChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
  },
  kindChipActive: { backgroundColor: colors.accent },
  kindChipText: { ...typography.label, color: colors.textMuted },
  kindChipTextActive: { color: colors.text },
  label: {
    ...typography.label,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    borderRadius: radius.md,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.text,
    ...typography.body,
  },
  noteInput: { minHeight: 76, textAlignVertical: 'top' },
  inlineRow: { flexDirection: 'row', gap: spacing.sm },
  inlineField: { flex: 1, gap: spacing.xs },
  inlineKeypadWrap: {
    marginTop: spacing.xs,
    overflow: 'hidden',
    borderRadius: radius.lg,
  },
  currencyRow: { gap: spacing.sm, paddingVertical: spacing.xs },
  currencyChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  currencyChipActive: {
    backgroundColor: 'rgba(124,92,255,0.18)',
    borderColor: colors.accent,
  },
  currencyChipText: { ...typography.label, color: colors.textMuted },
  currencyChipTextActive: { color: colors.text },
  categoryButton: {
    borderRadius: radius.md,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  categoryText: { ...typography.body, color: colors.text, flex: 1 },
  placeholder: { color: colors.textMuted },
  saveButton: {
    marginTop: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  saveButtonDisabled: { opacity: 0.55 },
  saveButtonText: { ...typography.body, color: colors.text, fontWeight: '700' },
  rowPressed: { opacity: 0.86 },
  pickerOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  pickerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.38)',
  },
  pickerCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingBottom: spacing.sm,
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  pickerTitle: { ...typography.body, color: colors.text, fontWeight: '700' },
  pickerDone: { ...typography.body, color: colors.accent, fontWeight: '700' },
});
