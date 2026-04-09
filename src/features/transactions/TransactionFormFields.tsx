import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, type TextInputProps, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CategoryIcon } from '@/ui/CategoryIcon';
import { colors, radius, spacing, typography } from '@/ui/tokens';
import { currencyOptions } from '@/lib/currency';
import type { TransactionKind } from './types';

type FieldVariant = 'page' | 'card';

const fieldBackgroundColor = (variant: FieldVariant): string =>
  variant === 'page' ? colors.surface : colors.bg;

const chipBackgroundColor = (variant: FieldVariant): string =>
  variant === 'page' ? colors.surface : colors.surfaceAlt;

export function TransactionFieldLabel({ children }: { children: string }) {
  return <Text style={styles.label}>{children}</Text>;
}

export function TransactionKindSelector({
  value,
  onChange,
  variant = 'page',
}: {
  value: TransactionKind;
  onChange: (value: TransactionKind) => void;
  variant?: FieldVariant;
}) {
  return (
    <View style={styles.kindRow}>
      {(['expense', 'income'] as const).map((option) => {
        const active = value === option;
        return (
          <Pressable
            key={option}
            style={({ pressed }) => [
              styles.kindChip,
              { backgroundColor: chipBackgroundColor(variant) },
              active && styles.kindChipActive,
              pressed && styles.rowPressed,
            ]}
            onPress={() => onChange(option)}
          >
            <Text style={[styles.kindChipText, active && styles.kindChipTextActive]}>
              {option === 'expense' ? 'Expense' : 'Income'}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function TransactionTextField({
  variant = 'page',
  style,
  ...props
}: TextInputProps & { variant?: FieldVariant }) {
  return (
    <TextInput
      {...props}
      placeholderTextColor={props.placeholderTextColor ?? colors.textMuted}
      style={[
        styles.input,
        { backgroundColor: fieldBackgroundColor(variant) },
        style,
      ]}
    />
  );
}

export function TransactionCurrencySelector({
  value,
  onChange,
  variant = 'page',
}: {
  value: string;
  onChange: (value: string) => void;
  variant?: FieldVariant;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.currencyRow}>
      {currencyOptions.map((currency) => {
        const active = value === currency.code;
        return (
          <Pressable
            key={currency.code}
            style={({ pressed }) => [
              styles.currencyChip,
              {
                backgroundColor: chipBackgroundColor(variant),
              },
              active && styles.currencyChipActive,
              pressed && styles.rowPressed,
            ]}
            onPress={() => onChange(currency.code)}
          >
            <Text style={[styles.currencyChipText, active && styles.currencyChipTextActive]}>
              {currency.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function TransactionPickerField({
  text,
  placeholder,
  onPress,
  variant = 'page',
  leadingMaterialIcon,
  leadingCategoryIcon,
  leadingIconColor = colors.textMuted,
  leadingIconBackgroundColor,
  trailing,
}: {
  text?: string;
  placeholder?: string;
  onPress: () => void;
  variant?: FieldVariant;
  leadingMaterialIcon?: keyof typeof MaterialCommunityIcons.glyphMap;
  leadingCategoryIcon?: string;
  leadingIconColor?: string;
  leadingIconBackgroundColor?: string;
  trailing?: ReactNode;
}) {
  const displayText = text && text.length > 0 ? text : placeholder ?? '';
  const isPlaceholder = !text || text.length === 0;
  const showLeading = Boolean(leadingMaterialIcon || leadingCategoryIcon);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.fieldCard,
        { backgroundColor: fieldBackgroundColor(variant) },
        pressed && styles.rowPressed,
      ]}
      onPress={onPress}
    >
      <View style={styles.fieldLeading}>
        {showLeading ? (
          <View
            style={[
              styles.categoryIconWrap,
              { backgroundColor: leadingIconBackgroundColor ?? colors.surfaceAlt },
            ]}
          >
            {leadingCategoryIcon ? (
              <CategoryIcon name={leadingCategoryIcon} size={18} color={leadingIconColor} />
            ) : (
              <MaterialCommunityIcons name={leadingMaterialIcon as never} size={18} color={leadingIconColor} />
            )}
          </View>
        ) : null}
        <Text style={[styles.fieldText, isPlaceholder && styles.placeholder]} numberOfLines={1}>
          {displayText}
        </Text>
      </View>
      <View style={styles.fieldTrailing}>
        {trailing ?? <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textMuted} />}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  label: {
    ...typography.label,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.sm,
  },
  kindRow: { flexDirection: 'row', gap: spacing.sm },
  kindChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  kindChipActive: { backgroundColor: colors.accent },
  kindChipText: { ...typography.label, color: colors.textMuted },
  kindChipTextActive: { color: colors.text },
  input: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.text,
    ...typography.body,
  },
  currencyRow: { gap: spacing.sm, paddingVertical: spacing.xs },
  currencyChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  currencyChipActive: {
    backgroundColor: 'rgba(124,92,255,0.18)',
    borderColor: colors.accent,
  },
  currencyChipText: { ...typography.label, color: colors.textMuted },
  currencyChipTextActive: { color: colors.text },
  fieldCard: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fieldLeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
  categoryIconWrap: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldText: { ...typography.body, color: colors.text, flex: 1 },
  placeholder: { color: colors.textMuted },
  fieldTrailing: { width: 20, alignItems: 'center', justifyContent: 'center' },
  rowPressed: { opacity: 0.86 },
});
