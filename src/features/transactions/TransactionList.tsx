import { memo } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '@/ui/tokens';
import { formatDateLabel, formatMinor } from '@/lib/format';
import type { TransactionRow } from './types';
import { MotionView } from '@/ui/MotionView';
import { CategoryIcon } from '@/ui/CategoryIcon';

type TransactionListItem = {
  row: TransactionRow;
  categoryLabel: string;
  categoryColor: string;
  categoryIcon: string;
};

type TransactionListAction = {
  label: string;
  onPress: () => void;
  tone?: 'accent' | 'danger' | 'muted';
  disabled?: boolean;
};

type Props = {
  title?: string;
  actionLabel?: string;
  onActionPress?: () => void;
  actions?: readonly TransactionListAction[];
  items: TransactionListItem[];
  emptyLabel: string;
  onEdit: (row: TransactionRow) => void;
  onDuplicate: (row: TransactionRow) => void;
  onDelete: (row: TransactionRow) => void;
  selectionMode?: boolean;
  selectedIds?: readonly string[];
  onToggleSelect?: (row: TransactionRow) => void;
};

function TransactionRowCard({
  item,
  index,
  onEdit,
  onDuplicate,
  onDelete,
  selectionMode = false,
  selected = false,
  onToggleSelect,
}: {
  item: TransactionListItem;
  index: number;
  onEdit: (row: TransactionRow) => void;
  onDuplicate: (row: TransactionRow) => void;
  onDelete: (row: TransactionRow) => void;
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (row: TransactionRow) => void;
}) {
  const { row } = item;

  const openActions = (): void => {
    if (selectionMode && onToggleSelect) {
      onToggleSelect(row);
      return;
    }

    Alert.alert(row.name, undefined, [
      { text: 'Edit', onPress: () => onEdit(row) },
      { text: 'Duplicate', onPress: () => onDuplicate(row) },
      { text: 'Delete', style: 'destructive', onPress: () => onDelete(row) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const displayAmount =
    row.currency_code !== 'DKK' && row.original_amount_minor > 0
      ? `${formatMinor(row.converted_amount_minor, 'DKK')} · ${formatMinor(row.original_amount_minor, row.currency_code)}`
      : formatMinor(row.amount_minor, 'DKK');

  return (
    <MotionView index={index} direction="right" distance={155} delayMs={160} stepMs={65}>
      <Pressable
        style={({ pressed }) => [
          styles.row,
          selectionMode && styles.rowSelectable,
          selected && styles.rowSelected,
          pressed && styles.rowPressed,
        ]}
        onPress={() => {
          if (selectionMode && onToggleSelect) {
            onToggleSelect(row);
            return;
          }
          onEdit(row);
        }}
        onLongPress={openActions}
      >
        <View style={[styles.iconWrap, { backgroundColor: `${item.categoryColor}22` }]}>
          <CategoryIcon name={item.categoryIcon} size={20} color={item.categoryColor} />
        </View>
        <View style={styles.rowBody}>
          <View style={styles.rowTop}>
            <Text style={styles.name} numberOfLines={1}>
              {row.name}
            </Text>
            <Text style={[styles.amount, row.kind === 'income' ? styles.amountIncome : styles.amountExpense]}>
              {row.kind === 'income' ? '+' : '-'}{displayAmount}
            </Text>
          </View>
          <View style={styles.rowMetaWrap}>
            <Text style={styles.meta} numberOfLines={1}>
              {item.categoryLabel} · {formatDateLabel(row.occurred_on)}
            </Text>
            <View style={styles.chips}>
              {row.shared ? (
                <View style={styles.chip}>
                  <Text style={styles.chipText}>
                    Shared expense
                    {row.shared_participant ? ` · ${row.shared_participant === 'gf' ? 'GF' : 'Me'}` : ''}
                  </Text>
                </View>
              ) : null}
              {row.is_shared_topup ? (
                <View style={styles.chip}>
                  <Text style={styles.chipText}>
                    Shared top-up
                    {row.shared_participant ? ` · ${row.shared_participant === 'gf' ? 'GF' : 'Me'}` : ''}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>
        {selectionMode ? (
          <View style={[styles.selectionIndicator, selected && styles.selectionIndicatorActive]}>
            {selected ? <MaterialCommunityIcons name="check" size={14} color={colors.text} /> : null}
          </View>
        ) : null}
      </Pressable>
    </MotionView>
  );
}

export const TransactionList = memo(function TransactionList({
  title,
  actionLabel,
  onActionPress,
  actions,
  items,
  emptyLabel,
  onEdit,
  onDuplicate,
  onDelete,
  selectionMode = false,
  selectedIds = [],
  onToggleSelect,
}: Props) {
  const resolvedActions: readonly TransactionListAction[] =
    actions ?? (actionLabel && onActionPress ? [{ label: actionLabel, onPress: onActionPress, tone: 'accent' }] : []);

  return (
    <View style={styles.wrap}>
      {title || resolvedActions.length > 0 ? (
        <View style={styles.head}>
          {title ? <Text style={styles.title}>{title}</Text> : <View />}
          {resolvedActions.length > 0 ? (
            <View style={styles.actions}>
              {resolvedActions.map((action) => (
                <Pressable
                  key={action.label}
                  style={({ pressed }) => [styles.action, pressed && styles.actionPressed, action.disabled && styles.actionDisabled]}
                  onPress={action.onPress}
                  disabled={action.disabled}
                >
                  <Text
                    style={[
                      styles.actionText,
                      action.tone === 'danger' ? styles.actionTextDanger : null,
                      action.tone === 'muted' ? styles.actionTextMuted : null,
                    ]}
                  >
                    {action.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
      {items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{emptyLabel}</Text>
        </View>
      ) : (
        <ScrollView horizontal={false} scrollEnabled={false} contentContainerStyle={styles.list}>
          {items.map((item, index) => (
            <TransactionRowCard
              key={item.row.id}
              item={item}
              index={index}
              onEdit={onEdit}
              onDuplicate={onDuplicate}
              onDelete={onDelete}
              selectionMode={selectionMode}
              selected={selectedIds.includes(item.row.id)}
              onToggleSelect={onToggleSelect}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm, paddingHorizontal: spacing.lg },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  title: { ...typography.label, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: spacing.xs, flexWrap: 'wrap' },
  action: { paddingVertical: spacing.xs, paddingHorizontal: spacing.sm },
  actionPressed: { opacity: 0.82 },
  actionDisabled: { opacity: 0.4 },
  actionText: { ...typography.label, color: colors.accent, fontWeight: '600' },
  actionTextDanger: { color: colors.danger },
  actionTextMuted: { color: colors.textMuted },
  list: { gap: spacing.sm },
  empty: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  emptyText: { ...typography.body, color: colors.textMuted },
  row: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
  },
  rowSelectable: {
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.surfaceAlt,
  },
  rowPressed: { opacity: 0.85 },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: { flex: 1, gap: 6 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  name: { ...typography.body, color: colors.text, flex: 1, fontWeight: '600' },
  amount: { ...typography.body, color: colors.text },
  amountIncome: { color: colors.success, fontWeight: '700' },
  amountExpense: { color: colors.danger, fontWeight: '700' },
  rowMetaWrap: { gap: 6 },
  meta: { ...typography.label, color: colors.textMuted },
  chips: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' },
  selectionIndicator: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectionIndicatorActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  chip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
  },
  chipText: { ...typography.label, color: colors.textMuted },
});
