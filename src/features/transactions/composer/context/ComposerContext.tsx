import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import AddTransactionModal from '@/features/transactions/AddTransactionModal';
import type { CategoryOption } from '@/features/categories/types';
import type { CsvImportFile, PendingImport } from '@/features/transactions/importFiles';
import type { TransactionDraft, TransactionRow } from '@/features/transactions/types';

type ComposerDraft = TransactionDraft & {
  category?: CategoryOption | null;
};

type ComposerContextValue = {
  openCreate: (draft?: ComposerDraft) => void;
  openCsvImport: (file: CsvImportFile) => void;
  openEdit: (row: TransactionRow, category?: CategoryOption | null) => void;
  close: () => void;
  bumpRefresh: () => void;
  refreshKey: number;
};

const Ctx = createContext<ComposerContextValue | null>(null);

export function ComposerProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [draft, setDraft] = useState<ComposerDraft | null>(null);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const value = useMemo<ComposerContextValue>(
    () => ({
      openCreate(nextDraft) {
        setDraft(nextDraft ?? null);
        setPendingImport(null);
        setVisible(true);
      },
      openCsvImport(file) {
        setDraft(null);
        setPendingImport({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          kind: 'csv',
          ...file,
        });
        setVisible(true);
      },
      openEdit(row, category) {
        setDraft({
          id: row.id,
          kind: row.kind,
          amount_minor: row.converted_amount_minor,
          original_amount_minor: row.original_amount_minor,
          currency_code: row.currency_code,
          category_id: row.category_id,
          category: category ?? null,
          name: row.name,
          comment: row.comment,
          occurred_on: row.occurred_on,
          recurring: row.recurring,
          shared: row.shared,
          shared_participant: row.shared_participant,
          is_salary: row.is_salary,
          is_shared_topup: row.is_shared_topup,
          country_iso: row.country_iso,
        });
        setPendingImport(null);
        setVisible(true);
      },
      close() {
        setVisible(false);
        setDraft(null);
        setPendingImport(null);
      },
      bumpRefresh() {
        setRefreshKey((current) => current + 1);
      },
      refreshKey,
    }),
    [refreshKey],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <AddTransactionModal
        visible={visible}
        onClose={value.close}
        onSaved={value.bumpRefresh}
        draft={draft}
        pendingImport={pendingImport}
      />
    </Ctx.Provider>
  );
}

export const useComposer = (): ComposerContextValue => {
  const value = useContext(Ctx);
  if (!value) throw new Error('useComposer must be used inside ComposerProvider');
  return value;
};
