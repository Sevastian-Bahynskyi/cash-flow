import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing, typography } from '@/ui/tokens';
import { supabase } from '@/lib/supabase';
import { CategorySheet } from '@/features/categories/CategorySheet';
import type { CategoryOption } from '@/features/categories/types';
import type { TransactionInsert, TransactionKind } from './types';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
};

const todayIso = (): string => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export default function AddTransactionModal({ visible, onClose, onSaved }: Props): JSX.Element {
  const [kind, setKind] = useState<TransactionKind>('expense');
  const [amountText, setAmountText] = useState('');
  const [category, setCategory] = useState<CategoryOption | null>(null);
  const [name, setName] = useState('');
  const [comment, setComment] = useState('');
  const [date, setDate] = useState(todayIso());
  const [recurring, setRecurring] = useState(false);
  const [shared, setShared] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const reset = (): void => {
    setKind('expense');
    setAmountText('');
    setCategory(null);
    setName('');
    setComment('');
    setDate(todayIso());
    setRecurring(false);
    setShared(false);
  };

  const handleClose = (): void => {
    reset();
    onClose();
  };

  const parseAmountMinor = (raw: string): number | null => {
    const cleaned = raw.replace(',', '.').trim();
    if (cleaned.length === 0) return null;
    const n = Number(cleaned);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.round(n * 100);
  };

  const handleSave = async (): Promise<void> => {
    const amountMinor = parseAmountMinor(amountText);
    if (amountMinor === null) {
      Alert.alert('Amount required', 'Enter an amount greater than zero.');
      return;
    }
    if (kind === 'expense' && !category) {
      Alert.alert('Category required', 'Pick a category for this expense.');
      return;
    }
    if (name.trim().length === 0) {
      Alert.alert('Name required', 'Give this transaction a short name.');
      return;
    }

    setSaving(true);
    try {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData.user) {
        Alert.alert('Not signed in', 'Please sign in before saving.');
        return;
      }

      const payload: TransactionInsert = {
        user_id: userData.user.id,
        kind,
        amount_minor: amountMinor,
        occurred_on: date,
        name: name.trim(),
        comment: comment.trim().length > 0 ? comment.trim() : null,
        category_id: category?.id ?? null,
        country_iso: null,
        recurring,
        shared,
      };

      const { error } = await supabase.from('transactions').insert(payload);
      if (error) {
        Alert.alert('Could not save', 'Something went wrong saving the transaction.');
        return;
      }
      reset();
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={handleClose}>
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.header}>
            <Pressable onPress={handleClose} hitSlop={12}>
              <Text style={styles.headerAction}>Cancel</Text>
            </Pressable>
            <View style={styles.kindToggle}>
              <Pressable
                onPress={() => setKind('expense')}
                style={[styles.kindBtn, kind === 'expense' && styles.kindBtnActive]}
              >
                <Text style={[styles.kindText, kind === 'expense' && styles.kindTextActive]}>Expense</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setKind('income');
                  setCategory(null);
                }}
                style={[styles.kindBtn, kind === 'income' && styles.kindBtnActive]}
              >
                <Text style={[styles.kindText, kind === 'income' && styles.kindTextActive]}>Income</Text>
              </Pressable>
            </View>
            <Pressable onPress={handleSave} disabled={saving} hitSlop={12}>
              <Text style={[styles.headerAction, styles.headerSave, saving && styles.disabled]}>
                {saving ? 'Saving' : 'Save'}
              </Text>
            </Pressable>
          </View>

          <View style={styles.body}>
            <Text style={styles.label}>Amount</Text>
            <TextInput
              value={amountText}
              onChangeText={setAmountText}
              placeholder="0"
              placeholderTextColor={colors.textMuted}
              keyboardType="decimal-pad"
              autoFocus
              style={styles.amountInput}
            />

            {kind === 'expense' && (
              <>
                <Text style={styles.label}>Category</Text>
                <Pressable style={styles.field} onPress={() => setPickerOpen(true)}>
                  <Text style={[styles.fieldText, !category && styles.placeholder]}>
                    {category ? `${category.parentName} · ${category.name}` : 'Pick a category'}
                  </Text>
                </Pressable>
              </>
            )}

            <Text style={styles.label}>Name</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="What was it?"
              placeholderTextColor={colors.textMuted}
              style={styles.field}
            />

            <Text style={styles.label}>Date</Text>
            <TextInput
              value={date}
              onChangeText={setDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.field}
            />

            <Text style={styles.label}>Comment</Text>
            <TextInput
              value={comment}
              onChangeText={setComment}
              placeholder="Optional"
              placeholderTextColor={colors.textMuted}
              style={styles.field}
            />

            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Recurring</Text>
              <Switch value={recurring} onValueChange={setRecurring} />
            </View>
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Shared</Text>
              <Switch value={shared} onValueChange={setShared} />
            </View>
          </View>
        </KeyboardAvoidingView>

        <CategorySheet
          visible={pickerOpen}
          onClose={() => setPickerOpen(false)}
          onSelect={setCategory}
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  headerAction: { ...typography.body, color: colors.textMuted },
  headerSave: { color: colors.accent, fontWeight: '600' },
  disabled: { opacity: 0.5 },
  kindToggle: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    padding: 2,
  },
  kindBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
  },
  kindBtnActive: { backgroundColor: colors.surfaceAlt },
  kindText: { ...typography.label, color: colors.textMuted },
  kindTextActive: { color: colors.text },
  body: { flex: 1, paddingHorizontal: spacing.lg },
  label: {
    ...typography.label,
    color: colors.textMuted,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  amountInput: {
    ...typography.amount,
    color: colors.text,
    paddingVertical: spacing.sm,
  },
  field: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.text,
    ...typography.body,
  },
  fieldText: { ...typography.body, color: colors.text },
  placeholder: { color: colors.textMuted },
  toggleRow: {
    marginTop: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleLabel: { ...typography.body, color: colors.text },
});
