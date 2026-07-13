import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
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
import DateTimePicker from '@react-native-community/datetimepicker';
import { FontAwesome6 } from '@expo/vector-icons';
import { ScreenHeader } from '@/ui/ScreenHeader';
import { CategorySheet } from '@/features/categories/CategorySheet';
import { colors, radius, spacing, typography } from '@/ui/tokens';
import { findOtherIncomeCategoryOption, normalizeIncomeCategoryOption } from '@/features/categories/rules';
import type { CategoryOption } from '@/features/categories/types';
import type { ImportedTransactionDraft, SkippedImportedTransaction } from '@/features/transactions/imageImport';
import type { TransferPersonRow } from '@/features/transfers/types';
import { useImportReviewState } from '@/features/transactions/composer/hooks/useImportReviewState';
import { ImportReviewTransactionCard } from './ImportReviewTransactionCard';

type BudgetIndicator = {
  tone: 'neutral' | 'warning' | 'critical';
  label: string;
};

const hasValidImportedAmount = (value: string): boolean => {
  const normalized = value.trim().replace(',', '.');
  if (!normalized) return false;
  const numeric = Number(normalized);
  return Number.isFinite(numeric) && numeric > 0;
};

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

const isValidIsoDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return toIsoDate(parseIsoDate(value)) === value;
};

const isReadyToSaveRow = (row: ImportedTransactionDraft, categoryOptions: readonly CategoryOption[]): boolean => {
  if (row.name.trim().length === 0) return false;
  if (!hasValidImportedAmount(row.amount)) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.occurredOn.trim())) return false;

  const selectedCategory = categoryOptions.find((option) => option.id === row.categoryId) ?? null;
  const resolvedCategory =
    row.kind === 'income' ? normalizeIncomeCategoryOption(selectedCategory, categoryOptions) : selectedCategory;

  return resolvedCategory !== null;
};

type Props = {
  visible: boolean;
  rows: ImportedTransactionDraft[];
  skippedDuplicates?: SkippedImportedTransaction[];
  saving: boolean;
  errorMessage: string | null;
  categoriesById: Record<string, CategoryOption>;
  categoryOptions: CategoryOption[];
  transferPeople: TransferPersonRow[];
  frequentIds?: readonly string[];
  recentIds?: readonly string[];
  budgetStateByCategory?: Record<string, BudgetIndicator>;
  onClose: () => void;
  onSave: () => void;
  onChangeRow: (id: string, patch: Partial<ImportedTransactionDraft>) => void;
  onRemoveRow: (id: string) => void;
};

export function ImportReviewModal({
  visible,
  rows,
  skippedDuplicates = [],
  saving,
  errorMessage,
  categoriesById,
  categoryOptions,
  transferPeople,
  frequentIds,
  recentIds,
  budgetStateByCategory,
  onClose,
  onSave,
  onChangeRow,
  onRemoveRow,
}: Props) {
  const [webDateInput, setWebDateInput] = useState('');
  const [webDateError, setWebDateError] = useState<string | null>(null);
  const hasRows = rows.length > 0;
  const visibleSkippedDuplicates = skippedDuplicates.slice(0, 4);
  const incomeFallbackCategoryId = findOtherIncomeCategoryOption(categoryOptions)?.id ?? null;
  const {
    activeDateValue,
    categoryPickerRowId,
    categorizationErrorMessage,
    datePickerRowId,
    expandedRowIds,
    handleDateChange,
    isCategorizing,
    openCategoryPicker,
    openDatePicker,
    setCategoryPickerRowId,
    setDatePickerRowId,
    toggleRowExpanded,
  } = useImportReviewState({
    visible,
    rows,
    categoryOptions,
    transferPeople,
    onChangeRow,
  });
  const canSaveImport = hasRows && !saving && !isCategorizing && rows.every((row) => isReadyToSaveRow(row, categoryOptions));
  const visibleErrorMessage = errorMessage ?? categorizationErrorMessage;
  const closeDatePicker = (): void => {
    setDatePickerRowId(null);
    setWebDateError(null);
  };
  const openWebDatePicker = (rowId: string, currentDate: string): void => {
    setWebDateInput(currentDate);
    setWebDateError(null);
    openDatePicker(rowId);
  };
  const applyWebDateInput = (): void => {
    if (!datePickerRowId) return;
    const nextDate = webDateInput.trim();
    if (!isValidIsoDate(nextDate)) {
      setWebDateError('Use YYYY-MM-DD.');
      return;
    }
    onChangeRow(datePickerRowId, { occurredOn: nextDate });
    closeDatePicker();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <ScreenHeader
          back
          onBack={onClose}
          title="Review import"
          subtitle={`${rows.length} ${rows.length === 1 ? 'transaction' : 'transactions'}`}
          actions={[{ icon: 'check', onPress: onSave, disabled: !canSaveImport, tone: canSaveImport ? 'accent' : 'default' }]}
        />

        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined}
        >
        <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {visibleErrorMessage ? <Text style={styles.error}>{visibleErrorMessage}</Text> : null}

          {isCategorizing ? (
            <View style={styles.statusNotice}>
              <ActivityIndicator size="small" color={colors.textMuted} />
              <Text style={styles.statusNoticeText}>Categorizing transactions...</Text>
            </View>
          ) : null}

          {skippedDuplicates.length > 0 ? (
            <View style={styles.duplicateNotice}>
              <Text style={styles.duplicateTitle}>
                Skipped {skippedDuplicates.length} duplicate{skippedDuplicates.length === 1 ? '' : 's'}
              </Text>
              {visibleSkippedDuplicates.map((row) => (
                <Text key={row.id} style={styles.duplicateItem}>
                  {row.name} · {row.occurredOn} · {row.currencyCode} {row.amount}
                  {row.reason === 'existing' ? ' · already exists' : ' · repeated in import'}
                </Text>
              ))}
              {skippedDuplicates.length > visibleSkippedDuplicates.length ? (
                <Text style={styles.duplicateMeta}>
                  +{skippedDuplicates.length - visibleSkippedDuplicates.length} more duplicate
                  {skippedDuplicates.length - visibleSkippedDuplicates.length === 1 ? '' : 's'}
                </Text>
              ) : null}
            </View>
          ) : null}

          {rows.length === 0 ? (
            <View style={styles.emptyState}>
              <FontAwesome6 name="image" size={28} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>No transactions left</Text>
              <Text style={styles.emptyText}>Close this review and pick another image when you want to try again.</Text>
            </View>
          ) : null}

          {rows.map((row, index) => {
            const category = row.categoryId ? (categoriesById[row.categoryId] ?? null) : null;
            const expanded = expandedRowIds.includes(row.id);
            const categoryFailed = !isCategorizing && !category;

            return (
              <ImportReviewTransactionCard
                key={row.id}
                row={row}
                index={index}
                category={category}
                categoryLoading={isCategorizing && !category}
                categoryFailed={categoryFailed}
                expanded={expanded}
                incomeFallbackCategoryId={incomeFallbackCategoryId}
                onChangeRow={(patch) => onChangeRow(row.id, patch)}
                onRemove={() => onRemoveRow(row.id)}
                onToggleExpanded={() => toggleRowExpanded(row.id)}
                onOpenDatePicker={() => {
                  if (Platform.OS === 'web') {
                    openWebDatePicker(row.id, row.occurredOn);
                    return;
                  }
                  openDatePicker(row.id);
                }}
                onOpenCategoryPicker={() => openCategoryPicker(row.id)}
              />
            );
          })}

          <Pressable
            style={({ pressed }) => [
              styles.saveButton,
              canSaveImport ? styles.saveButtonReady : styles.saveButtonDisabled,
              canSaveImport && pressed && styles.rowPressed,
            ]}
            onPress={onSave}
            disabled={!canSaveImport}
          >
            <Text style={[styles.saveButtonText, !canSaveImport && styles.saveButtonTextDisabled]}>
              {saving
                ? 'Saving...'
                : isCategorizing
                  ? 'Categorizing transactions...'
                  : rows.length === 0
                    ? 'Nothing to save'
                    : `Save ${rows.length} transactions`}
            </Text>
          </Pressable>
        </ScrollView>
        </KeyboardAvoidingView>

        <CategorySheet
          visible={categoryPickerRowId !== null}
          onClose={() => setCategoryPickerRowId(null)}
          kind={categoryPickerRowId ? rows.find((row) => row.id === categoryPickerRowId)?.kind ?? 'expense' : 'expense'}
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
              <Pressable style={styles.pickerBackdrop} onPress={closeDatePicker} />
              <SafeAreaView style={styles.pickerCard} edges={['bottom']}>
                <View style={styles.pickerHeader}>
                  <Text style={styles.pickerTitle}>Pick a date</Text>
                  <Pressable onPress={closeDatePicker} hitSlop={12}>
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

        {datePickerRowId && Platform.OS === 'web' ? (
          <Modal transparent animationType="fade" onRequestClose={closeDatePicker}>
            <View style={styles.pickerOverlay}>
              <Pressable style={styles.pickerBackdrop} onPress={closeDatePicker} />
              <View style={styles.pickerCard}>
                <View style={styles.pickerHeader}>
                  <Text style={styles.pickerTitle}>Pick a date</Text>
                  <Pressable onPress={applyWebDateInput} hitSlop={12}>
                    <Text style={styles.pickerDone}>Done</Text>
                  </Pressable>
                </View>
                <View style={styles.webDateBody}>
                  <TextInput
                    value={webDateInput}
                    onChangeText={(value) => {
                      setWebDateInput(value);
                      setWebDateError(null);
                    }}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="numbers-and-punctuation"
                    style={styles.webDateInput}
                    onSubmitEditing={applyWebDateInput}
                  />
                  {webDateError ? <Text style={styles.webDateError}>{webDateError}</Text> : null}
                </View>
              </View>
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
  duplicateNotice: {
    borderRadius: radius.lg,
    backgroundColor: 'rgba(245,185,66,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245,185,66,0.28)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.xs,
  },
  duplicateTitle: { ...typography.body, color: colors.text, fontWeight: '700' },
  duplicateItem: { ...typography.label, color: colors.text },
  duplicateMeta: { ...typography.label, color: colors.textMuted },
  statusNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  statusNoticeText: { ...typography.label, color: colors.textMuted },
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
  saveButton: {
    marginTop: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  saveButtonReady: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  saveButtonDisabled: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
  },
  saveButtonText: { ...typography.body, color: colors.text, fontWeight: '700' },
  saveButtonTextDisabled: { color: colors.textMuted },
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
  webDateBody: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  webDateInput: {
    ...typography.body,
    color: colors.text,
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.md,
  },
  webDateError: { ...typography.label, color: colors.danger },
});
