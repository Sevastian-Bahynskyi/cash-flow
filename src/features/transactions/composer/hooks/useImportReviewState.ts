import { useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, Platform } from 'react-native';
import type { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { runDetached } from '@/lib/async';
import {
  resolveBatchCategoryResults,
  type ImportCategorySuggestionRow,
  type SuggestCategoryCandidate,
} from '@/features/transactions/suggestions';
import type { ImportedTransactionDraft } from '@/features/transactions/imageImport';
import type { CategoryOption } from '@/features/categories/types';
import type { TransferPersonRow } from '@/features/transfers/types';
import { matchTransferPersonName } from '@/features/transactions/merchantIntelligence';

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

const normalizeImportText = (value: string): string => value.trim().toLowerCase();

const buildRowSignature = (row: ImportedTransactionDraft): string =>
  [row.kind, normalizeImportText(row.name), normalizeImportText(row.comment), row.categoryId ?? ''].join('|');

const toBatchSuggestionRow = (row: ImportedTransactionDraft): ImportCategorySuggestionRow => ({
  id: row.id,
  kind: row.kind,
  name: row.name.trim(),
  comment: row.comment.trim().length > 0 ? row.comment.trim() : null,
  rawText: row.rawText.trim().length > 0 ? row.rawText.trim() : row.name.trim(),
  message: row.message.trim().length > 0 ? row.message.trim() : null,
  transactionType: row.transactionType.trim().length > 0 ? row.transactionType.trim() : null,
  sender: row.sender.trim().length > 0 ? row.sender.trim() : null,
  receiver: row.receiver.trim().length > 0 ? row.receiver.trim() : null,
  bankCategory: row.bankCategory.trim().length > 0 ? row.bankCategory.trim() : null,
});

type Args = {
  visible: boolean;
  rows: ImportedTransactionDraft[];
  categoryOptions: CategoryOption[];
  transferPeople: TransferPersonRow[];
  onChangeRow: (id: string, patch: Partial<ImportedTransactionDraft>) => void;
};

const normalizeCategoryName = (value: string): string => value.trim().toLowerCase();

const findMobilePayCategoryId = (options: readonly CategoryOption[]): string | null =>
  options.find(
    (option) =>
      normalizeCategoryName(option.parentName) === 'transfers' &&
      normalizeCategoryName(option.name) === 'mobilepay',
  )?.id ?? null;

export function useImportReviewState({ visible, rows, categoryOptions, transferPeople, onChangeRow }: Args) {
  const [categoryPickerRowId, setCategoryPickerRowId] = useState<string | null>(null);
  const [datePickerRowId, setDatePickerRowId] = useState<string | null>(null);
  const [amountPickerRowId, setAmountPickerRowId] = useState<string | null>(null);
  const [expandedRowIds, setExpandedRowIds] = useState<string[]>([]);
  const [isCategorizing, setIsCategorizing] = useState(false);
  const [categorizationErrorMessage, setCategorizationErrorMessage] = useState<string | null>(null);
  const rowsRef = useRef(rows);
  const lastCategorizationKeyRef = useRef<string | null>(null);
  const categorizationRunId = useRef(0);

  const categoryCandidates = useMemo<SuggestCategoryCandidate[]>(
    () =>
      categoryOptions.map((option) => ({
        id: option.id,
        parent: option.parentName,
        name: option.name,
        icon: option.icon,
      })),
    [categoryOptions],
  );

  const activeDateRow = datePickerRowId ? rows.find((row) => row.id === datePickerRowId) ?? null : null;
  const activeDateValue = activeDateRow ? parseIsoDate(activeDateRow.occurredOn) : new Date();

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  useEffect(() => {
    const validRowIds = new Set(rows.map((row) => row.id));

    if (amountPickerRowId && !validRowIds.has(amountPickerRowId)) {
      setAmountPickerRowId(null);
    }
    if (categoryPickerRowId && !validRowIds.has(categoryPickerRowId)) {
      setCategoryPickerRowId(null);
    }
    if (datePickerRowId && !validRowIds.has(datePickerRowId)) {
      setDatePickerRowId(null);
    }

    setExpandedRowIds((current) => current.filter((rowId) => validRowIds.has(rowId)));
  }, [amountPickerRowId, categoryPickerRowId, datePickerRowId, rows]);

  useEffect(() => {
    const subscription = Keyboard.addListener('keyboardDidShow', () => {
      setAmountPickerRowId(null);
    });

    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (visible) return;
    setAmountPickerRowId(null);
    setCategoryPickerRowId(null);
    setDatePickerRowId(null);
    setExpandedRowIds([]);
    setIsCategorizing(false);
    setCategorizationErrorMessage(null);
    lastCategorizationKeyRef.current = null;
    categorizationRunId.current += 1;
  }, [visible]);

  useEffect(() => {
    if (!visible || categoryCandidates.length === 0) return;

    const uncategorizedRows = rows.filter((row) => !row.categoryId);
    if (uncategorizedRows.length === 0) {
      setIsCategorizing(false);
      setCategorizationErrorMessage(null);
      lastCategorizationKeyRef.current = null;
      return;
    }

    const categorizationKey = uncategorizedRows
      .map((row) => `${row.id}:${buildRowSignature(row)}`)
      .join('||');
    if (categorizationKey === lastCategorizationKeyRef.current) return;
    lastCategorizationKeyRef.current = categorizationKey;

    const runId = ++categorizationRunId.current;
    const initialSignatures = new Map(uncategorizedRows.map((row) => [row.id, buildRowSignature(row)]));

    setIsCategorizing(true);
    setCategorizationErrorMessage(null);

    runDetached(
      (async () => {
        const results = await resolveBatchCategoryResults({
          rows: uncategorizedRows.map(toBatchSuggestionRow),
          candidates: categoryCandidates,
        });
        if (runId !== categorizationRunId.current) return;

        const combinedAssignments = new Map(results.map((result) => [result.id, result]));

        for (const row of uncategorizedRows) {
          const suggestion = combinedAssignments.get(row.id);
          if (!suggestion) continue;

          const currentRow = rowsRef.current.find((candidate) => candidate.id === row.id);
          if (!currentRow || currentRow.categoryId) continue;
          if (buildRowSignature(currentRow) !== initialSignatures.get(row.id)) continue;

          onChangeRow(row.id, {
            categoryId: suggestion.categoryId,
            normalizedMerchant: suggestion.normalizedMerchant,
            categorySource: suggestion.source,
            categoryConfidence: suggestion.confidence,
            suggestedSharedTopup: suggestion.isSharedTopup,
          });
        }

        const stillMissing = uncategorizedRows.some((row) => {
          if (combinedAssignments.has(row.id)) return false;
          const currentRow = rowsRef.current.find((candidate) => candidate.id === row.id);
          return Boolean(
            currentRow &&
              !currentRow.categoryId &&
              buildRowSignature(currentRow) === initialSignatures.get(row.id),
          );
        });

        if (stillMissing && runId === categorizationRunId.current) {
          setCategorizationErrorMessage(
            'Could not categorize every imported transaction automatically. Please review the remaining rows.',
          );
        }

        if (runId === categorizationRunId.current) {
          setIsCategorizing(false);
        }
      })(),
      'transactions.import-review.categorize',
      () => {
        if (runId !== categorizationRunId.current) return;
        lastCategorizationKeyRef.current = null;
        setIsCategorizing(false);
        setCategorizationErrorMessage(
          'Could not categorize imported transactions right now. Please try again or review the categories manually.',
        );
      },
    );
  }, [categoryCandidates, onChangeRow, rows, visible]);

  useEffect(() => {
    if (!visible || transferPeople.length === 0 || categoryOptions.length === 0) return;

    const mobilePayCategoryId = findMobilePayCategoryId(categoryOptions);
    if (!mobilePayCategoryId) return;

    const peopleByNormalizedName = new Map(
      transferPeople.map((person) => [person.normalized_name, person] as const),
    );
    const normalizedPeople = transferPeople.map((person) => person.normalized_name);

    for (const row of rows) {
      const matchedNormalizedName = matchTransferPersonName({
        context: {
          kind: row.kind,
          name: row.name,
          comment: row.comment,
          rawText: row.rawText,
          message: row.message,
          transactionType: row.transactionType,
          sender: row.sender,
          receiver: row.receiver,
          bankCategory: row.bankCategory,
        },
        normalizedPeople,
      });
      if (!matchedNormalizedName) continue;

      const matchedPerson = peopleByNormalizedName.get(matchedNormalizedName);
      if (!matchedPerson) continue;

      const patch: Partial<ImportedTransactionDraft> = {};
      if (row.name.trim() !== matchedPerson.name) {
        patch.name = matchedPerson.name;
      }
      if (row.categoryId !== mobilePayCategoryId) {
        patch.categoryId = mobilePayCategoryId;
      }
      if (row.categorySource !== 'transfer_person') {
        patch.categorySource = 'transfer_person';
      }
      if (row.categoryConfidence !== 0.99) {
        patch.categoryConfidence = 0.99;
      }
      if (row.normalizedMerchant !== matchedPerson.normalized_name) {
        patch.normalizedMerchant = matchedPerson.normalized_name;
      }
      if (row.suggestedSharedTopup) {
        patch.suggestedSharedTopup = false;
      }

      if (Object.keys(patch).length > 0) {
        onChangeRow(row.id, patch);
      }
    }
  }, [categoryOptions, onChangeRow, rows, transferPeople, visible]);

  const toggleRowExpanded = (rowId: string): void => {
    setExpandedRowIds((current) => {
      const isExpanded = current.includes(rowId);
      if (isExpanded) {
        setAmountPickerRowId((activeRowId) => (activeRowId === rowId ? null : activeRowId));
        return current.filter((value) => value !== rowId);
      }
      return [...current, rowId];
    });
  };

  const openCategoryPicker = (rowId: string): void => {
    setAmountPickerRowId(null);
    setDatePickerRowId(null);
    setCategoryPickerRowId(rowId);
  };

  const openDatePicker = (rowId: string): void => {
    setAmountPickerRowId(null);
    setCategoryPickerRowId(null);
    setDatePickerRowId(rowId);
  };

  const toggleAmountPicker = (rowId: string): void => {
    Keyboard.dismiss();
    setCategoryPickerRowId(null);
    setDatePickerRowId(null);
    setExpandedRowIds((current) => (current.includes(rowId) ? current : [...current, rowId]));
    setAmountPickerRowId((current) => (current === rowId ? null : rowId));
  };

  const closeAmountPicker = (): void => {
    setAmountPickerRowId(null);
  };

  const handleDateChange = (event: DateTimePickerEvent, selected?: Date): void => {
    if (!datePickerRowId) return;

    if (Platform.OS === 'android') {
      if (selected) onChangeRow(datePickerRowId, { occurredOn: toIsoDate(selected) });
      setDatePickerRowId(null);
      return;
    }

    if (event.type === 'dismissed') {
      setDatePickerRowId(null);
      return;
    }

    if (selected) onChangeRow(datePickerRowId, { occurredOn: toIsoDate(selected) });
  };

  return {
    activeDateValue,
    amountPickerRowId,
    categorizationErrorMessage,
    categoryPickerRowId,
    closeAmountPicker,
    datePickerRowId,
    expandedRowIds,
    handleDateChange,
    isCategorizing,
    openCategoryPicker,
    openDatePicker,
    setCategoryPickerRowId,
    setDatePickerRowId,
    toggleAmountPicker,
    toggleRowExpanded,
  };
}
