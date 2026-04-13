import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  useWindowDimensions,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CategoryIcon } from '@/ui/CategoryIcon';
import { colors, radius, spacing, typography } from '@/ui/tokens';
import { currencyOptions } from '@/lib/currency';
import type { SharedParticipant, TransactionKind } from '@/features/transactions/types';

type FieldVariant = 'page' | 'card';

const sharedTopupParticipantOptions: readonly { value: SharedParticipant; label: string }[] = [
  { value: 'me', label: 'Me' },
  { value: 'gf', label: 'GF' },
] as const;

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
  incomeDisabled = false,
}: {
  value: TransactionKind;
  onChange: (value: TransactionKind) => void;
  variant?: FieldVariant;
  incomeDisabled?: boolean;
}) {
  return (
    <View style={styles.kindRow}>
      {(['expense', 'income'] as const).map((option) => {
        const active = value === option;
        const disabled = option === 'income' && incomeDisabled;
        return (
          <Pressable
            key={option}
            style={({ pressed }) => [
              styles.kindChip,
              { backgroundColor: chipBackgroundColor(variant) },
              active && styles.kindChipActive,
              pressed && styles.rowPressed,
              disabled && styles.kindChipDisabled,
            ]}
            disabled={disabled}
            onPress={() => {
              if (disabled) return;
              onChange(option);
            }}
          >
            <Text
              style={[
                styles.kindChipText,
                active && styles.kindChipTextActive,
                disabled && styles.kindChipTextDisabled,
              ]}
            >
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
  appearance = 'pill',
}: {
  value: string;
  onChange: (value: string) => void;
  variant?: FieldVariant;
  appearance?: 'pill' | 'inline';
}) {
  const triggerRef = useRef<View | null>(null);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const selectedCurrency = useMemo(
    () => currencyOptions.find((currency) => currency.code === value) ?? currencyOptions[0],
    [value],
  );

  useEffect(() => {
    if (!open) return;

    triggerRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
    });
  }, [open]);

  useEffect(() => {
    setOpen(false);
  }, [value]);

  const openMenu = (): void => {
    triggerRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
      setOpen(true);
    });
  };

  const estimatedMenuWidth = 132;
  const menuLeft = Math.max(
    spacing.lg,
    Math.min(anchor.x, screenWidth - estimatedMenuWidth - spacing.lg),
  );
  const menuTopBase = anchor.y + anchor.height + spacing.xs;
  const estimatedMenuHeight = Math.min(currencyOptions.length * 44 + spacing.sm * 2, 320);
  const menuTop =
    menuTopBase + estimatedMenuHeight <= screenHeight - spacing.lg
      ? menuTopBase
      : Math.max(spacing.lg, anchor.y - estimatedMenuHeight - spacing.xs);

  return (
    <>
      <View style={[styles.currencySelectorWrap, appearance === 'pill' && styles.currencySelectorWrapPill]}>
        <Pressable
          ref={triggerRef}
          style={({ pressed }) => [
            appearance === 'inline'
              ? styles.currencyInlineTrigger
              : [
                  styles.currencyTrigger,
                  { backgroundColor: chipBackgroundColor(variant) },
                  open && styles.currencyTriggerOpen,
                ],
            pressed && styles.rowPressed,
          ]}
          onPress={openMenu}
        >
          <Text style={styles.currencyTriggerFlag}>{selectedCurrency?.flag}</Text>
          <Text
            style={[
              appearance === 'inline' ? styles.currencyInlineTriggerText : styles.currencyTriggerText,
              open && appearance === 'inline' && styles.currencyInlineTriggerTextOpen,
            ]}
          >
            {selectedCurrency?.label ?? value}
          </Text>
          <MaterialCommunityIcons
            name={open ? 'chevron-up' : 'chevron-down'}
            size={appearance === 'inline' ? 14 : 16}
            color={open && appearance === 'inline' ? colors.text : colors.textMuted}
          />
        </Pressable>
      </View>

      <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.currencyMenuBackdrop} onPress={() => setOpen(false)}>
          <View
            style={[
              styles.currencyMenu,
              {
                top: menuTop,
                left: menuLeft,
                maxWidth: screenWidth - menuLeft - spacing.lg,
                maxHeight: Math.max(180, screenHeight - menuTop - spacing.lg),
              },
            ]}
          >
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.currencyMenuContent}
            >
              {currencyOptions.map((currency) => {
                const active = value === currency.code;

                return (
                  <Pressable
                    key={currency.code}
                    style={({ pressed }) => [
                      styles.currencyOptionPressable,
                      pressed && styles.rowPressed,
                    ]}
                    onPress={() => {
                      onChange(currency.code);
                      setOpen(false);
                    }}
                  >
                    <View
                      style={[
                        styles.currencyOptionChip,
                        { backgroundColor: chipBackgroundColor(variant) },
                        active && styles.currencyOptionChipActive,
                      ]}
                    >
                      <Text style={styles.currencyOptionFlag}>{currency.flag}</Text>
                      <Text style={[styles.currencyOptionText, active && styles.currencyOptionTextActive]}>
                        {currency.label}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

/** Me / GF picker for shared top-ups; same overlay pattern as `TransactionCurrencySelector`. */
export function SharedTopupParticipantSelector({
  value,
  onChange,
  onBeforeOpen,
  variant = 'page',
  appearance = 'inline',
  dimmed = false,
  active = false,
  labelPrefix,
}: {
  value: SharedParticipant;
  onChange: (value: SharedParticipant) => void;
  onBeforeOpen?: () => void;
  variant?: FieldVariant;
  appearance?: 'pill' | 'inline';
  dimmed?: boolean;
  active?: boolean;
  labelPrefix?: string;
}) {
  const triggerRef = useRef<View | null>(null);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const selected = useMemo(() => {
    const match = sharedTopupParticipantOptions.find((o) => o.value === value);
    if (match) return match;
    return sharedTopupParticipantOptions[0] as { value: SharedParticipant; label: string };
  }, [value]);

  useEffect(() => {
    if (!open) return;
    triggerRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
    });
  }, [open]);

  useEffect(() => {
    setOpen(false);
  }, [value]);

  const openMenu = (): void => {
    onBeforeOpen?.();
    triggerRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
      setOpen(true);
    });
  };

  const estimatedMenuWidth = 128;
  const menuLeft = Math.max(
    spacing.lg,
    Math.min(anchor.x, screenWidth - estimatedMenuWidth - spacing.lg),
  );
  const menuTopBase = anchor.y + anchor.height + spacing.xs;
  const estimatedMenuHeight = Math.min(sharedTopupParticipantOptions.length * 44 + spacing.sm * 2, 200);
  const menuTop =
    menuTopBase + estimatedMenuHeight <= screenHeight - spacing.lg
      ? menuTopBase
      : Math.max(spacing.lg, anchor.y - estimatedMenuHeight - spacing.xs);

  return (
    <>
      <View style={[styles.currencySelectorWrap, appearance === 'pill' && styles.currencySelectorWrapPill]}>
        <Pressable
          ref={triggerRef}
          style={({ pressed }) => [
            appearance === 'inline'
              ? [styles.currencyInlineTrigger, dimmed && styles.sharedTopupTriggerDimmed]
              : [
                  styles.currencyTrigger,
                  { backgroundColor: chipBackgroundColor(variant) },
                  (open || active) && styles.currencyTriggerOpen,
                ],
            pressed && styles.rowPressed,
          ]}
          onPress={openMenu}
        >
          <Text
            style={[
              appearance === 'inline' ? styles.currencyInlineTriggerText : styles.currencyTriggerText,
              (open || active) && appearance === 'inline' && styles.currencyInlineTriggerTextOpen,
              dimmed && appearance === 'inline' && styles.sharedTopupTriggerTextDimmed,
            ]}
          >
            {labelPrefix ? `${labelPrefix}: ${selected.label}` : selected.label}
          </Text>
          <MaterialCommunityIcons
            name={open ? 'chevron-up' : 'chevron-down'}
            size={appearance === 'inline' ? 14 : 16}
            color={(open || active) && appearance === 'inline' ? colors.text : colors.textMuted}
          />
        </Pressable>
      </View>

      <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.currencyMenuBackdrop} onPress={() => setOpen(false)}>
          <View
            style={[
              styles.currencyMenu,
              {
                top: menuTop,
                left: menuLeft,
                maxWidth: screenWidth - menuLeft - spacing.lg,
                maxHeight: Math.max(120, screenHeight - menuTop - spacing.lg),
              },
            ]}
          >
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.currencyMenuContent}
            >
              {sharedTopupParticipantOptions.map((option) => {
                const active = value === option.value;
                return (
                  <Pressable
                    key={option.value}
                    style={({ pressed }) => [styles.currencyOptionPressable, pressed && styles.rowPressed]}
                    onPress={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                  >
                    <View
                      style={[
                        styles.currencyOptionChip,
                        { backgroundColor: chipBackgroundColor(variant) },
                        active && styles.currencyOptionChipActive,
                      ]}
                    >
                      <Text style={[styles.currencyOptionText, active && styles.currencyOptionTextActive]}>
                        {labelPrefix ? `${labelPrefix}: ${option.label}` : option.label}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </>
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
  kindChipDisabled: { opacity: 0.42 },
  kindChipText: { ...typography.label, color: colors.textMuted },
  kindChipTextActive: { color: colors.text },
  kindChipTextDisabled: { color: colors.textMuted },
  input: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.text,
    ...typography.body,
  },
  currencySelectorWrap: { alignSelf: 'flex-start', paddingVertical: spacing.xs },
  currencySelectorWrapPill: { paddingVertical: 0 },
  currencyTrigger: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  currencyTriggerOpen: {
    backgroundColor: 'rgba(124,92,255,0.18)',
    borderColor: colors.accent,
  },
  currencyTriggerFlag: { fontSize: 14 },
  currencyTriggerText: { ...typography.label, color: colors.text, fontWeight: '600' },
  currencyInlineTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: -2,
    paddingHorizontal: 2,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  currencyInlineTriggerText: {
    ...typography.body,
    color: colors.textMuted,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  currencyInlineTriggerTextOpen: {
    color: colors.text,
  },
  currencyMenuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  currencyMenu: {
    position: 'absolute',
    alignItems: 'flex-start',
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 16,
  },
  currencyMenuContent: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    gap: spacing.xs,
    alignItems: 'flex-start',
  },
  currencyOptionPressable: {
    alignSelf: 'flex-start',
  },
  currencyOptionChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  currencyOptionChipActive: {
    backgroundColor: 'rgba(124,92,255,0.12)',
    borderColor: colors.accent,
  },
  currencyOptionFlag: { fontSize: 14 },
  currencyOptionText: { ...typography.label, color: colors.textMuted },
  currencyOptionTextActive: { color: colors.text },
  sharedTopupTriggerDimmed: { opacity: 0.72 },
  sharedTopupTriggerTextDimmed: { color: colors.textMuted },
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
