import type { CategoryOption, CategoryRow } from './types';

const normalize = (value: string): string => value.trim().toLowerCase();

const isIncomeParentName = (value: string): boolean => normalize(value) === 'income';
const isTransferParentName = (value: string): boolean => normalize(value) === 'transfers';
const isOtherIncomeName = (value: string): boolean => {
  const normalized = normalize(value);
  return normalized === 'other income' || normalized === 'others';
};

export const isIncomeCategoryOption = (option: CategoryOption | null | undefined): boolean =>
  Boolean(option && isIncomeParentName(option.parentName));

export const isSalaryCategoryOption = (option: CategoryOption | null | undefined): boolean =>
  Boolean(option && isIncomeCategoryOption(option) && normalize(option.name) === 'salary');

export const isTransferCategoryOption = (option: CategoryOption | null | undefined): boolean =>
  Boolean(option && isTransferParentName(option.parentName));

export const isGenericTransferCategoryOption = (option: CategoryOption | null | undefined): boolean =>
  Boolean(option && isTransferCategoryOption(option) && normalize(option.name) === 'transfer');

export const isOtherIncomeCategoryOption = (option: CategoryOption | null | undefined): boolean =>
  Boolean(option && isIncomeCategoryOption(option) && isOtherIncomeName(option.name));

export const isAllowedIncomeCategoryOption = (option: CategoryOption | null | undefined): boolean =>
  Boolean(
    option &&
    (isSalaryCategoryOption(option) ||
      isTransferCategoryOption(option) ||
      isOtherIncomeCategoryOption(option)),
  );

export const isMobilePayCategoryOption = (option: CategoryOption | null | undefined): boolean =>
  Boolean(
    option &&
    ((isTransferParentName(option.parentName) &&
      normalize(option.name) === 'mobilepay') ||
      option.icon === 'brand:mobilepay'),
  );

export const findSalaryCategoryOption = (
  options: readonly CategoryOption[],
): CategoryOption | null =>
  options.find((option) => isSalaryCategoryOption(option)) ?? null;

export const findTransferCategoryOption = (
  options: readonly CategoryOption[],
): CategoryOption | null =>
  options.find((option) => isGenericTransferCategoryOption(option)) ??
  options.find((option) => isTransferCategoryOption(option) && !isMobilePayCategoryOption(option)) ??
  options.find((option) => isTransferCategoryOption(option)) ??
  null;

/** Shared-account top-up: prefer Transfers · Top up, else generic Transfers · Transfer. */
export const findSharedTopupCategoryOption = (
  options: readonly CategoryOption[],
): CategoryOption | null => {
  const topUp = options.find(
    (option) => isTransferCategoryOption(option) && normalize(option.name) === 'top up',
  );
  if (topUp) return topUp;
  return findTransferCategoryOption(options);
};

export const findOtherIncomeCategoryOption = (
  options: readonly CategoryOption[],
): CategoryOption | null =>
  options.find((option) => isOtherIncomeCategoryOption(option)) ?? null;

export const normalizeIncomeCategoryOption = (
  option: CategoryOption | null | undefined,
  options: readonly CategoryOption[],
): CategoryOption | null => {
  if (option && isIncomeCategoryOption(option)) return option;
  return findOtherIncomeCategoryOption(options);
};

export const findIncomeParentIds = (categories: readonly CategoryRow[]): Set<string> =>
  new Set(
    categories
      .filter((category) => category.level === 1 && isIncomeParentName(category.name))
      .map((category) => category.id),
  );

export const isIncomeCategoryRow = (
  category: CategoryRow,
  incomeParentIds: ReadonlySet<string>,
): boolean =>
  incomeParentIds.has(category.id) || (category.parent_id ? incomeParentIds.has(category.parent_id) : false);
