import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { NumericKeypad } from '@/ui/NumericKeypad';
import { SkeletonBlock } from '@/ui/Skeleton';
import { colors, radius, spacing, typography } from '@/ui/tokens';
import { formatDateLabel } from '@/lib/format';
import { getCategoryDisplayColor } from '@/features/categories/helpers';
import { isAllowedIncomeCategoryOption, isIncomeCategoryOption } from '@/features/categories/rules';
import type { CategoryOption } from '@/features/categories/types';
import type { ImportedTransactionDraft } from '@/features/transactions/imageImport';
import {
  TransactionCurrencySelector,
  TransactionFieldLabel,
  TransactionKindSelector,
  TransactionPickerField,
  TransactionTextField,
} from './TransactionFormFields';

const formatAmountDisplay = (raw: string): string => {
  if (raw.length === 0) return '0.00';
  const normalized = raw.trim().replace(',', '.');
  const value = Number(normalized);
  if (!Number.isFinite(value)) return raw;
  return value.toFixed(2);
};

type Props = {
  row: ImportedTransactionDraft;
  index: number;
  category: CategoryOption | null;
  categoryLoading: boolean;
  expanded: boolean;
  amountPickerOpen: boolean;
  incomeFallbackCategoryId: string | null;
  onChangeRow: (patch: Partial<ImportedTransactionDraft>) => void;
  onRemove: () => void;
  onToggleExpanded: () => void;
  onToggleAmountPicker: () => void;
  onOpenDatePicker: () => void;
  onOpenCategoryPicker: () => void;
  onCollapseInlinePickers: () => void;
};

export function ImportReviewTransactionCard({
  row,
  index,
  category,
  categoryLoading,
  expanded,
  amountPickerOpen,
  incomeFallbackCategoryId,
  onChangeRow,
  onRemove,
  onToggleExpanded,
  onToggleAmountPicker,
  onOpenDatePicker,
  onOpenCategoryPicker,
  onCollapseInlinePickers,
}: Props) {
  const categoryLabel = category ? `${category.parentName} · ${category.name}` : '';
  const categoryAccentColor = category
    ? getCategoryDisplayColor({
        kind: row.kind,
        parentName: category.parentName,
        name: category.name,
        parentColor: category.parentColor,
        color: category.color,
      })
    : colors.textMuted;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>Transaction {index + 1}</Text>
        <Pressable onPress={onRemove} hitSlop={12}>
          <MaterialCommunityIcons name="close" size={18} color={colors.textMuted} />
        </Pressable>
      </View>

      <TransactionFieldLabel>Name</TransactionFieldLabel>
      <TransactionTextField
        value={row.name}
        onChangeText={(value) => onChangeRow({ name: value })}
        onFocus={onCollapseInlinePickers}
        placeholder="Transaction name"
        variant="card"
      />

      <TransactionFieldLabel>Date</TransactionFieldLabel>
      <TransactionPickerField
        text={formatDateLabel(row.occurredOn)}
        variant="card"
        leadingMaterialIcon="calendar-month-outline"
        trailing={<MaterialCommunityIcons name="calendar-month-outline" size={18} color={colors.textMuted} />}
        onPress={onOpenDatePicker}
      />

      <TransactionFieldLabel>Category</TransactionFieldLabel>
      {categoryLoading ? (
        <View style={styles.categorySkeletonField}>
          <View style={styles.categorySkeletonLeading}>
            <SkeletonBlock width={18} height={18} radius={radius.pill} />
          </View>
          <SkeletonBlock width="54%" height={14} radius={radius.sm} />
        </View>
      ) : (
        <TransactionPickerField
          text={categoryLabel}
          placeholder="Pick a category"
          variant="card"
          leadingCategoryIcon={category?.icon ?? 'shape-outline'}
          leadingIconColor={categoryAccentColor}
          leadingIconBackgroundColor={category ? `${categoryAccentColor}22` : colors.surfaceAlt}
          onPress={onOpenCategoryPicker}
        />
      )}

      <TransactionFieldLabel>Amount</TransactionFieldLabel>
      <TransactionPickerField
        text={formatAmountDisplay(row.amount)}
        variant="card"
        leadingMaterialIcon="cash"
        trailing={<MaterialCommunityIcons name="keyboard-outline" size={18} color={colors.textMuted} />}
        onPress={onToggleAmountPicker}
      />

      {amountPickerOpen ? (
        <View style={styles.inlineKeypadWrap}>
          <NumericKeypad value={row.amount} onChange={(value) => onChangeRow({ amount: value })} />
        </View>
      ) : null}

      <Pressable style={({ pressed }) => [styles.showMoreButton, pressed && styles.rowPressed]} onPress={onToggleExpanded}>
        <Text style={styles.showMoreText}>{expanded ? 'Show less' : 'Show more'}</Text>
        <MaterialCommunityIcons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={colors.textMuted}
        />
      </Pressable>

      {expanded ? (
        <>
          <TransactionFieldLabel>Type</TransactionFieldLabel>
          <TransactionKindSelector
            value={row.kind}
            variant="card"
            onChange={(option) =>
              onChangeRow({
                kind: option,
                categoryId:
                  option === 'income'
                    ? category && isAllowedIncomeCategoryOption(category)
                      ? row.categoryId
                      : incomeFallbackCategoryId
                    : category && isIncomeCategoryOption(category)
                      ? null
                      : row.categoryId,
              })
            }
          />

          <TransactionFieldLabel>Currency</TransactionFieldLabel>
          <TransactionCurrencySelector
            value={row.currencyCode}
            variant="card"
            onChange={(value) => onChangeRow({ currencyCode: value })}
          />

          <TransactionFieldLabel>Note</TransactionFieldLabel>
          <TransactionTextField
            value={row.comment}
            onChangeText={(value) => onChangeRow({ comment: value })}
            onFocus={onCollapseInlinePickers}
            placeholder="Optional"
            variant="card"
            style={styles.noteInput}
            multiline
          />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  cardTitle: { ...typography.body, color: colors.text, fontWeight: '700' },
  showMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  showMoreText: { ...typography.label, color: colors.textMuted },
  inlineKeypadWrap: {
    marginTop: spacing.xs,
    overflow: 'hidden',
    borderRadius: radius.lg,
  },
  categorySkeletonField: {
    minHeight: 52,
    borderRadius: radius.md,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  categorySkeletonLeading: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noteInput: { minHeight: 76, textAlignVertical: 'top' },
  rowPressed: { opacity: 0.86 },
});
