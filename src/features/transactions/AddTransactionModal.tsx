import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '@/ui/tokens';
import { NumericKeypad } from '@/ui/NumericKeypad';
import { supabase } from '@/lib/supabase';
import { CategorySheet } from '@/features/categories/CategorySheet';
import { useCategories } from '@/features/categories/useCategories';
import type { CategoryOption } from '@/features/categories/types';
import {
  fetchFrequentCategoryIds,
  fetchRecentCategoryIds,
  fetchRecentTransactionSuggestions,
  resolveSuggestedCategory,
  upsertAiRule,
  type SuggestedCategoryResult,
} from './suggestions';
import { currencyOptions, convertToDkk } from '@/lib/currency';
import { getDeviceCountryIso, getDeviceCurrencyCode } from '@/lib/device';
import { formatDateLabel, formatMinor } from '@/lib/format';
import { activeCycle, buildSalaryCycles } from '@/lib/cycles';
import type { TransactionDraft, TransactionInsert, TransactionKind, TransactionRow } from './types';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
  draft?: (TransactionDraft & { category?: CategoryOption | null }) | null;
};

type SuggestionState = SuggestedCategoryResult & {
  category: CategoryOption;
};

type SaveState = {
  editing: boolean;
  title: string;
  lastDraft: TransactionDraft;
};

type BudgetIndicator = {
  tone: 'neutral' | 'warning' | 'critical';
  label: string;
};

const participantOptions = [
  { label: 'Me', value: 'me' },
  { label: 'GF', value: 'gf' },
] as const;

const todayIso = (): string => {
  const date = new Date();
  return date.toISOString().slice(0, 10);
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

const parseAmountMinor = (raw: string): number | null => {
  const normalized = raw.trim().replace(',', '.');
  if (!normalized) return null;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100);
};

const minorToInput = (minor: number | undefined): string =>
  typeof minor === 'number' && minor > 0 ? (minor / 100).toFixed(2) : '';

const formatAmountDisplay = (raw: string): string => {
  if (raw.length === 0) return '0.00';
  const normalized = raw.trim().replace(',', '.');
  const value = Number(normalized);
  if (!Number.isFinite(value)) return raw;
  return value.toFixed(2);
};

const buildBudgetIndicators = async (
  categoryOptions: readonly CategoryOption[],
): Promise<Record<string, BudgetIndicator>> => {
  const salaryRes = await supabase
    .from('transactions')
    .select('id, occurred_on')
    .eq('is_salary', true)
    .order('occurred_on', { ascending: true });
  if (salaryRes.error) return {};

  const cycle = activeCycle(
    buildSalaryCycles((salaryRes.data ?? []) as { id: string; occurred_on: string }[]),
  );
  if (!cycle) return {};

  const endDate = cycle.endOnExclusive ?? '9999-12-31';
  const [budgetsRes, txnsRes] = await Promise.all([
    supabase
      .from('budgets')
      .select('category_id, amount_minor')
      .eq('salary_cycle_id', cycle.id),
    supabase
      .from('transactions')
      .select('amount_minor, occurred_on, category_id, shared, is_shared_topup, kind')
      .eq('kind', 'expense')
      .gte('occurred_on', cycle.startOn)
      .lt('occurred_on', endDate),
  ]);

  if (budgetsRes.error || txnsRes.error) return {};

  const parentByCategoryId = new Map(categoryOptions.map((option) => [option.id, option.parentId]));
  const spendByCategory = new Map<string, number>();
  for (const row of txnsRes.data ?? []) {
    if (!row.category_id || row.shared || row.is_shared_topup) continue;
    spendByCategory.set(row.category_id, (spendByCategory.get(row.category_id) ?? 0) + row.amount_minor);
    const parentId = parentByCategoryId.get(row.category_id);
    if (parentId) {
      spendByCategory.set(parentId, (spendByCategory.get(parentId) ?? 0) + row.amount_minor);
    }
  }

  const out: Record<string, BudgetIndicator> = {};
  for (const budget of budgetsRes.data ?? []) {
    const spentMinor = spendByCategory.get(budget.category_id) ?? 0;
    const ratio = budget.amount_minor === 0 ? 0 : spentMinor / budget.amount_minor;
    out[budget.category_id] = {
      tone: ratio >= 1 ? 'critical' : ratio >= 0.8 ? 'warning' : 'neutral',
      label: `${Math.round(ratio * 100)}%`,
    };
  }
  return out;
};

export default function AddTransactionModal({ visible, onClose, onSaved, draft }: Props) {
  const insets = useSafeAreaInsets();
  const [kind, setKind] = useState<TransactionKind>('expense');
  const [amount, setAmount] = useState('');
  const [currencyCode, setCurrencyCode] = useState('DKK');
  const [category, setCategory] = useState<CategoryOption | null>(null);
  const [name, setName] = useState('');
  const [comment, setComment] = useState('');
  const [date, setDate] = useState(todayIso());
  const [countryIso, setCountryIso] = useState('DK');
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [recurring, setRecurring] = useState(false);
  const [shared, setShared] = useState(false);
  const [sharedParticipant, setSharedParticipant] = useState<'me' | 'gf'>('me');
  const [isSalary, setIsSalary] = useState(false);
  const [isSharedTopup, setIsSharedTopup] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [frequentIds, setFrequentIds] = useState<string[]>([]);
  const [recentCategoryIds, setRecentCategoryIds] = useState<string[]>([]);
  const [budgetStateByCategory, setBudgetStateByCategory] = useState<Record<string, BudgetIndicator>>({});
  const [userTouchedCategory, setUserTouchedCategory] = useState(false);
  const [suggestion, setSuggestion] = useState<SuggestionState | null>(null);
  const [recentSuggestions, setRecentSuggestions] = useState<TransactionRow[]>([]);
  const [saveState, setSaveState] = useState<SaveState | null>(null);
  const categoriesState = useCategories();

  const categoryOptions = useMemo(
    () => (categoriesState.status === 'ready' ? categoriesState.options : []),
    [categoriesState],
  );

  const editing = Boolean(draft?.id);
  const suggestionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reset = (nextDraft?: TransactionDraft | null): void => {
    const deviceCountry = (nextDraft?.country_iso ?? getDeviceCountryIso() ?? 'DK').toUpperCase();
    const deviceCurrency = nextDraft?.currency_code ?? getDeviceCurrencyCode();
    const nextCategory =
      nextDraft?.category_id
        ? categoryOptions.find((option) => option.id === nextDraft.category_id) ?? null
        : null;
    setKind(nextDraft?.kind ?? 'expense');
    setAmount(minorToInput(nextDraft?.original_amount_minor ?? nextDraft?.amount_minor));
    setCurrencyCode(deviceCurrency);
    setCategory(nextCategory);
    setName(nextDraft?.name ?? '');
    setComment(nextDraft?.comment ?? '');
    setDate(nextDraft?.occurred_on ?? todayIso());
    setCountryIso(deviceCountry);
    setRecurring(nextDraft?.recurring ?? false);
    setShared(nextDraft?.shared ?? false);
    setSharedParticipant(nextDraft?.shared_participant ?? 'me');
    setIsSalary(nextDraft?.is_salary ?? false);
    setIsSharedTopup(nextDraft?.is_shared_topup ?? false);
    setPickerOpen(false);
    setValidationMessage(null);
    setUserTouchedCategory(Boolean(nextDraft?.category_id));
    setSuggestion(null);
    setRecentSuggestions([]);
    setSaveState(null);
  };

  useEffect(() => {
    if (!visible) return;
    reset(draft ?? null);
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, [visible, draft]);

  useEffect(() => {
    if (!visible || categoryOptions.length === 0) return;
    if (draft?.category) {
      setCategory(draft.category);
      return;
    }
    if (draft?.category_id) {
      const match = categoryOptions.find((option) => option.id === draft.category_id);
      if (match) setCategory(match);
    }
  }, [categoryOptions, draft?.category, draft?.category_id, visible]);

  useEffect(() => {
    if (!visible || categoryOptions.length === 0) return;
    void Promise.all([
      fetchFrequentCategoryIds(),
      fetchRecentCategoryIds(),
      buildBudgetIndicators(categoryOptions),
    ]).then(([frequent, recent, indicators]) => {
      setFrequentIds(frequent);
      setRecentCategoryIds(recent);
      setBudgetStateByCategory(indicators);
    });
  }, [categoryOptions, visible]);

  useEffect(() => {
    if (!visible) return;
    if (recentTimer.current) clearTimeout(recentTimer.current);
    const q = name.trim();
    if (q.length < 1) {
      setRecentSuggestions([]);
      return;
    }

    recentTimer.current = setTimeout(async () => {
      const rows = await fetchRecentTransactionSuggestions(q);
      setRecentSuggestions(rows.filter((row) => row.id !== draft?.id));
    }, 220);

    return () => {
      if (recentTimer.current) clearTimeout(recentTimer.current);
    };
  }, [draft?.id, name, visible]);

  useEffect(() => {
    if (!visible || kind !== 'expense' || categoryOptions.length === 0) {
      setSuggestion(null);
      return;
    }
    if (suggestionTimer.current) clearTimeout(suggestionTimer.current);
    const q = name.trim();
    if (q.length < 2) {
      setSuggestion(null);
      return;
    }

    suggestionTimer.current = setTimeout(async () => {
      const result = await resolveSuggestedCategory(
        q,
        comment.trim().length > 0 ? comment.trim() : null,
        categoryOptions.map((option) => ({
          id: option.id,
          parent: option.parentName,
          name: option.name,
        })),
      );
      if (!result) {
        setSuggestion(null);
        return;
      }
      const match = categoryOptions.find((option) => option.id === result.categoryId);
      if (!match) return;
      const nextSuggestion: SuggestionState = { ...result, category: match };
      setSuggestion(nextSuggestion);
      if (!userTouchedCategory && result.confidence >= 0.84) {
        setCategory(match);
      }
    }, 420);

    return () => {
      if (suggestionTimer.current) clearTimeout(suggestionTimer.current);
    };
  }, [categoryOptions, comment, kind, name, userTouchedCategory, visible]);

  const handleClose = (): void => {
    reset(null);
    onClose();
  };

  const handleSave = async (): Promise<void> => {
    const originalAmountMinor = parseAmountMinor(amount);
    if (originalAmountMinor === null) {
      setValidationMessage('Enter an amount greater than zero.');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    if (kind === 'expense' && !category) {
      setValidationMessage('Pick a category before saving this expense.');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    if (name.trim().length === 0) {
      setValidationMessage('Give the transaction a short name.');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    setSaving(true);
    setValidationMessage(null);
    try {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData.user) {
        setValidationMessage('You need to be signed in to save.');
        return;
      }

      const conversion =
        currencyCode === 'DKK'
          ? { convertedMinor: originalAmountMinor, rate: 1 }
          : await convertToDkk(originalAmountMinor, currencyCode, date);

      const payload: TransactionInsert = {
        user_id: userData.user.id,
        kind,
        amount_minor: conversion.convertedMinor,
        occurred_on: date,
        name: name.trim(),
        comment: comment.trim().length > 0 ? comment.trim() : null,
        category_id: kind === 'expense' ? category?.id ?? null : null,
        country_iso: countryIso.trim().length > 0 ? countryIso.trim().toUpperCase() : null,
        recurring,
        shared: kind === 'expense' && !isSharedTopup ? shared : false,
        shared_participant:
          kind === 'expense' && !isSharedTopup && shared ? sharedParticipant : null,
        is_salary: kind === 'income' ? isSalary : false,
        is_shared_topup: kind === 'expense' ? isSharedTopup : false,
        currency_code: currencyCode,
        original_amount_minor: originalAmountMinor,
        converted_amount_minor: conversion.convertedMinor,
        fx_rate: conversion.rate,
      };

      const query = draft?.id
        ? supabase.from('transactions').update(payload).eq('id', draft.id)
        : supabase.from('transactions').insert(payload);
      const { error } = await query;
      if (error) {
        setValidationMessage('Could not save the transaction right now.');
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }

      if (suggestion && userTouchedCategory && category && category.id !== suggestion.category.id) {
        await upsertAiRule({
          patternKey: suggestion.patternKey,
          categoryId: category.id,
          isBlocked: false,
        });
      }

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSaved();

      const nextDraft: TransactionDraft = {
        kind,
        amount_minor: conversion.convertedMinor,
        original_amount_minor: originalAmountMinor,
        currency_code: currencyCode,
        category_id: category?.id ?? null,
        name: name.trim(),
        comment: comment.trim().length > 0 ? comment.trim() : null,
        occurred_on: date,
        recurring,
        shared,
        shared_participant: shared ? sharedParticipant : null,
        is_salary: isSalary,
        is_shared_topup: isSharedTopup,
        country_iso: countryIso,
      };

      if (draft?.id) {
        setSaveState({ editing: true, title: 'Changes saved', lastDraft: nextDraft });
        closeTimer.current = setTimeout(() => {
          setSaveState(null);
          handleClose();
        }, 700);
        return;
      }

      setSaveState({ editing: false, title: 'Saved', lastDraft: nextDraft });
    } catch (error) {
      setValidationMessage(error instanceof Error ? error.message : 'Could not save the transaction.');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSaving(false);
    }
  };

  const onDateChange = (event: DateTimePickerEvent, selected?: Date): void => {
    if (Platform.OS === 'android') setDatePickerOpen(false);
    if (event.type === 'dismissed') return;
    if (selected) setDate(toIsoDate(selected));
  };

  const applyRecentSuggestion = (row: TransactionRow): void => {
    setName(row.name);
    setComment(row.comment ?? '');
    setDate(row.occurred_on);
    setRecurring(row.recurring);
    setShared(row.shared);
    setSharedParticipant(row.shared_participant ?? 'me');
    setIsSalary(row.is_salary);
    setIsSharedTopup(row.is_shared_topup);
    setCurrencyCode(row.currency_code);
    setAmount(minorToInput(row.original_amount_minor));
    setCountryIso(row.country_iso ?? countryIso);
    const match = categoryOptions.find((option) => option.id === row.category_id);
    if (match) {
      setCategory(match);
      setUserTouchedCategory(true);
    }
  };

  const visibleCategoryLabel = category ? `${category.parentName} · ${category.name}` : 'Pick a category';

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={handleClose}>
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={[styles.header, { paddingTop: Math.max(insets.top, spacing.md) }]}>
          <Pressable onPress={handleClose} hitSlop={12}>
            <Text style={styles.headerAction}>Cancel</Text>
          </Pressable>
          <Text style={styles.headerTitle}>{editing ? 'Edit transaction' : 'New transaction'}</Text>
          <Pressable onPress={() => void handleSave()} disabled={saving} hitSlop={12}>
            <Text style={[styles.headerAction, styles.headerSave, saving && styles.disabled]}>
              {saving ? 'Saving' : 'Save'}
            </Text>
          </Pressable>
        </View>

        <View style={styles.amountHero}>
          <View style={styles.kindRow}>
            <Pressable
              style={[styles.kindChip, kind === 'expense' && styles.kindChipActive]}
              onPress={() => {
                setKind('expense');
                setIsSalary(false);
              }}
            >
              <Text style={[styles.kindChipText, kind === 'expense' && styles.kindChipTextActive]}>Expense</Text>
            </Pressable>
            <Pressable
              style={[styles.kindChip, kind === 'income' && styles.kindChipActive]}
              onPress={() => {
                setKind('income');
                setShared(false);
                setIsSharedTopup(false);
                setCategory(null);
              }}
            >
              <Text style={[styles.kindChipText, kind === 'income' && styles.kindChipTextActive]}>Income</Text>
            </Pressable>
          </View>
          <Text style={styles.amountValue}>{formatAmountDisplay(amount)}</Text>
          <Text style={styles.amountMeta}>
            {currencyCode === 'DKK'
              ? 'Stored directly in DKK'
              : `Stored as fixed DKK on save · entered in ${currencyCode}`}
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.currencyRow}>
            {currencyOptions.map((currency) => {
              const active = currency.code === currencyCode;
              return (
                <Pressable
                  key={currency.code}
                  style={({ pressed }) => [
                    styles.currencyChip,
                    active && styles.currencyChipActive,
                    pressed && styles.rowPressed,
                  ]}
                  onPress={() => setCurrencyCode(currency.code)}
                >
                  <Text style={[styles.currencyChipText, active && styles.currencyChipTextActive]}>
                    {currency.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <ScrollView
          style={styles.fields}
          contentContainerStyle={styles.fieldsContent}
          keyboardShouldPersistTaps="handled"
        >
          {kind === 'expense' ? (
            <>
              <Text style={styles.label}>Category</Text>
              <Pressable
                style={styles.fieldCard}
                onPress={() => {
                  setUserTouchedCategory(true);
                  setPickerOpen(true);
                }}
              >
                <Text style={[styles.fieldText, !category && styles.placeholder]}>{visibleCategoryLabel}</Text>
                <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textMuted} />
              </Pressable>
            </>
          ) : null}

          {suggestion ? (
            <View style={styles.suggestionCard}>
              <View style={styles.suggestionHead}>
                <Text style={styles.suggestionTitle}>
                  Suggested {suggestion.category.parentName} · {suggestion.category.name}
                </Text>
                <Text style={styles.suggestionConfidence}>{Math.round(suggestion.confidence * 100)}%</Text>
              </View>
              <Text style={styles.suggestionMeta}>
                {suggestion.source === 'memory'
                  ? 'Learned from your past correction.'
                  : suggestion.source === 'history'
                    ? 'Based on your local history first.'
                    : 'Fallback AI suggestion.'}
              </Text>
              <View style={styles.actionRow}>
                <Pressable
                  style={({ pressed }) => [styles.smallAction, pressed && styles.rowPressed]}
                  onPress={() => {
                    setCategory(suggestion.category);
                    setUserTouchedCategory(true);
                  }}
                >
                  <Text style={styles.smallActionText}>Use this</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.smallActionMuted, pressed && styles.rowPressed]}
                  onPress={() => {
                    void upsertAiRule({
                      patternKey: suggestion.patternKey,
                      categoryId: null,
                      isBlocked: true,
                    });
                    setSuggestion(null);
                  }}
                >
                  <Text style={styles.smallActionText}>Don't suggest again</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          <Text style={styles.label}>Name</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="What was it?"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            returnKeyType="done"
          />

          {recentSuggestions.length > 0 ? (
            <View style={styles.recentList}>
              {recentSuggestions.slice(0, 4).map((row) => (
                <Pressable
                  key={row.id}
                  style={({ pressed }) => [styles.recentCard, pressed && styles.rowPressed]}
                  onPress={() => applyRecentSuggestion(row)}
                >
                  <View style={styles.recentCopy}>
                    <Text style={styles.recentTitle}>{row.name}</Text>
                    <Text style={styles.recentMeta}>
                      {row.currency_code !== 'DKK'
                        ? `${formatMinor(row.converted_amount_minor)} · ${formatMinor(row.original_amount_minor, row.currency_code)}`
                        : formatMinor(row.amount_minor)}
                    </Text>
                  </View>
                  <MaterialCommunityIcons name="history" size={18} color={colors.textMuted} />
                </Pressable>
              ))}
            </View>
          ) : null}

          <Text style={styles.label}>Details</Text>
          <View style={styles.detailRow}>
            <Pressable style={[styles.fieldCard, styles.detailCard]} onPress={() => setDatePickerOpen(true)}>
              <Text style={styles.fieldText}>{formatDateLabel(date)}</Text>
            </Pressable>
            <TextInput
              value={countryIso}
              onChangeText={(value) => setCountryIso(value.toUpperCase().slice(0, 2))}
              placeholder="DK"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={2}
              style={[styles.input, styles.detailCard]}
            />
          </View>

          <Text style={styles.label}>Comment</Text>
          <TextInput
            value={comment}
            onChangeText={setComment}
            placeholder="Optional"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />

          <Text style={styles.label}>Flags</Text>
          <View style={styles.actionRow}>
            <Pressable
              style={({ pressed }) => [styles.toggleChip, recurring && styles.toggleChipActive, pressed && styles.rowPressed]}
              onPress={() => setRecurring((current) => !current)}
            >
              <Text style={styles.toggleChipText}>Recurring</Text>
            </Pressable>
            {kind === 'expense' ? (
              <>
                <Pressable
                  style={({ pressed }) => [styles.toggleChip, shared && styles.toggleChipActive, pressed && styles.rowPressed]}
                  onPress={() => {
                    setShared((current) => {
                      const next = !current;
                      if (next) setIsSharedTopup(false);
                      return next;
                    });
                  }}
                >
                  <Text style={styles.toggleChipText}>Shared expense</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.toggleChip, isSharedTopup && styles.toggleChipActive, pressed && styles.rowPressed]}
                  onPress={() => {
                    setIsSharedTopup((current) => {
                      const next = !current;
                      if (next) setShared(false);
                      return next;
                    });
                  }}
                >
                  <Text style={styles.toggleChipText}>Shared top-up</Text>
                </Pressable>
              </>
            ) : (
              <Pressable
                style={({ pressed }) => [styles.toggleChip, isSalary && styles.toggleChipActive, pressed && styles.rowPressed]}
                onPress={() => setIsSalary((current) => !current)}
              >
                <Text style={styles.toggleChipText}>Salary cycle</Text>
              </Pressable>
            )}
          </View>

          {kind === 'expense' && shared && !isSharedTopup ? (
            <>
              <Text style={styles.label}>Shared participant</Text>
              <View style={styles.actionRow}>
                {participantOptions.map((option) => {
                  const active = sharedParticipant === option.value;
                  return (
                    <Pressable
                      key={option.value}
                      style={({ pressed }) => [styles.toggleChip, active && styles.toggleChipActive, pressed && styles.rowPressed]}
                      onPress={() => setSharedParticipant(option.value)}
                    >
                      <Text style={styles.toggleChipText}>{option.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : null}

          {validationMessage ? <Text style={styles.validation}>{validationMessage}</Text> : null}
        </ScrollView>

        <View style={styles.bottomBar}>
          <Pressable
            style={({ pressed }) => [styles.primaryButton, (pressed || saving) && styles.rowPressed]}
            onPress={() => void handleSave()}
            disabled={saving}
          >
            <Text style={styles.primaryButtonText}>{editing ? 'Save changes' : 'Save transaction'}</Text>
          </Pressable>
        </View>

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
              <DateTimePicker value={parseIsoDate(date)} mode="date" display="default" onChange={onDateChange} />
            )}
          </>
        )}

        <CategorySheet
          visible={pickerOpen}
          onClose={() => setPickerOpen(false)}
          onSelect={(option) => {
            setCategory(option);
            setUserTouchedCategory(true);
          }}
          frequentIds={frequentIds}
          recentIds={recentCategoryIds}
          selectedId={category?.id ?? null}
          budgetStateByCategory={budgetStateByCategory}
        />

        {saveState ? (
          <View style={styles.successOverlay}>
            <View style={styles.successCard}>
              <View style={styles.successIconWrap}>
                <MaterialCommunityIcons name="check" size={28} color={colors.success} />
              </View>
              <Text style={styles.successTitle}>{saveState.title}</Text>
              {!saveState.editing ? (
                <>
                  <Text style={styles.successMeta}>Choose what you want to do next.</Text>
                  <View style={styles.successActions}>
                    <Pressable
                      style={({ pressed }) => [styles.successButton, pressed && styles.rowPressed]}
                      onPress={handleClose}
                    >
                      <Text style={styles.successButtonText}>Done</Text>
                    </Pressable>
                    <Pressable
                      style={({ pressed }) => [styles.successButton, pressed && styles.rowPressed]}
                      onPress={() =>
                        reset({
                          kind: saveState.lastDraft.kind,
                          currency_code: saveState.lastDraft.currency_code,
                          category_id: saveState.lastDraft.category_id,
                          occurred_on: saveState.lastDraft.occurred_on,
                          recurring: saveState.lastDraft.recurring,
                          shared: saveState.lastDraft.shared,
                          shared_participant: saveState.lastDraft.shared_participant,
                          is_salary: saveState.lastDraft.is_salary,
                          is_shared_topup: saveState.lastDraft.is_shared_topup,
                          country_iso: saveState.lastDraft.country_iso,
                        })
                      }
                    >
                      <Text style={styles.successButtonText}>Save and add another</Text>
                    </Pressable>
                    <Pressable
                      style={({ pressed }) => [styles.successButton, pressed && styles.rowPressed]}
                      onPress={() => reset(saveState.lastDraft)}
                    >
                      <Text style={styles.successButtonText}>Duplicate last</Text>
                    </Pressable>
                  </View>
                </>
              ) : null}
            </View>
          </View>
        ) : null}
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
    paddingBottom: spacing.md,
  },
  headerTitle: { ...typography.body, color: colors.text, fontWeight: '700' },
  headerAction: { ...typography.body, color: colors.textMuted },
  headerSave: { color: colors.accent, fontWeight: '700' },
  disabled: { opacity: 0.5 },
  amountHero: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  kindRow: { flexDirection: 'row', gap: spacing.sm },
  kindChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  kindChipActive: { backgroundColor: colors.accent },
  kindChipText: { ...typography.label, color: colors.textMuted },
  kindChipTextActive: { color: colors.text },
  amountValue: { ...typography.amount, color: colors.text },
  amountMeta: { ...typography.label, color: colors.textMuted },
  currencyRow: { gap: spacing.sm, paddingTop: spacing.xs },
  currencyChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  currencyChipActive: {
    backgroundColor: 'rgba(124,92,255,0.18)',
    borderColor: colors.accent,
  },
  currencyChipText: { ...typography.label, color: colors.textMuted },
  currencyChipTextActive: { color: colors.text },
  fields: { flex: 1 },
  fieldsContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.sm },
  label: {
    ...typography.label,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.sm,
  },
  fieldCard: {
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fieldText: { ...typography.body, color: colors.text },
  placeholder: { color: colors.textMuted },
  input: {
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.text,
    ...typography.body,
  },
  suggestionCard: {
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    gap: spacing.xs,
  },
  suggestionHead: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  suggestionTitle: { ...typography.body, color: colors.text, flex: 1, fontWeight: '600' },
  suggestionConfidence: { ...typography.label, color: colors.accent, fontWeight: '700' },
  suggestionMeta: { ...typography.label, color: colors.textMuted },
  actionRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  smallAction: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  smallActionMuted: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
  },
  smallActionText: { ...typography.label, color: colors.text },
  recentList: { gap: spacing.sm },
  recentCard: {
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  recentCopy: { flex: 1, gap: 2 },
  recentTitle: { ...typography.body, color: colors.text, fontWeight: '600' },
  recentMeta: { ...typography.label, color: colors.textMuted },
  detailRow: { flexDirection: 'row', gap: spacing.sm },
  detailCard: { flex: 1 },
  toggleChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  toggleChipActive: { backgroundColor: 'rgba(124,92,255,0.18)' },
  toggleChipText: { ...typography.label, color: colors.text },
  validation: { ...typography.label, color: colors.danger, marginTop: spacing.sm },
  bottomBar: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  primaryButton: {
    borderRadius: radius.lg,
    backgroundColor: colors.accent,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  primaryButtonText: { ...typography.body, color: colors.text, fontWeight: '700' },
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
  successOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.48)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  successCard: {
    width: '100%',
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    padding: spacing.xl,
    gap: spacing.md,
  },
  successIconWrap: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(61,214,140,0.16)',
    alignSelf: 'center',
  },
  successTitle: { ...typography.h2, color: colors.text, textAlign: 'center' },
  successMeta: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
  successActions: { gap: spacing.sm },
  successButton: {
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  successButtonText: { ...typography.body, color: colors.text, fontWeight: '600' },
  rowPressed: { opacity: 0.86 },
});
