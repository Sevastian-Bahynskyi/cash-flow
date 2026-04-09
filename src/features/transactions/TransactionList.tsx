import { memo } from 'react';
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

type Props = {
  title?: string;
  items: TransactionListItem[];
  emptyLabel: string;
  onEdit: (row: TransactionRow) => void;
  onDuplicate: (row: TransactionRow) => void;
  onDelete: (row: TransactionRow) => void;
};

function TransactionRowCard({
  item,
  index,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  item: TransactionListItem;
  index: number;
  onEdit: (row: TransactionRow) => void;
  onDuplicate: (row: TransactionRow) => void;
  onDelete: (row: TransactionRow) => void;
}) {
  const { row } = item;

  const openActions = (): void => {
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
      <Pressable style={({ pressed }) => [styles.row, pressed && styles.rowPressed]} onPress={() => onEdit(row)} onLongPress={openActions}>
        <View style={[styles.iconWrap, { backgroundColor: `${item.categoryColor}22` }]}>
          <CategoryIcon name={item.categoryIcon} size={20} color={item.categoryColor} />
        </View>
        <View style={styles.rowBody}>
          <View style={styles.rowTop}>
            <Text style={styles.name} numberOfLines={1}>
              {row.name}
            </Text>
            <Text style={styles.amount}>{displayAmount}</Text>
          </View>
          <View style={styles.rowMetaWrap}>
            <Text style={styles.meta} numberOfLines={1}>
              {item.categoryLabel} · {formatDateLabel(row.occurred_on)}
            </Text>
            <View style={styles.chips}>
              {row.shared ? (
                <View style={styles.chip}>
                  <Text style={styles.chipText}>Shared {row.shared_participant?.toUpperCase() ?? ''}</Text>
                </View>
              ) : null}
              {row.is_shared_topup ? (
                <View style={styles.chip}>
                  <Text style={styles.chipText}>Top-up</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>
      </Pressable>
    </MotionView>
  );
}

export const TransactionList = memo(function TransactionList({
  title,
  items,
  emptyLabel,
  onEdit,
  onDuplicate,
  onDelete,
}: Props) {
  return (
    <View style={styles.wrap}>
      {title ? <Text style={styles.title}>{title}</Text> : null}
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
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm, paddingHorizontal: spacing.lg },
  title: { ...typography.label, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
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
  rowMetaWrap: { gap: 6 },
  meta: { ...typography.label, color: colors.textMuted },
  chips: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
  },
  chipText: { ...typography.label, color: colors.textMuted },
});
