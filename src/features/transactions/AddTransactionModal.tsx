import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { colors, radius, spacing, typography } from '@/ui/tokens';
import { NumericKeypad } from '@/ui/NumericKeypad';
import { supabase } from '@/lib/supabase';
import { CategorySheet } from '@/features/categories/CategorySheet';
import { useCategories } from '@/features/categories/useCategories';
import type { CategoryOption } from '@/features/categories/types';
import type { TransactionInsert, TransactionKind } from './types';
import {
  fetchFrequentCategoryIds,
  localSuggestCategory,
  remoteSuggestCategory,
} from './suggestions';

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

const parseIsoDate = (iso: string): Date => {
  const parts = iso.split('-');
  if (parts.length !== 3) {
    throw new Error(`Invalid ISO date: ${iso}`);
  }
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  return new Date(year, month - 1, day);
};

const toIsoDate = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const displayDate = (iso: string): string => {
  const d = parseIsoDate(iso);
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
};

const formatAmountDisplay = (raw: string): string => {
  if (raw.length === 0) return '0';
  return raw;
};

const parseAmountMinor = (raw: string): number | null => {
  if (raw.length === 0) return null;
  const cleaned = raw.endsWith('.') ? raw + '0' : raw;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
};

export default function AddTransactionModal({ visible, onClose, onSaved }: Props) {
  const [kind, setKind] = useState<TransactionKind>('expense');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<CategoryOption | null>(null);
  const [name, setName] = useState('');
  const [comment, setComment] = useState('');
  const [date, setDate] = useState(todayIso());
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [recurring, setRecurring] = useState(false);
  const [shared, setShared] = useState(false);
  const [isSalary, setIsSalary] = useState(false);
  const [isSharedTopup, setIsSharedTopup] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [frequentIds, setFrequentIds] = useState<string[]>([]);
  const [userTouchedCategory, setUserTouchedCategory] = useState(false);
  const categoriesState = useCategories();

  const reset = (): void => {
    setKind('expense');
    setAmount('');
    setCategory(null);
    setName('');
    setComment('');
    setDate(todayIso());
    setRecurring(false);
    setShared(false);
    setIsSalary(false);
    setIsSharedTopup(false);
    setUserTouchedCategory(false);
  };

  useEffect(() => {
    if (!visible) return;
    void fetchFrequentCategoryIds().then(setFrequentIds);
  }, [visible]);

  const categoryOptions: CategoryOption[] = useMemo(
    () => (categoriesState.status === 'ready' ? categoriesState.options : []),
    [categoriesState],
  );

  // Non-blocking suggestion: local history first, Groq fallback.
  // Runs after the user stops typing the name. User override wins.
  const suggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (kind !== 'expense' || userTouchedCategory) return;
    if (suggestTimer.current) clearTimeout(suggestTimer.current);
    const query = name.trim();
    if (query.length < 2 || categoryOptions.length === 0) return;

    suggestTimer.current = setTimeout(async () => {
      const local = await localSuggestCategory(query);
      if (local) {
        const match = categoryOptions.find((c) => c.id === local);
        if (match && !userTouchedCategory) setCategory(match);
        return;
      }
      const candidates = categoryOptions.map((c) => ({
        id: c.id,
        parent: c.parentName,
        name: c.name,
      }));
      const remote = await remoteSuggestCategory(query, comment || null, candidates);
      if (remote) {
        const match = categoryOptions.find((c) => c.id === remote);
        if (match && !userTouchedCategory) setCategory(match);
      }
    }, 500);

    return () => {
      if (suggestTimer.current) clearTimeout(suggestTimer.current);
    };
  }, [name, comment, kind, userTouchedCategory, categoryOptions]);

  const handleClose = (): void => {
    reset();
    onClose();
  };

  const handleSave = async (): Promise<void> => {
    const amountMinor = parseAmountMinor(amount);
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
        shared: kind === 'expense' && !isSharedTopup ? shared : false,
        is_salary: kind === 'income' ? isSalary : false,
        is_shared_topup: kind === 'expense' ? isSharedTopup : false,
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

  const onDateChange = (event: DateTimePickerEvent, selected?: Date): void => {
    if (Platform.OS === 'android') setDatePickerOpen(false);
    if (event.type === 'dismissed') return;
    if (selected) setDate(toIsoDate(selected));
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={handleClose}>
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Pressable onPress={handleClose} hitSlop={12}>
            <Text style={styles.headerAction}>Cancel</Text>
          </Pressable>
          <View style={styles.kindToggle}>
            <Pressable
              onPress={() => {
                setKind('expense');
                setIsSalary(false);
              }}
              style={[styles.kindBtn, kind === 'expense' && styles.kindBtnActive]}
            >
              <Text style={[styles.kindText, kind === 'expense' && styles.kindTextActive]}>Expense</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setKind('income');
                setCategory(null);
                setShared(false);
                setIsSharedTopup(false);
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

        <View style={styles.amountBlock}>
          <Text style={styles.amountLabel}>Amount</Text>
          <Text style={styles.amountValue}>{formatAmountDisplay(amount)}</Text>
        </View>

        <ScrollView
          style={styles.fields}
          contentContainerStyle={styles.fieldsContent}
          keyboardShouldPersistTaps="handled"
        >
          {kind === 'expense' && (
            <>
              <Text style={styles.label}>Category</Text>
              <Pressable
                style={styles.field}
                onPress={() => {
                  setUserTouchedCategory(true);
                  setPickerOpen(true);
                }}
              >
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
            returnKeyType="done"
          />

          <Text style={styles.label}>Date</Text>
          <Pressable style={styles.field} onPress={() => setDatePickerOpen(true)}>
            <Text style={styles.fieldText}>{displayDate(date)}</Text>
          </Pressable>

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
          {kind === 'expense' && (
            <>
              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>Shared expense</Text>
                <Switch
                  value={shared}
                  onValueChange={(v) => {
                    setShared(v);
                    if (v) setIsSharedTopup(false);
                  }}
                />
              </View>
              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>Shared top-up</Text>
                <Switch
                  value={isSharedTopup}
                  onValueChange={(v) => {
                    setIsSharedTopup(v);
                    if (v) setShared(false);
                  }}
                />
              </View>
            </>
          )}
          {kind === 'income' && (
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Salary (starts new cycle)</Text>
              <Switch value={isSalary} onValueChange={setIsSalary} />
            </View>
          )}
        </ScrollView>

        <NumericKeypad value={amount} onChange={setAmount} />

        {datePickerOpen && (
          <>
            {Platform.OS === 'ios' ? (
              <View style={styles.iosPickerWrap}>
                <View style={styles.iosPickerHeader}>
                  <Pressable onPress={() => setDatePickerOpen(false)}>
                    <Text style={styles.headerAction}>Done</Text>
                  </Pressable>
                </View>
                <DateTimePicker
                  value={parseIsoDate(date)}
                  mode="date"
                  display="spinner"
                  themeVariant="dark"
                  onChange={onDateChange}
                />
              </View>
            ) : (
              <DateTimePicker
                value={parseIsoDate(date)}
                mode="date"
                display="default"
                onChange={onDateChange}
              />
            )}
          </>
        )}

        <CategorySheet
          visible={pickerOpen}
          onClose={() => setPickerOpen(false)}
          onSelect={(c) => {
            setUserTouchedCategory(true);
            setCategory(c);
          }}
          frequentIds={frequentIds}
        />
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
  amountBlock: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  amountLabel: {
    ...typography.label,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  amountValue: {
    ...typography.amount,
    color: colors.text,
    marginTop: spacing.xs,
  },
  fields: { flex: 1 },
  fieldsContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  label: {
    ...typography.label,
    color: colors.textMuted,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleLabel: { ...typography.body, color: colors.text },
  iosPickerWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingBottom: spacing.lg,
  },
  iosPickerHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    padding: spacing.md,
  },
});
