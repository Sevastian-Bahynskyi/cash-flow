import { useMemo } from 'react';
import type { barDataItem, lineDataItem, pieDataItem } from 'react-native-gifted-charts';
import { buildCategoryMeta } from '@/features/categories/helpers';
import { useOverview } from '@/features/overview/useOverview';
import type { TransactionRow } from '@/features/transactions/types';
import { colors } from '@/ui/tokens';

export type DashboardRange = 'weekly' | 'monthly' | 'yearly';

type BucketDefinition = {
  key: string;
  label: string;
  axisLabel: string;
};

export type DashboardBucket = BucketDefinition & {
  incomeMinor: number;
  expenseMinor: number;
  topupMinor: number;
  outflowMinor: number;
  cashFlowMinor: number;
};

export type DashboardCategoryBreakdown = {
  categoryId: string;
  label: string;
  color: string;
  amountMinor: number;
  share: number;
};

type PeriodSummary = {
  incomeMinor: number;
  expenseMinor: number;
  topupMinor: number;
  outflowMinor: number;
  cashFlowMinor: number;
  avgExpenseMinor: number;
  largestCategory: DashboardCategoryBreakdown | null;
  biggestBucket: DashboardBucket | null;
};

type DashboardPresentation = {
  rangeLabel: string;
  rangeDescription: string;
  bucketUnitLabel: string;
  chartWidth: number;
  buckets: DashboardBucket[];
  summary: PeriodSummary;
  categoryBreakdown: DashboardCategoryBreakdown[];
  cashFlowLineData: lineDataItem[];
  expenseBarData: barDataItem[];
  incomeLineData: lineDataItem[];
  expensePieData: pieDataItem[];
  chartBounds: {
    cashFlowMax: number;
    mostNegativeCashFlow: number;
    incomeVsOutflowMax: number;
  };
  hasTransactionsInRange: boolean;
  compactAxisValue: (value: string) => string;
};

const pieFallbackColors = ['#7C5CFF', '#3DD68C', '#F5B942', '#5BC0EB', '#FF7A59', '#FA5AA3'];

const pad2 = (value: number): string => String(value).padStart(2, '0');

const toIsoDate = (date: Date): string =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

const parseIsoDate = (iso: string): Date => {
  const [year = 1970, month = 1, day = 1] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const addDays = (date: Date, amount: number): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount);

const startOfWeek = (date: Date): Date => {
  const normalized = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = normalized.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(normalized, diff);
};

const majorAmount = (minor: number): number => Number((minor / 100).toFixed(2));

const formatWeekday = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
const formatMonthShort = new Intl.DateTimeFormat(undefined, { month: 'short' });
const formatRangeDate = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });

const buildBucketDefinitions = (range: DashboardRange, now: Date): {
  startOn: string;
  endOn: string;
  rangeLabel: string;
  rangeDescription: string;
  bucketUnitLabel: string;
  buckets: BucketDefinition[];
} => {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (range === 'weekly') {
    const start = startOfWeek(today);
    const buckets = Array.from({ length: 7 }, (_, index) => {
      const date = addDays(start, index);
      return {
        key: toIsoDate(date),
        label: formatWeekday.format(date),
        axisLabel: formatWeekday.format(date),
      };
    });

    return {
      startOn: buckets[0]?.key ?? toIsoDate(today),
      endOn: buckets[buckets.length - 1]?.key ?? toIsoDate(today),
      rangeLabel: 'This week',
      rangeDescription: `${formatRangeDate.format(start)} - ${formatRangeDate.format(addDays(start, 6))}`,
      bucketUnitLabel: 'Daily',
      buckets,
    };
  }

  if (range === 'monthly') {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const daysInMonth = end.getDate();
    const buckets = Array.from({ length: daysInMonth }, (_, index) => {
      const date = new Date(today.getFullYear(), today.getMonth(), index + 1);
      const dayOfMonth = date.getDate();
      const shouldLabel = dayOfMonth === 1 || dayOfMonth === daysInMonth || dayOfMonth % 5 === 0;
      return {
        key: toIsoDate(date),
        label: `${dayOfMonth} ${formatMonthShort.format(date)}`,
        axisLabel: shouldLabel ? String(dayOfMonth) : '',
      };
    });

    return {
      startOn: toIsoDate(start),
      endOn: toIsoDate(end),
      rangeLabel: 'This month',
      rangeDescription: formatMonthShort.format(start),
      bucketUnitLabel: 'Daily',
      buckets,
    };
  }

  const start = new Date(today.getFullYear(), 0, 1);
  const end = new Date(today.getFullYear(), 11, 31);
  const buckets = Array.from({ length: 12 }, (_, index) => {
    const date = new Date(today.getFullYear(), index, 1);
    const month = pad2(index + 1);
    return {
      key: `${today.getFullYear()}-${month}`,
      label: formatMonthShort.format(date),
      axisLabel: formatMonthShort.format(date),
    };
  });

  return {
    startOn: toIsoDate(start),
    endOn: toIsoDate(end),
    rangeLabel: 'This year',
    rangeDescription: String(today.getFullYear()),
    bucketUnitLabel: 'Monthly',
    buckets,
  };
};

const bucketKeyForTransaction = (range: DashboardRange, occurredOn: string): string => {
  if (range === 'yearly') return occurredOn.slice(0, 7);
  return occurredOn;
};

const compactAxisValue = (value: string): string => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return value;
  const abs = Math.abs(parsed);
  if (abs >= 1000) return `${Math.round(parsed / 100) / 10}k`;
  if (abs >= 100) return `${Math.round(parsed)}`;
  return `${Math.round(parsed * 10) / 10}`;
};

const createEmptyBucket = (bucket: BucketDefinition): DashboardBucket => ({
  ...bucket,
  incomeMinor: 0,
  expenseMinor: 0,
  topupMinor: 0,
  outflowMinor: 0,
  cashFlowMinor: 0,
});

const isPersonalExpense = (row: TransactionRow): boolean =>
  row.kind === 'expense' && !row.shared && !row.is_shared_topup;

export const useDashboard = (range: DashboardRange): ReturnType<typeof useOverview> & DashboardPresentation => {
  const overview = useOverview();

  const presentation = useMemo<DashboardPresentation>(() => {
    const descriptor = buildBucketDefinitions(range, new Date());
    const categoryMeta = buildCategoryMeta(overview.categories);
    const bucketMap = new Map<string, DashboardBucket>(
      descriptor.buckets.map((bucket) => [bucket.key, createEmptyBucket(bucket)]),
    );
    const categoryTotals = new Map<string, number>();

    let incomeMinor = 0;
    let expenseMinor = 0;
    let topupMinor = 0;
    let outflowMinor = 0;
    let cashFlowMinor = 0;

    for (const row of overview.transactions) {
      if (row.occurred_on < descriptor.startOn || row.occurred_on > descriptor.endOn) continue;
      const bucket = bucketMap.get(bucketKeyForTransaction(range, row.occurred_on));
      if (!bucket) continue;

      if (row.kind === 'income') {
        incomeMinor += row.amount_minor;
        cashFlowMinor += row.amount_minor;
        bucket.incomeMinor += row.amount_minor;
        bucket.cashFlowMinor += row.amount_minor;
        continue;
      }

      if (row.shared) continue;

      outflowMinor += row.amount_minor;
      cashFlowMinor -= row.amount_minor;
      bucket.outflowMinor += row.amount_minor;
      bucket.cashFlowMinor -= row.amount_minor;

      if (row.is_shared_topup) {
        topupMinor += row.amount_minor;
        bucket.topupMinor += row.amount_minor;
        continue;
      }

      expenseMinor += row.amount_minor;
      bucket.expenseMinor += row.amount_minor;

      if (row.category_id) {
        categoryTotals.set(row.category_id, (categoryTotals.get(row.category_id) ?? 0) + row.amount_minor);
      }
    }

    const buckets = descriptor.buckets.map((bucket) => bucketMap.get(bucket.key) ?? createEmptyBucket(bucket));
    const categoryBreakdown = [...categoryTotals.entries()]
      .map(([categoryId, amountMinor], index) => {
        const meta = categoryMeta[categoryId];
        return {
          categoryId,
          label: meta?.label ?? 'Category',
          color: meta?.color ?? pieFallbackColors[index % pieFallbackColors.length] ?? colors.accent,
          amountMinor,
          share: expenseMinor === 0 ? 0 : amountMinor / expenseMinor,
        } satisfies DashboardCategoryBreakdown;
      })
      .sort((a, b) => b.amountMinor - a.amountMinor)
      .slice(0, 6);

    const largestCategory = categoryBreakdown[0] ?? null;
    const biggestBucket = [...buckets]
      .sort((a, b) => b.outflowMinor - a.outflowMinor)[0] ?? null;

    const cashFlowLineData = buckets.map((bucket) => ({
      value: majorAmount(bucket.cashFlowMinor),
      label: bucket.axisLabel,
      dataPointColor: bucket.cashFlowMinor >= 0 ? colors.success : colors.danger,
      dataPointRadius: 4,
      textColor: colors.textMuted,
      labelTextStyle: { color: colors.textMuted, fontSize: 11 },
    })) satisfies lineDataItem[];

    const expenseBarData = buckets.map((bucket) => ({
      value: majorAmount(bucket.outflowMinor),
      label: bucket.axisLabel,
      frontColor: '#F5B942',
      gradientColor: '#FF7A59',
      showGradient: true,
      spacing: range === 'monthly' ? 18 : 24,
      labelTextStyle: { color: colors.textMuted, fontSize: 11 },
      barBorderRadius: 10,
    })) satisfies barDataItem[];

    const incomeLineData = buckets.map((bucket) => ({
      value: majorAmount(bucket.incomeMinor),
      label: bucket.axisLabel,
      dataPointColor: colors.success,
      dataPointRadius: 4,
    })) satisfies lineDataItem[];

    const expensePieData = categoryBreakdown.map((category) => ({
      value: majorAmount(category.amountMinor),
      color: category.color,
      gradientCenterColor: '#FFFFFF',
      focused: category === largestCategory,
    })) satisfies pieDataItem[];

    const cashFlowValues = buckets.map((bucket) => majorAmount(bucket.cashFlowMinor));
    const flowMagnitudes = buckets.flatMap((bucket) => [
      majorAmount(bucket.outflowMinor),
      majorAmount(bucket.incomeMinor),
    ]);

    return {
      rangeLabel: descriptor.rangeLabel,
      rangeDescription: descriptor.rangeDescription,
      bucketUnitLabel: descriptor.bucketUnitLabel,
      chartWidth: range === 'monthly' ? Math.max(760, buckets.length * 26) : Math.max(320, buckets.length * 58),
      buckets,
      summary: {
        incomeMinor,
        expenseMinor,
        topupMinor,
        outflowMinor,
        cashFlowMinor,
        avgExpenseMinor: buckets.length === 0 ? 0 : Math.round(expenseMinor / buckets.length),
        largestCategory,
        biggestBucket,
      },
      categoryBreakdown,
      cashFlowLineData,
      expenseBarData,
      incomeLineData,
      expensePieData,
      chartBounds: {
        cashFlowMax: Math.max(1, ...cashFlowValues, 0),
        mostNegativeCashFlow: Math.abs(Math.min(0, ...cashFlowValues)),
        incomeVsOutflowMax: Math.max(1, ...flowMagnitudes, 0),
      },
      hasTransactionsInRange: incomeMinor > 0 || outflowMinor > 0,
      compactAxisValue,
    };
  }, [overview.categories, overview.transactions, range]);

  return {
    ...overview,
    ...presentation,
  };
};
