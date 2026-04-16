import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '@/ui/tokens';
import { NumericKeypad } from '@/ui/NumericKeypad';
import { supabase } from '@/lib/supabase';
import { CategorySheet } from '@/features/categories/CategorySheet';
import { useCategories } from '@/features/categories/useCategories';
import type { CategoryOption } from '@/features/categories/types';
import {
  findSalaryCategoryOption,
  findOtherIncomeCategoryOption,
  findSharedTopupCategoryOption,
  normalizeIncomeCategoryOption,
  isIncomeCategoryOption,
  isMobilePayCategoryOption,
  isSalaryCategoryOption,
} from '@/features/categories/rules';
import { getCategoryDisplayColor } from '@/features/categories/helpers';
import {
  fetchFrequentCategoryIds,
  fetchRecentCategoryIds,
  fetchRecentTransactionSuggestions,
  formatMerchantCategorySource,
  AI_AUTO_APPLY_CONFIDENCE,
  resolveSuggestedCategory,
  saveMerchantMemoryObservation,
  upsertMerchantRule,
  type SuggestedCategoryResult,
} from './suggestions';
import { convertToDkk } from '@/lib/currency';
import { getDeviceCountryIso, getDeviceCurrencyCode, getLiveCountryIso } from '@/lib/device';
import { runDetached } from '@/lib/async';
import { formatCountryFlag, formatDateLabel, formatMinor, normalizeCountryIso } from '@/lib/format';
import { activeCycle, buildSalaryCycles } from '@/lib/cycles';
import { fetchTransferPeople, normalizeTransferPersonName } from '@/features/transfers/people';
import type { TransferPersonRow } from '@/features/transfers/types';
import { ImportReviewModal } from '@/features/transactions/composer/components/ImportReviewModal';
import {
  SharedTopupParticipantSelector,
  TransactionCurrencySelector,
  TransactionFieldLabel,
  TransactionKindSelector,
  TransactionPickerField,
  TransactionTextField,
} from '@/features/transactions/composer/components/TransactionFormFields';
import {
  importTransactionsFromCsv,
  importTransactionsFromImage,
  type ImportedTransactionDraft,
  type SkippedImportedTransaction,
} from './imageImport';
import { shouldAutoMarkSharedTopup } from './merchantIntelligence';
import { isCsvImportFile, readCsvImportText, type CsvImportFile, type PendingImport } from './importFiles';
import type { TransactionDraft, TransactionInsert, TransactionKind, TransactionRow } from './types';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
  draft?: (TransactionDraft & { category?: CategoryOption | null }) | null;
  pendingImport?: PendingImport | null;
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

const countryOptions = [
  { code: 'DK', label: 'Denmark' },
  { code: 'SE', label: 'Sweden' },
  { code: 'NO', label: 'Norway' },
  { code: 'DE', label: 'Germany' },
  { code: 'PL', label: 'Poland' },
  { code: 'GB', label: 'United Kingdom' },
  { code: 'US', label: 'United States' },
  { code: 'FR', label: 'France' },
  { code: 'ES', label: 'Spain' },
  { code: 'IT', label: 'Italy' },
  { code: 'NL', label: 'Netherlands' },
  { code: 'CH', label: 'Switzerland' },
  { code: 'CZ', label: 'Czechia' },
  { code: 'HU', label: 'Hungary' },
  { code: 'RO', label: 'Romania' },
  { code: 'UA', label: 'Ukraine' },
  { code: 'JP', label: 'Japan' },
  { code: 'AU', label: 'Australia' },
  { code: 'CA', label: 'Canada' },
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

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const animateKeypadLayout = (): void => {
  LayoutAnimation.configureNext({
    duration: 220,
    create: {
      type: LayoutAnimation.Types.easeInEaseOut,
      property: LayoutAnimation.Properties.opacity,
    },
    update: {
      type: LayoutAnimation.Types.easeInEaseOut,
    },
    delete: {
      type: LayoutAnimation.Types.easeInEaseOut,
      property: LayoutAnimation.Properties.opacity,
    },
  });
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

const highlightedAmount = (raw: string): { display: string; activeIndex: number | null } => {
  const display = formatAmountDisplay(raw);
  const normalized = raw.trim().replace(',', '.');
  const displayDotAt = display.indexOf('.');

  if (normalized.endsWith('.')) {
    return { display, activeIndex: displayDotAt >= 0 ? displayDotAt + 1 : null };
  }

  let rawIndex = normalized.length - 1;

  while (rawIndex >= 0 && !/[0-9]/.test(normalized[rawIndex] ?? '')) {
    rawIndex -= 1;
  }

  if (rawIndex < 0) return { display, activeIndex: null };

  return { display, activeIndex: rawIndex };
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

export default function AddTransactionModal({ visible, onClose, onSaved, draft, pendingImport }: Props) {
  const insets = useSafeAreaInsets();
  const [kind, setKind] = useState<TransactionKind>('expense');
  const [amount, setAmount] = useState('');
  const [currencyCode, setCurrencyCode] = useState('DKK');
  const [category, setCategory] = useState<CategoryOption | null>(null);
  const [name, setName] = useState('');
  const [comment, setComment] = useState('');
  const [date, setDate] = useState(todayIso());
  const [lastCreatedDate, setLastCreatedDate] = useState(todayIso());
  const [countryIso, setCountryIso] = useState('DK');
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [countryPickerOpen, setCountryPickerOpen] = useState(false);
  const [keypadOpen, setKeypadOpen] = useState(true);
  const [recurring, setRecurring] = useState(false);
  const [shared, setShared] = useState(false);
  const [sharedParticipant, setSharedParticipant] = useState<'me' | 'gf'>('me');
  const [isSharedTopup, setIsSharedTopup] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [frequentIds, setFrequentIds] = useState<string[]>([]);
  const [recentCategoryIds, setRecentCategoryIds] = useState<string[]>([]);
  const [budgetStateByCategory, setBudgetStateByCategory] = useState<Record<string, BudgetIndicator>>({});
  const [userTouchedCategory, setUserTouchedCategory] = useState(false);
  const [suggestion, setSuggestion] = useState<SuggestionState | null>(null);
  const [isSuggestingCategory, setIsSuggestingCategory] = useState(false);
  const [recentSuggestions, setRecentSuggestions] = useState<TransactionRow[]>([]);
  const [saveState, setSaveState] = useState<SaveState | null>(null);
  const [imageImportDrafts, setImageImportDrafts] = useState<ImportedTransactionDraft[]>([]);
  const [imageImportVisible, setImageImportVisible] = useState(false);
  const [imageImportBusy, setImageImportBusy] = useState(false);
  const [csvImportBusy, setCsvImportBusy] = useState(false);
  const [imageImportSaving, setImageImportSaving] = useState(false);
  const [imageImportError, setImageImportError] = useState<string | null>(null);
  const [imageImportSkippedDuplicates, setImageImportSkippedDuplicates] = useState<SkippedImportedTransaction[]>([]);
  const [transferPeople, setTransferPeople] = useState<TransferPersonRow[]>([]);
  const categoriesState = useCategories();

  const categoryOptions = useMemo(
    () => (categoriesState.status === 'ready' ? categoriesState.options : []),
    [categoriesState],
  );
  const sharedTopupCategory = useMemo(
    () => findSharedTopupCategoryOption(categoryOptions),
    [categoryOptions],
  );

  const resolvedCategoryForSave = useMemo(() => {
    const base = kind === 'income' ? normalizeIncomeCategoryOption(category, categoryOptions) : category;
    if (kind === 'expense' && isSharedTopup) {
      return sharedTopupCategory ?? base;
    }
    return base;
  }, [category, categoryOptions, isSharedTopup, kind, sharedTopupCategory]);
  const amountMinorForSave = useMemo(() => parseAmountMinor(amount), [amount]);
  const canSave = Boolean(resolvedCategoryForSave && amountMinorForSave !== null);

  const editing = Boolean(draft?.id);
  const sharedFlowLocked = Boolean(draft?.from_shared_screen && !draft?.id);
  const sharedTopupEditFlow = Boolean(editing && draft?.kind === 'expense' && draft?.is_shared_topup);
  const useSharedFlowOptions = kind === 'expense' && (sharedFlowLocked || sharedTopupEditFlow);
  const amountDisplayState = useMemo(() => highlightedAmount(amount), [amount]);
  const selectedIsSalary = isSalaryCategoryOption(category);
  const selectedIsMobilePay = isMobilePayCategoryOption(category);
  const categoryAccentColor = category
    ? getCategoryDisplayColor({
      kind,
      parentName: category.parentName,
      name: category.name,
      parentColor: category.parentColor,
      color: category.color,
    })
    : colors.textMuted;
  const selectedTransferPerson = useMemo(() => {
    const normalizedName = normalizeTransferPersonName(name);
    if (!normalizedName) return null;
    return transferPeople.find((person) => person.normalized_name === normalizedName) ?? null;
  }, [name, transferPeople]);
  const recentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reopenKeypadAfterDatePicker = useRef(false);
  const autoAppliedCategoryId = useRef<string | null>(null);
  const suggestionRunId = useRef(0);
  const handledPendingImportId = useRef<string | null>(null);
  const suppressRecentSuggestionsName = useRef<string | null>(null);
  const lastSharedExpenseCategoryId = useRef<string | null>(null);

  const openKeypad = (): void => {
    if (keypadOpen) return;
    Keyboard.dismiss();
    animateKeypadLayout();
    setKeypadOpen(true);
  };

  const closeKeypad = (): void => {
    if (!keypadOpen) return;
    animateKeypadLayout();
    setKeypadOpen(false);
  };

  const toggleKeypad = (): void => {
    if (keypadOpen) {
      closeKeypad();
      return;
    }
    openKeypad();
  };

  const reset = (nextDraft?: TransactionDraft | null): void => {
    const nextDate = nextDraft?.occurred_on ?? lastCreatedDate;
    const deviceCountry = (nextDraft?.country_iso ?? getDeviceCountryIso() ?? 'DK').toUpperCase();
    const deviceCurrency = nextDraft?.currency_code ?? getDeviceCurrencyCode();
    const baseCategory =
      nextDraft?.category_id
        ? categoryOptions.find((option) => option.id === nextDraft.category_id) ?? null
        : nextDraft?.is_salary
          ? findSalaryCategoryOption(categoryOptions)
          : nextDraft?.kind === 'income'
            ? findOtherIncomeCategoryOption(categoryOptions)
            : null;
    const nextCategory =
      nextDraft?.kind === 'income'
        ? normalizeIncomeCategoryOption(baseCategory, categoryOptions)
        : isIncomeCategoryOption(baseCategory)
          ? null
          : baseCategory;
    setKind(nextDraft?.kind ?? 'expense');
    setAmount(minorToInput(nextDraft?.original_amount_minor ?? nextDraft?.amount_minor));
    setCurrencyCode(deviceCurrency);
    setCategory(nextCategory);
    setName(nextDraft?.name ?? '');
    setComment(nextDraft?.comment ?? '');
    setDate(nextDate);
    setCountryIso(deviceCountry);
    setDatePickerOpen(false);
    setCountryPickerOpen(false);
    setKeypadOpen(true);
    setRecurring(nextDraft?.recurring ?? false);
    const fromSharedCreate = Boolean(nextDraft?.from_shared_screen && !nextDraft?.id);
    let nextShared = nextDraft?.shared ?? false;
    let nextTopup = nextDraft?.is_shared_topup ?? false;
    if (fromSharedCreate) {
      if (nextDraft?.is_shared_topup) {
        nextTopup = true;
        nextShared = false;
      } else if (nextDraft?.shared) {
        nextShared = true;
        nextTopup = false;
      } else {
        nextShared = true;
        nextTopup = false;
      }
    }
    setShared(nextShared);
    setIsSharedTopup(nextTopup);
    setSharedParticipant(
      fromSharedCreate && nextShared && !nextTopup ? 'me' : (nextDraft?.shared_participant ?? 'me'),
    );
    setPickerOpen(false);
    setValidationMessage(null);
    setUserTouchedCategory(Boolean(nextDraft?.category_id));
    setSuggestion(null);
    setIsSuggestingCategory(false);
    setRecentSuggestions([]);
    setSaveState(null);
    setImageImportDrafts([]);
    setImageImportVisible(false);
    setImageImportBusy(false);
    setCsvImportBusy(false);
    setImageImportSaving(false);
    setImageImportError(null);
    setImageImportSkippedDuplicates([]);
    autoAppliedCategoryId.current = null;
    suppressRecentSuggestionsName.current = null;
    if (fromSharedCreate && nextShared && !nextTopup && nextCategory) {
      lastSharedExpenseCategoryId.current = nextCategory.id;
    } else {
      lastSharedExpenseCategoryId.current = null;
    }
  };

  useEffect(() => {
    if (!visible) return;
    reset(draft ?? null);
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, [visible, draft]);

  useEffect(() => {
    if (visible) return;
    handledPendingImportId.current = null;
  }, [visible]);

  useEffect(() => {
    if (!visible || draft?.country_iso) return;

    let cancelled = false;
    const localeCountry = (getDeviceCountryIso() ?? 'DK').toUpperCase();

    runDetached(getLiveCountryIso().then((liveCountry) => {
      if (cancelled || !liveCountry) return;
      setCountryIso((current) => (current === localeCountry ? liveCountry : current));
    }), 'transactions.liveCountry');

    return () => {
      cancelled = true;
    };
  }, [draft?.country_iso, visible]);

  useEffect(() => {
    if (!visible || categoryOptions.length === 0) return;
    if (draft?.category) {
      setCategory(draft.kind === 'income' ? normalizeIncomeCategoryOption(draft.category, categoryOptions) : draft.category);
      return;
    }
    if (draft?.is_salary && !draft?.category_id) {
      setCategory(findSalaryCategoryOption(categoryOptions));
      return;
    }
    if (draft?.category_id) {
      const match = categoryOptions.find((option) => option.id === draft.category_id);
      if (match) {
        setCategory(draft?.kind === 'income' ? normalizeIncomeCategoryOption(match, categoryOptions) : match);
      }
    }
  }, [categoryOptions, draft?.category, draft?.category_id, visible]);

  useEffect(() => {
    if (!visible || !isSharedTopup || !sharedTopupCategory) return;
    setCategory(sharedTopupCategory);
    setUserTouchedCategory(true);
  }, [visible, isSharedTopup, sharedTopupCategory]);

  useEffect(() => {
    if (!visible) return;
    runDetached(fetchTransferPeople().then((rows) => {
      setTransferPeople(rows);
    }), 'transactions.fetchTransferPeople');
  }, [visible]);

  useEffect(() => {
    if (!visible || categoryOptions.length === 0) return;
    runDetached(Promise.all([
      fetchFrequentCategoryIds(),
      fetchRecentCategoryIds(),
      buildBudgetIndicators(categoryOptions),
    ]).then(([frequent, recent, indicators]) => {
      setFrequentIds(frequent);
      setRecentCategoryIds(recent);
      setBudgetStateByCategory(indicators);
    }), 'transactions.bootstrapCategoryState');
  }, [categoryOptions, visible]);

  useEffect(() => {
    if (!visible || !pendingImport || editing || categoryOptions.length === 0) return;
    if (handledPendingImportId.current === pendingImport.id) return;

    handledPendingImportId.current = pendingImport.id;

    if (pendingImport.kind === 'csv') {
      void analyzeCsvImport({
        fileUri: pendingImport.fileUri,
        fileName: pendingImport.fileName,
        mimeType: pendingImport.mimeType,
      });
    }
  }, [categoryOptions.length, editing, pendingImport, visible]);

  useEffect(() => {
    const subscription = Keyboard.addListener('keyboardDidShow', () => {
      setKeypadOpen((current) => {
        if (!current) return current;
        animateKeypadLayout();
        return false;
      });
    });

    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!visible) return;
    if (recentTimer.current) clearTimeout(recentTimer.current);
    const q = name.trim();

    if (suppressRecentSuggestionsName.current && q !== suppressRecentSuggestionsName.current) {
      suppressRecentSuggestionsName.current = null;
    }

    if (q.length < 1) {
      setRecentSuggestions([]);
      return;
    }

    if (suppressRecentSuggestionsName.current === q) {
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

  const runCategorySuggestion = async ({
    preferRemote = false,
  }: {
    preferRemote?: boolean;
  } = {}): Promise<void> => {
    if (!visible || categoryOptions.length === 0) {
      setSuggestion(null);
      setIsSuggestingCategory(false);
      return;
    }
    if (isSharedTopup) {
      setSuggestion(null);
      setIsSuggestingCategory(false);
      return;
    }

    const trimmedName = name.trim();
    const trimmedComment = comment.trim();
    const lookupText = trimmedName.length >= 2 ? trimmedName : trimmedComment;

    if (lookupText.length < 2) {
      setSuggestion(null);
      setIsSuggestingCategory(false);
      if (!userTouchedCategory && category && autoAppliedCategoryId.current === category.id) {
        setCategory(null);
        autoAppliedCategoryId.current = null;
      }
      return;
    }

    const runId = ++suggestionRunId.current;
    setIsSuggestingCategory(true);
    const result = await resolveSuggestedCategory(
      lookupText,
      trimmedComment.length > 0 ? trimmedComment : null,
      categoryOptions.map((option) => ({
        id: option.id,
        parent: option.parentName,
        name: option.name,
        icon: option.icon,
      })),
      { kind, preferRemote },
    );

    if (runId !== suggestionRunId.current) return;
    setIsSuggestingCategory(false);

    if (!result) {
      setSuggestion(null);
      if (!userTouchedCategory && category && autoAppliedCategoryId.current === category.id) {
        setCategory(null);
        autoAppliedCategoryId.current = null;
      }
      return;
    }

    const match = categoryOptions.find((option) => option.id === result.categoryId);
    if (!match) {
      setSuggestion(null);
      return;
    }

    setSuggestion({ ...result, category: match });

    const shouldApply =
      !userTouchedCategory &&
      (result.source !== 'ai' || result.confidence >= AI_AUTO_APPLY_CONFIDENCE);
    if (shouldApply) {
      setCategory(match);
      if (kind === 'expense') {
        setIsSharedTopup((current) => current || result.isSharedTopup);
      }
      autoAppliedCategoryId.current = match.id;
    }
  };

  const acceptSuggestion = async (): Promise<void> => {
    if (!suggestion) return;

    autoAppliedCategoryId.current = null;
    setCategory(suggestion.category);
    setIsSharedTopup((current) => (kind === 'expense' ? current || suggestion.isSharedTopup : current));
    setUserTouchedCategory(true);

    const saved = await upsertMerchantRule({
      kind,
      pattern: suggestion.normalizedMerchant,
      categoryId: suggestion.category.id,
      canonicalMerchant: suggestion.canonicalMerchant,
      isBlocked: false,
      isSharedTopup: suggestion.isSharedTopup,
    });
    if (!saved) {
      setValidationMessage('Could not save this category preference right now.');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    setValidationMessage(null);
    setSuggestion(null);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const blockSuggestion = async (): Promise<void> => {
    if (!suggestion) return;

    const saved = await upsertMerchantRule({
      kind,
      pattern: suggestion.normalizedMerchant,
      categoryId: null,
      canonicalMerchant: suggestion.canonicalMerchant,
      isBlocked: true,
      isSharedTopup: false,
    });
    if (!saved) {
      setValidationMessage('Could not save this block right now.');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    setValidationMessage(null);
    if (!userTouchedCategory && category && autoAppliedCategoryId.current === category.id) {
      setCategory(null);
      autoAppliedCategoryId.current = null;
    }
    setSuggestion(null);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const updateImageImportDraft = (
    id: string,
    patch: Partial<ImportedTransactionDraft>,
  ): void => {
    setImageImportDrafts((current) =>
      current.map((draftRow) => (draftRow.id === id ? { ...draftRow, ...patch } : draftRow)),
    );
  };

  const categoryCandidates = useMemo(
    () =>
      categoryOptions.map((option) => ({
        id: option.id,
        parent: option.parentName,
        name: option.name,
        icon: option.icon,
      })),
    [categoryOptions],
  );

  const startImageImport = async (): Promise<void> => {
    if (editing || imageImportBusy || categoryOptions.length === 0) return;

    setImageImportBusy(true);
    setImageImportError(null);
    setImageImportSkippedDuplicates([]);
    setValidationMessage(null);

    try {
      // Use the platform picker directly instead of requesting full library access up front.
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: false,
        quality: 0.55,
        base64: true,
      });
      if (result.canceled || result.assets.length === 0) return;

      const asset = result.assets[0];
      if (!asset?.base64) {
        setValidationMessage('Could not read this image. Please try another one.');
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }

      const imageDataUrl = `data:${asset.mimeType ?? 'image/jpeg'};base64,${asset.base64}`;
      const imported = await importTransactionsFromImage({
        imageDataUrl,
        categories: categoryCandidates,
        fallbackDate: date,
      });

      if (imported.error) {
        setValidationMessage(imported.error);
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }

      setImageImportDrafts(imported.drafts);
      setImageImportSkippedDuplicates(imported.skippedDuplicates);
      setImageImportVisible(imported.drafts.length > 0 || imported.skippedDuplicates.length > 0);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      setValidationMessage(error instanceof Error ? error.message : 'Could not import transactions from this image.');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setImageImportBusy(false);
    }
  };

  const analyzeCsvImport = async (file: CsvImportFile): Promise<void> => {
    if (editing || csvImportBusy || categoryOptions.length === 0) return;

    setCsvImportBusy(true);
    setImageImportError(null);
    setImageImportSkippedDuplicates([]);
    setValidationMessage(null);

    try {
      const csvText = await readCsvImportText(file.fileUri);
      const imported = await importTransactionsFromCsv({
        csvText,
        fileName: file.fileName,
        categories: categoryCandidates,
        fallbackDate: date,
      });

      if (imported.error) {
        console.error('[csv-import] CSV analysis returned an error.', {
          fileName: file.fileName,
          mimeType: file.mimeType,
          fileUri: file.fileUri,
          error: imported.error,
        });
        setValidationMessage(imported.error);
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }

      setImageImportDrafts(imported.drafts);
      setImageImportSkippedDuplicates(imported.skippedDuplicates);
      setImageImportVisible(imported.drafts.length > 0 || imported.skippedDuplicates.length > 0);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error('[csv-import] CSV import crashed before completing.', {
        fileName: file.fileName,
        mimeType: file.mimeType,
        fileUri: file.fileUri,
        error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      });
      setValidationMessage(error instanceof Error ? error.message : 'Could not import transactions from this CSV.');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setCsvImportBusy(false);
    }
  };

  const pickCsvImport = async (): Promise<void> => {
    if (editing || csvImportBusy) return;

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'text/csv',
          'application/csv',
          'text/comma-separated-values',
          'application/vnd.ms-excel',
          'text/plain',
        ],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const file = {
        fileUri: asset.uri,
        fileName: asset.name ?? null,
        mimeType: asset.mimeType ?? null,
      } satisfies CsvImportFile;

      if (!isCsvImportFile(file)) {
        setValidationMessage('Please pick a CSV bank statement file.');
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }

      await analyzeCsvImport(file);
    } catch (error) {
      setValidationMessage(error instanceof Error ? error.message : 'Could not open this CSV file.');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const saveImportedTransactions = async (): Promise<void> => {
    if (imageImportDrafts.length === 0) {
      setImageImportError('No imported transactions to save.');
      return;
    }

    setImageImportSaving(true);
    setImageImportError(null);
    try {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData.user) {
        setImageImportError('You need to be signed in to save imported transactions.');
        return;
      }

      const payloads: TransactionInsert[] = [];
      const memoryObservations: {
        context: {
          kind: TransactionKind;
          name: string;
          comment: string | null;
          rawText: string | null;
          message: string | null;
          transactionType: string | null;
          sender: string | null;
          receiver: string | null;
          bankCategory: string | null;
        };
        categoryId: string;
        isSharedTopup: boolean;
        occurredOn: string;
      }[] = [];
      for (const row of imageImportDrafts) {
        const normalizedName = row.name.trim();
        if (normalizedName.length === 0) {
          setImageImportError('Each imported transaction needs a name.');
          return;
        }

        const originalAmountMinor = parseAmountMinor(row.amount);
        if (originalAmountMinor === null) {
          setImageImportError('Each imported transaction needs a valid amount.');
          return;
        }

        if (!/^\d{4}-\d{2}-\d{2}$/.test(row.occurredOn.trim())) {
          setImageImportError('Each imported transaction needs a valid date in YYYY-MM-DD format.');
          return;
        }

        if (row.kind !== 'income' && !row.categoryId) {
          setImageImportError('Each imported transaction needs a category before saving.');
          return;
        }

        const importCategory = normalizeIncomeCategoryOption(
          categoryOptions.find((option) => option.id === row.categoryId) ?? null,
          categoryOptions,
        );
        const resolvedCategory =
          row.kind === 'income'
            ? importCategory
            : categoryOptions.find((option) => option.id === row.categoryId) ?? null;
        if (!resolvedCategory) {
          setImageImportError(
            row.kind === 'income'
              ? 'Each imported income needs Salary, a Transfers category, or Income · Others.'
              : 'Each imported transaction needs a category before saving.',
          );
          return;
        }

        const conversion =
          row.currencyCode === 'DKK'
            ? { convertedMinor: originalAmountMinor, rate: 1 }
            : await convertToDkk(originalAmountMinor, row.currencyCode, row.occurredOn.trim());
        const isSharedTopup =
          row.kind === 'expense' &&
          (row.suggestedSharedTopup ||
            shouldAutoMarkSharedTopup({
              name: normalizedName,
              comment: row.comment,
              rawText: row.rawText,
            }));

        payloads.push({
          user_id: userData.user.id,
          kind: row.kind,
          amount_minor: conversion.convertedMinor,
          occurred_on: row.occurredOn.trim(),
          name: normalizedName,
          comment: row.comment.trim().length > 0 ? row.comment.trim() : null,
          category_id: resolvedCategory.id,
          country_iso: normalizeCountryIso(countryIso),
          recurring: false,
          shared: false,
          shared_participant: null,
          is_salary: row.kind === 'income' && isSalaryCategoryOption(resolvedCategory),
          is_shared_topup: isSharedTopup,
          currency_code: row.currencyCode,
          original_amount_minor: originalAmountMinor,
          converted_amount_minor: conversion.convertedMinor,
          fx_rate: conversion.rate,
        });

        memoryObservations.push({
          context: {
            kind: row.kind,
            name: normalizedName,
            comment: row.comment.trim().length > 0 ? row.comment.trim() : null,
            rawText: row.rawText.trim().length > 0 ? row.rawText.trim() : normalizedName,
            message: row.message.trim().length > 0 ? row.message.trim() : null,
            transactionType: row.transactionType.trim().length > 0 ? row.transactionType.trim() : null,
            sender: row.sender.trim().length > 0 ? row.sender.trim() : null,
            receiver: row.receiver.trim().length > 0 ? row.receiver.trim() : null,
            bankCategory: row.bankCategory.trim().length > 0 ? row.bankCategory.trim() : null,
          },
          categoryId: resolvedCategory.id,
          isSharedTopup,
          occurredOn: row.occurredOn.trim(),
        });
      }

      const { error } = await supabase.from('transactions').insert(payloads);
      if (error) {
        setImageImportError('Could not save imported transactions right now.');
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }

      await Promise.all(
        memoryObservations.map((observation) =>
          saveMerchantMemoryObservation({
            context: observation.context,
            categoryId: observation.categoryId,
            isSharedTopup: observation.isSharedTopup,
            occurredOn: observation.occurredOn,
          }),
        ),
      );

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Close the nested import modal first to avoid iOS modal teardown glitches.
      setImageImportVisible(false);
      setImageImportError(null);
      setImageImportSkippedDuplicates([]);
      onSaved();
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          handleClose();
        });
      });
    } catch (error) {
      setImageImportError(error instanceof Error ? error.message : 'Could not save imported transactions right now.');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setImageImportSaving(false);
    }
  };

  const handleClose = (): void => {
    reset(null);
    onClose();
  };

  const closeDatePicker = (): void => {
    setDatePickerOpen(false);
    if (reopenKeypadAfterDatePicker.current) {
      openKeypad();
      reopenKeypadAfterDatePicker.current = false;
    }
  };

  const openDatePicker = (): void => {
    reopenKeypadAfterDatePicker.current = keypadOpen;
    closeKeypad();
    setDatePickerOpen(true);
  };

  const handleSave = async (): Promise<void> => {
    const baseResolved =
      kind === 'income' ? normalizeIncomeCategoryOption(category, categoryOptions) : category;
    const resolvedCategory =
      kind === 'expense' && isSharedTopup
        ? findSharedTopupCategoryOption(categoryOptions) ?? baseResolved
        : baseResolved;

    const originalAmountMinor = parseAmountMinor(amount);
    if (originalAmountMinor === null) {
      setValidationMessage('Enter an amount greater than zero.');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    if (!resolvedCategory) {
      setValidationMessage(
        kind === 'income'
          ? 'Pick Salary, a Transfers category, or Income · Others before saving this income.'
          : `Pick a category before saving this ${kind}.`,
      );
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
        category_id: resolvedCategory.id,
        country_iso: normalizeCountryIso(countryIso),
        recurring,
        shared: kind === 'expense' && !isSharedTopup ? shared : false,
        shared_participant:
          kind === 'expense' && isSharedTopup
            ? sharedParticipant
            : kind === 'expense' && shared
              ? sharedFlowLocked
                ? 'me'
                : sharedParticipant
              : null,
        is_salary: kind === 'income' && isSalaryCategoryOption(resolvedCategory),
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

      if (suggestion && userTouchedCategory && resolvedCategory.id !== suggestion.category.id) {
        await upsertMerchantRule({
          kind,
          pattern: suggestion.normalizedMerchant,
          categoryId: resolvedCategory.id,
          canonicalMerchant: suggestion.canonicalMerchant,
          isBlocked: false,
          isSharedTopup,
        });
      }

      await saveMerchantMemoryObservation({
        context: {
          kind,
          name: name.trim(),
          comment: comment.trim().length > 0 ? comment.trim() : null,
          rawText: name.trim(),
          message: null,
          transactionType: null,
          sender: null,
          receiver: null,
          bankCategory: null,
        },
        categoryId: resolvedCategory.id,
        isSharedTopup,
        occurredOn: date,
      });

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSaved();

      const nextDraft: TransactionDraft = {
        kind,
        amount_minor: conversion.convertedMinor,
        original_amount_minor: originalAmountMinor,
        currency_code: currencyCode,
        category_id: resolvedCategory.id,
        name: name.trim(),
        comment: comment.trim().length > 0 ? comment.trim() : null,
        occurred_on: date,
        recurring,
        shared,
        shared_participant:
          isSharedTopup || shared
            ? shared && !isSharedTopup && sharedFlowLocked
              ? 'me'
              : sharedParticipant
            : null,
        is_salary: kind === 'income' && isSalaryCategoryOption(resolvedCategory),
        is_shared_topup: isSharedTopup,
        from_shared_screen: sharedFlowLocked ? true : undefined,
        country_iso: normalizeCountryIso(countryIso),
      };

      if (draft?.id) {
        setSaveState({ editing: true, title: 'Changes saved', lastDraft: nextDraft });
        closeTimer.current = setTimeout(() => {
          setSaveState(null);
          handleClose();
        }, 700);
        return;
      }

      setLastCreatedDate(date);
      setSaveState({ editing: false, title: 'Saved', lastDraft: nextDraft });
    } catch (error) {
      setValidationMessage(error instanceof Error ? error.message : 'Could not save the transaction.');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSaving(false);
    }
  };

  const onDateChange = (event: DateTimePickerEvent, selected?: Date): void => {
    if (Platform.OS === 'android') {
      if (selected) setDate(toIsoDate(selected));
      closeDatePicker();
      return;
    }
    if (event.type === 'dismissed') {
      closeDatePicker();
      return;
    }
    if (selected) setDate(toIsoDate(selected));
  };

  const applyRecentSuggestion = (row: TransactionRow): void => {
    suppressRecentSuggestionsName.current = row.name.trim();
    setRecentSuggestions([]);
    setName(row.name);
    const baseMatch =
      categoryOptions.find((option) => option.id === row.category_id) ??
      (row.is_salary ? findSalaryCategoryOption(categoryOptions) : null);
    const match =
      kind === 'income'
        ? normalizeIncomeCategoryOption(baseMatch, categoryOptions)
        : isIncomeCategoryOption(baseMatch)
          ? null
          : baseMatch;
    if (match) {
      autoAppliedCategoryId.current = null;
      setCategory(match);
      setUserTouchedCategory(true);
    }
  };

  const visibleCategoryLabel = category ? `${category.parentName} · ${category.name}` : 'Pick a category';
  const showSuggestionCard = Boolean(
    !isSharedTopup &&
    suggestion &&
    (!userTouchedCategory || !category || category.id !== suggestion.category.id),
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={handleClose}>
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={[styles.header, { paddingTop: Math.max(insets.top, spacing.md) }]}>
          <Pressable onPress={handleClose} hitSlop={12}>
            <Text style={styles.headerAction}>Cancel</Text>
          </Pressable>
          <Text style={styles.headerTitle}>{editing ? 'Edit transaction' : 'New transaction'}</Text>
          <Pressable onPress={() => void handleSave()} disabled={saving || !canSave} hitSlop={12}>
            <Text style={[styles.headerAction, styles.headerSave, (saving || !canSave) && styles.disabled]}>
              {saving ? 'Saving' : 'Save'}
            </Text>
          </Pressable>
        </View>

        <View style={styles.amountHero}>
          {!useSharedFlowOptions ? (
            <TransactionKindSelector
              value={kind}
              onChange={(value) => {
                if (value === 'expense') {
                  setKind('expense');
                  if (category && isIncomeCategoryOption(category)) {
                    autoAppliedCategoryId.current = null;
                    setCategory(null);
                    setUserTouchedCategory(false);
                  }
                  return;
                }

                setKind('income');
                setShared(false);
                setIsSharedTopup(false);
                setCategory((current) => normalizeIncomeCategoryOption(current, categoryOptions));
              }}
            />
          ) : null}
          <Pressable
            style={({ pressed }) => [styles.amountFieldButton, pressed && styles.rowPressed]}
            onPress={toggleKeypad}
          >
            <Text style={styles.amountValue}>
              {amountDisplayState.display.split('').map((char, index) => (
                <Text
                  key={`${char}-${index}`}
                  style={index === amountDisplayState.activeIndex ? styles.amountValueActive : undefined}
                >
                  {char}
                </Text>
              ))}
            </Text>
            <View style={styles.amountMetaRow}>
              <Text style={styles.amountMeta}>
                {currencyCode === 'DKK'
                  ? 'In DKK'
                  : `Saved in DKK · entered in ${currencyCode}`}
              </Text>
              <TransactionCurrencySelector
                value={currencyCode}
                onChange={setCurrencyCode}
                appearance="inline"
              />
            </View>
          </Pressable>
        </View>

        <ScrollView
          style={styles.fields}
          contentContainerStyle={styles.fieldsContent}
          keyboardShouldPersistTaps="handled"
        >
          <TransactionFieldLabel>Name</TransactionFieldLabel>
          <TransactionTextField
            value={name}
            onChangeText={setName}
            onFocus={closeKeypad}
            onEndEditing={() => {
              void runCategorySuggestion({ preferRemote: true });
            }}
            placeholder="What was it?"
            returnKeyType="done"
          />


          <TransactionFieldLabel>Category</TransactionFieldLabel>
          <TransactionPickerField
            text={category ? visibleCategoryLabel : ''}
            placeholder={isSharedTopup ? 'Transfers · Top up' : 'Pick a category'}
            onPress={() => {
              if (isSharedTopup) return;
              autoAppliedCategoryId.current = null;
              if (kind === 'income') {
                setCategory((current) => normalizeIncomeCategoryOption(current, categoryOptions));
              }
              setUserTouchedCategory(true);
              setPickerOpen(true);
            }}
            leadingCategoryIcon={category?.icon ?? 'shape-outline'}
            leadingIconColor={categoryAccentColor}
            leadingIconBackgroundColor={category ? `${categoryAccentColor}22` : colors.surfaceAlt}
            trailing={
              kind === 'expense' && isSuggestingCategory ? (
                <ActivityIndicator size="small" color={colors.textMuted} />
              ) : undefined
            }
          />

          {kind === 'income' && selectedIsSalary ? (
            <Text style={styles.inlineHint}>This will start a new cycle.</Text>
          ) : null}

          {showSuggestionCard && suggestion ? (
            <View style={styles.suggestionCard}>
              <View style={styles.suggestionHead}>
                <Text style={styles.suggestionTitle}>
                  {suggestion.category.parentName} · {suggestion.category.name}
                </Text>
                <Text style={styles.suggestionConfidence}>{Math.round(suggestion.confidence * 100)}%</Text>
              </View>
              <Text style={styles.suggestionMeta}>
                {formatMerchantCategorySource(suggestion.source)}
                {suggestion.normalizedMerchant ? ` · ${suggestion.normalizedMerchant}` : ''}
              </Text>
              <View style={styles.actionRow}>
                <Pressable
                  style={({ pressed }) => [styles.smallAction, pressed && styles.rowPressed]}
                  onPress={() => {
                    void acceptSuggestion();
                  }}
                >
                  <Text style={styles.smallActionText}>Use this</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.smallActionMuted, pressed && styles.rowPressed]}
                  onPress={() => {
                    void blockSuggestion();
                  }}
                >
                  <Text style={styles.smallActionText}>Don't suggest again</Text>
                </Pressable>
              </View>
            </View>
          ) : null}



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

          <TransactionFieldLabel>Details</TransactionFieldLabel>
          <View style={styles.detailRow}>
            <View style={styles.detailCardDate}>
              <TransactionPickerField
                text={formatDateLabel(date)}
                onPress={openDatePicker}
                leadingMaterialIcon="calendar-month-outline"
                trailing={<MaterialCommunityIcons name="chevron-down" size={18} color={colors.textMuted} />}
              />
            </View>
            <Pressable
              style={[styles.fieldCard, styles.detailCardCountry]}
              onPress={() => setCountryPickerOpen(true)}
            >
              <View style={styles.detailValueRow}>
                <Text style={styles.flagValue}>{formatCountryFlag(countryIso)}</Text>
              </View>
              <MaterialCommunityIcons name="chevron-down" size={18} color={colors.textMuted} />
            </Pressable>
          </View>

          <TransactionFieldLabel>Note</TransactionFieldLabel>
          <TransactionTextField
            value={comment}
            onChangeText={setComment}
            onFocus={closeKeypad}
            onEndEditing={() => {
              void runCategorySuggestion({ preferRemote: true });
            }}
            placeholder="Optional"
            style={styles.input}
            multiline
          />

          {useSharedFlowOptions ? (
            <>
              <Text style={styles.label}>Options</Text>
              <View style={styles.actionRow}>
                <Pressable
                  style={({ pressed }) => [
                    styles.toggleChip,
                    shared && !isSharedTopup && styles.toggleChipActive,
                    pressed && styles.rowPressed,
                  ]}
                  onPress={() => {
                    setShared(true);
                    setIsSharedTopup(false);
                    setSharedParticipant('me');
                    autoAppliedCategoryId.current = null;

                    const isCurrentlyTopupCategory = Boolean(
                      sharedTopupCategory && category?.id === sharedTopupCategory.id,
                    );
                    if (!isCurrentlyTopupCategory) {
                      if (category) lastSharedExpenseCategoryId.current = category.id;
                      setUserTouchedCategory(Boolean(category));
                      return;
                    }

                    if (lastSharedExpenseCategoryId.current) {
                      const restore = categoryOptions.find(
                        (option) => option.id === lastSharedExpenseCategoryId.current,
                      );
                      if (restore) {
                        setCategory(restore);
                        setUserTouchedCategory(true);
                        return;
                      }
                    }

                    setCategory(null);
                    setUserTouchedCategory(false);
                  }}
                >
                  <Text style={styles.toggleChipText}>Shared expense</Text>
                </Pressable>
                <SharedTopupParticipantSelector
                  value={sharedParticipant}
                  active={isSharedTopup}
                  appearance="pill"
                  variant="card"
                  labelPrefix="Top-up"
                  onBeforeOpen={() => {
                    if (category && (!sharedTopupCategory || category.id !== sharedTopupCategory.id)) {
                      lastSharedExpenseCategoryId.current = category.id;
                    }
                    setShared(false);
                    setIsSharedTopup(true);
                  }}
                  onChange={(next) => {
                    setSharedParticipant(next);
                    if (category && (!sharedTopupCategory || category.id !== sharedTopupCategory.id)) {
                      lastSharedExpenseCategoryId.current = category.id;
                    }
                    setShared(false);
                    setIsSharedTopup(true);
                  }}
                />
              </View>
            </>
          ) : null}
          {!editing && !sharedFlowLocked ? (
            <View style={styles.importStack}>
              <Text style={[styles.label, { color: colors.accentAlt }]}>Import</Text>
              <Pressable
                style={({ pressed }) => [styles.importCard, (pressed || imageImportBusy) && styles.rowPressed]}
                onPress={() => {
                  Keyboard.dismiss();
                  void startImageImport();
                }}
                disabled={imageImportBusy}
              >
                <View style={styles.importCopy}>
                  <Text style={styles.importTitle}>{imageImportBusy ? 'Analyzing image...' : 'Import from image'}</Text>
                  <Text style={styles.importMeta}>Create multiple transactions from a screenshot or receipt.</Text>
                </View>
                {imageImportBusy ? (
                  <ActivityIndicator size="small" color={colors.text} />
                ) : (
                  <MaterialCommunityIcons name="image-plus" size={22} color={colors.text} />
                )}
              </Pressable>

              <Pressable
                style={({ pressed }) => [styles.importCard, (pressed || csvImportBusy) && styles.rowPressed]}
                onPress={() => {
                  Keyboard.dismiss();
                  void pickCsvImport();
                }}
                disabled={csvImportBusy}
              >
                <View style={styles.importCopy}>
                  <Text style={styles.importTitle}>{csvImportBusy ? 'Analyzing CSV...' : 'Import bank CSV'}</Text>
                  <Text style={styles.importMeta}>Pick a statement file and review the AI-parsed transactions.</Text>
                </View>
                {csvImportBusy ? (
                  <ActivityIndicator size="small" color={colors.text} />
                ) : (
                  <MaterialCommunityIcons name="file-delimited-outline" size={22} color={colors.text} />
                )}
              </Pressable>
            </View>
          ) : null}

          {kind === 'expense' && shared && !isSharedTopup && !useSharedFlowOptions ? (
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

          {selectedIsMobilePay ? (
            <>
              <Text style={styles.label}>Person</Text>
              {transferPeople.length === 0 ? (
                <Text style={styles.inlineHint}>
                  Add transfer people in Categories so MobilePay names stay consistent for income and expense transfers.
                </Text>
              ) : (
                <View style={styles.actionRow}>
                  {transferPeople.map((person) => {
                    const active = selectedTransferPerson?.id === person.id;
                    return (
                      <Pressable
                        key={person.id}
                        style={({ pressed }) => [styles.toggleChip, active && styles.toggleChipActive, pressed && styles.rowPressed]}
                        onPress={() => setName(person.name)}
                      >
                        <Text style={styles.toggleChipText}>{person.name}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </>
          ) : null}

          {validationMessage ? <Text style={styles.validation}>{validationMessage}</Text> : null}
        </ScrollView>

        {keypadOpen ? (
          <View style={styles.keypadPanel}>
            <View pointerEvents="box-none" style={styles.keypadHideWrap}>
              <Pressable
                style={({ pressed }) => [styles.keypadHideButton, pressed && styles.rowPressed]}
                onPress={closeKeypad}
              >
                <MaterialCommunityIcons name="keyboard-close-outline" size={16} color={colors.text} />
                <Text style={styles.keypadHideText}>Hide</Text>
              </Pressable>
            </View>
            <NumericKeypad value={amount} onChange={setAmount} />
          </View>
        ) : (
          <View style={styles.keyboardDock}>
            <Pressable
              style={({ pressed }) => [styles.keyboardDockButton, pressed && styles.rowPressed]}
              onPress={openKeypad}
            >
              <MaterialCommunityIcons name="keyboard-outline" size={18} color={colors.text} />
              <Text style={styles.keyboardDockText}>Open keypad</Text>
              <MaterialCommunityIcons name="chevron-up" size={18} color={colors.text} />
            </Pressable>
          </View>
        )}

        {datePickerOpen && (
          Platform.OS === 'ios' ? (
            <View style={styles.datePickerOverlay}>
              <Pressable style={styles.datePickerBackdrop} onPress={closeDatePicker} />
              <View style={styles.datePickerCard}>
                <View style={styles.datePickerHeader}>
                  <Text style={styles.datePickerTitle}>Select date</Text>
                  <Pressable onPress={closeDatePicker}>
                    <Text style={styles.datePickerDone}>Done</Text>
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
            </View>
          ) : (
            <DateTimePicker value={parseIsoDate(date)} mode="date" display="calendar" onChange={onDateChange} />
          )
        )}

        {countryPickerOpen ? (
          <View style={styles.countryPickerOverlay}>
            <Pressable style={styles.countryPickerBackdrop} onPress={() => setCountryPickerOpen(false)} />
            <View style={styles.countryPickerSheet}>
              <View style={styles.countryPickerHeader}>
                <Text style={styles.countryPickerTitle}>Select country</Text>
                <Pressable onPress={() => setCountryPickerOpen(false)} hitSlop={12}>
                  <Text style={styles.headerAction}>Done</Text>
                </Pressable>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.countryPickerRow}
              >
                {countryOptions.map((option) => {
                  const active = option.code === normalizeCountryIso(countryIso);
                  return (
                    <Pressable
                      key={option.code}
                      style={({ pressed }) => [
                        styles.countryChip,
                        active && styles.countryChipActive,
                        pressed && styles.rowPressed,
                      ]}
                      onPress={() => {
                        setCountryIso(option.code);
                        setCountryPickerOpen(false);
                      }}
                    >
                      <Text style={styles.countryChipFlag}>{formatCountryFlag(option.code)}</Text>
                      <Text style={styles.countryChipLabel}>{option.label}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        ) : null}

        <CategorySheet
          visible={pickerOpen}
          onClose={() => setPickerOpen(false)}
          kind={kind}
          onSelect={(option) => {
            autoAppliedCategoryId.current = null;
            const normalized = kind === 'income' ? normalizeIncomeCategoryOption(option, categoryOptions) : option;
            setCategory(normalized);
            if (sharedFlowLocked && kind === 'expense' && normalized) {
              if (!sharedTopupCategory || normalized.id !== sharedTopupCategory.id) {
                lastSharedExpenseCategoryId.current = normalized.id;
              }
            }
            setUserTouchedCategory(true);
          }}
          frequentIds={frequentIds}
          recentIds={recentCategoryIds}
          selectedId={category?.id ?? null}
          budgetStateByCategory={budgetStateByCategory}
        />

        <ImportReviewModal
          visible={imageImportVisible}
          rows={imageImportDrafts}
          skippedDuplicates={imageImportSkippedDuplicates}
          saving={imageImportSaving}
          errorMessage={imageImportError}
          categoriesById={Object.fromEntries(categoryOptions.map((option) => [option.id, option]))}
          categoryOptions={categoryOptions}
          transferPeople={transferPeople}
          frequentIds={frequentIds}
          recentIds={recentCategoryIds}
          budgetStateByCategory={budgetStateByCategory}
          onClose={() => {
            setImageImportVisible(false);
            setImageImportError(null);
            setImageImportSkippedDuplicates([]);
          }}
          onSave={() => {
            void saveImportedTransactions();
          }}
          onChangeRow={updateImageImportDraft}
          onRemoveRow={(id) => {
            setImageImportDrafts((current) => current.filter((row) => row.id !== id));
          }}
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
                          from_shared_screen: saveState.lastDraft.from_shared_screen,
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
  amountFieldButton: {
    gap: spacing.xs,
    alignSelf: 'stretch',
  },
  amountValue: { ...typography.amount, color: colors.text },
  amountValueActive: { color: colors.accentAlt },
  amountMeta: { ...typography.label, color: colors.textMuted },
  amountMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  fields: { flex: 1 },
  fieldsContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.sm },
  importStack: { gap: spacing.sm },
  importCard: {
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  importCopy: { flex: 1, gap: 4 },
  importTitle: { ...typography.body, color: colors.text, fontWeight: '700' },
  importMeta: { ...typography.label, color: colors.textMuted },
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
  fieldLeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
  categoryIconWrap: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineHint: { ...typography.label, color: colors.success },
  fieldTrailing: { width: 20, alignItems: 'center', justifyContent: 'center' },
  detailValueRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  fieldText: { ...typography.body, color: colors.text, flex: 1 },
  flagValue: { fontSize: 24, lineHeight: 28 },
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
  detailCardDate: { flex: 2 },
  detailCardCountry: { flex: 1 },
  toggleChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleChipActive: {
    backgroundColor: 'rgba(124,92,255,0.18)',
    borderColor: colors.accent,
  },
  toggleChipText: { ...typography.label, color: colors.text },
  validation: { ...typography.label, color: colors.danger, marginTop: spacing.sm },
  datePickerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.36)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  datePickerBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  datePickerCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  datePickerHeader: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  datePickerTitle: { ...typography.body, color: colors.text, fontWeight: '700' },
  datePickerDone: { ...typography.body, color: colors.accentAlt, fontWeight: '700' },
  keypadPanel: {
    position: 'relative',
    overflow: 'visible',
  },
  keypadHideWrap: {
    position: 'absolute',
    top: -(spacing.xl + spacing.lg),
    right: spacing.xl,
    zIndex: 1,
  },
  keypadHideButton: {
    borderRadius: radius.pill,
    backgroundColor: 'rgba(245,185,66,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(245,185,66,0.32)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  keypadHideText: { ...typography.label, color: colors.text, fontWeight: '600' },
  keyboardDock: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  keyboardDockButton: {
    borderRadius: radius.pill,
    backgroundColor: 'rgba(245,185,66,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(245,185,66,0.32)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  keyboardDockText: { ...typography.label, color: colors.text, fontWeight: '600' },
  countryPickerOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
  },
  countryPickerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.36)',
  },
  countryPickerSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  countryPickerHeader: {
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  countryPickerTitle: { ...typography.body, color: colors.text, fontWeight: '700' },
  countryPickerRow: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  countryChip: {
    width: 108,
    minHeight: 96,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  countryChipActive: {
    backgroundColor: 'rgba(124,92,255,0.18)',
    borderWidth: 1,
    borderColor: colors.accent,
  },
  countryChipFlag: { fontSize: 28, lineHeight: 32 },
  countryChipLabel: { ...typography.label, color: colors.text, textAlign: 'center' },
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
