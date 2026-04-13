import { useMemo } from 'react';
import type { barDataItem, lineDataItem } from 'react-native-gifted-charts';
import { buildCategoryMeta, getCategoryMetaDisplayColor } from '@/features/categories/helpers';
import { useOverview } from '@/features/overview/useOverview';
import { buildNavigableCycles, type SalaryCycle } from '@/lib/cycles';
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
  icon: string;
  amountMinor: number;
  share: number;
};

export type DashboardWindow = {
  id: string;
  startOn: string;
  endOn: string;
  rangeLabel: string;
  rangeDescription: string;
  bucketUnitLabel: string;
  buckets: BucketDefinition[];
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
  windows: DashboardWindow[];
  selectedWindowId: string | null;
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
const formatMonthLong = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });

const buildMonthlyCycleBuckets = (
  cycle: SalaryCycle,
  today: Date,
): DashboardWindow => {
  const start = parseIsoDate(cycle.startOn);
  const cycleEnd = cycle.endOnExclusive ? addDays(parseIsoDate(cycle.endOnExclusive), -1) : today;
  const effectiveEnd = cycleEnd > today ? today : cycleEnd;
  const dayCount = Math.max(
    1,
    Math.floor((effectiveEnd.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1,
  );
  const buckets = Array.from({ length: dayCount }, (_, index) => {
    const date = addDays(start, index);
    const dayOfMonth = date.getDate();
    const shouldLabel = index === 0 || index === dayCount - 1 || dayOfMonth === 1 || dayOfMonth % 5 === 0;

    return {
      key: toIsoDate(date),
      label: `${dayOfMonth} ${formatMonthShort.format(date)}`,
      axisLabel: shouldLabel ? String(dayOfMonth) : '',
    };
  });

  return {
    id: cycle.id,
    startOn: cycle.startOn,
    endOn: toIsoDate(effectiveEnd),
    rangeLabel: cycle.label,
    rangeDescription: `${formatRangeDate.format(start)} - ${formatRangeDate.format(effectiveEnd)}`,
    bucketUnitLabel: 'Daily',
    buckets,
  };
};

const buildWeeklyWindows = (
  today: Date,
  firstOccurredOn: string | null,
): DashboardWindow[] => {
  const currentWeekStart = startOfWeek(today);
  const firstWeekStart = firstOccurredOn ? startOfWeek(parseIsoDate(firstOccurredOn)) : currentWeekStart;
  const windows: DashboardWindow[] = [];

  for (let cursor = firstWeekStart; cursor <= currentWeekStart; cursor = addDays(cursor, 7)) {
    const end = addDays(cursor, 6);
    const buckets = Array.from({ length: 7 }, (_, index) => {
      const date = addDays(cursor, index);
      return {
        key: toIsoDate(date),
        label: formatWeekday.format(date),
        axisLabel: formatWeekday.format(date),
      };
    });

    windows.push({
      id: `week-${toIsoDate(cursor)}`,
      startOn: buckets[0]?.key ?? toIsoDate(cursor),
      endOn: buckets[buckets.length - 1]?.key ?? toIsoDate(end),
      rangeLabel: toIsoDate(cursor) === toIsoDate(currentWeekStart) ? 'This week' : `Week of ${formatRangeDate.format(cursor)}`,
      rangeDescription: `${formatRangeDate.format(cursor)} - ${formatRangeDate.format(end)}`,
      bucketUnitLabel: 'Daily',
      buckets,
    });
  }

  return windows.reverse();
};

const buildFallbackMonthlyWindow = (today: Date): DashboardWindow => {
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  const dayCount = Math.max(
    1,
    Math.floor((today.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1,
  );
  const buckets = Array.from({ length: dayCount }, (_, index) => {
    const date = addDays(start, index);
    const dayOfMonth = date.getDate();
    const shouldLabel = index === 0 || index === dayCount - 1 || dayOfMonth === 1 || dayOfMonth % 5 === 0;

    return {
      key: toIsoDate(date),
      label: `${dayOfMonth} ${formatMonthShort.format(date)}`,
      axisLabel: shouldLabel ? String(dayOfMonth) : '',
    };
  });

  return {
    id: `month-${toIsoDate(start)}`,
    startOn: toIsoDate(start),
    endOn: toIsoDate(today),
    rangeLabel: formatMonthLong.format(start),
    rangeDescription: `${formatRangeDate.format(start)} - ${formatRangeDate.format(today)}`,
    bucketUnitLabel: 'Daily',
    buckets,
  };
};

const buildMonthlyWindows = (
  today: Date,
  transactions: ReturnType<typeof useOverview>['transactions'],
): DashboardWindow[] => {
  const cycles = buildNavigableCycles(transactions);
  if (cycles.length === 0) return [buildFallbackMonthlyWindow(today)];
  return cycles.map((cycle) => buildMonthlyCycleBuckets(cycle, today)).reverse();
};

const buildYearlyWindows = (
  today: Date,
  firstOccurredOn: string | null,
): DashboardWindow[] => {
  const currentYear = today.getFullYear();
  const firstYear = firstOccurredOn ? parseIsoDate(firstOccurredOn).getFullYear() : currentYear;
  const windows: DashboardWindow[] = [];

  for (let year = firstYear; year <= currentYear; year += 1) {
    const buckets = Array.from({ length: 12 }, (_, index) => {
      const date = new Date(year, index, 1);
      const month = pad2(index + 1);
      return {
        key: `${year}-${month}`,
        label: formatMonthShort.format(date),
        axisLabel: formatMonthShort.format(date),
      };
    });

    windows.push({
      id: `year-${year}`,
      startOn: `${year}-01-01`,
      endOn: `${year}-12-31`,
      rangeLabel: year === currentYear ? 'This year' : String(year),
      rangeDescription: String(year),
      bucketUnitLabel: 'Monthly',
      buckets,
    });
  }

  return windows.reverse();
};

const buildWindowDefinitions = (
  range: DashboardRange,
  now: Date,
  transactions: ReturnType<typeof useOverview>['transactions'],
): DashboardWindow[] => {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const firstOccurredOn = transactions[0]?.occurred_on ?? null;

  if (range === 'weekly') {
    return buildWeeklyWindows(today, firstOccurredOn);
  }

  if (range === 'monthly') {
    return buildMonthlyWindows(today, transactions);
  }

  return buildYearlyWindows(today, firstOccurredOn);
};

const defaultWindowId = (
  range: DashboardRange,
  windows: readonly DashboardWindow[],
  today: Date,
): string | null => {
  if (windows.length === 0) return null;

  if (range === 'yearly') {
    const currentYear = today.getFullYear();
    return windows.find((window) => window.startOn.startsWith(`${currentYear}-`))?.id ?? windows[0]?.id ?? null;
  }

  const todayIso = toIsoDate(today);
  return (
    windows.find((window) => window.startOn <= todayIso && todayIso <= window.endOn)?.id ??
    windows[0]?.id ??
    null
  );
};

export const useDashboard = (
  range: DashboardRange,
  requestedWindowId: string | null = null,
): ReturnType<typeof useOverview> & DashboardPresentation => {
  const overview = useOverview();

  const presentation = useMemo<DashboardPresentation>(() => {
    const today = new Date();
    const windows = buildWindowDefinitions(range, today, overview.transactions);
    const fallbackWindowId = defaultWindowId(range, windows, today);
    const descriptor =
      windows.find((window) => window.id === requestedWindowId) ??
      windows.find((window) => window.id === fallbackWindowId) ??
      windows[0] ?? {
        id: null,
        startOn: '9999-12-31',
        endOn: '9999-12-31',
        rangeLabel: 'No data',
        rangeDescription: 'No transactions available yet',
        bucketUnitLabel: 'Daily',
        buckets: [],
      };

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
          color: meta ? getCategoryMetaDisplayColor(meta, 'expense') : pieFallbackColors[index % pieFallbackColors.length] ?? colors.accent,
          icon: meta?.icon ?? 'shape-outline',
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

    const cashFlowValues = buckets.map((bucket) => majorAmount(bucket.cashFlowMinor));
    const flowMagnitudes = buckets.flatMap((bucket) => [
      majorAmount(bucket.outflowMinor),
      majorAmount(bucket.incomeMinor),
    ]);

    return {
      windows,
      selectedWindowId: descriptor.id,
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
      chartBounds: {
        cashFlowMax: Math.max(1, ...cashFlowValues, 0),
        mostNegativeCashFlow: Math.abs(Math.min(0, ...cashFlowValues)),
        incomeVsOutflowMax: Math.max(1, ...flowMagnitudes, 0),
      },
      hasTransactionsInRange: incomeMinor > 0 || outflowMinor > 0,
      compactAxisValue,
    };
  }, [overview.categories, overview.transactions, range, requestedWindowId]);

  return {
    ...overview,
    ...presentation,
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
