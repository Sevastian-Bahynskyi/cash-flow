import type { CategoryOption, CategoryRow } from './categories-types';

const normalize = (value: string): string => value.trim().toLowerCase();

const isIncomeParentName = (value: string): boolean => normalize(value) === 'income';
const isTransferParentName = (value: string): boolean => normalize(value) === 'transfers';
const isOtherIncomeName = (value: string): boolean => {
  const normalized = normalize(value);
  return normalized === 'other income' || normalized === 'others';
};

export const isIncomeCategoryOption = (option: CategoryOption | null | undefined): boolean =>
  Boolean(option && isIncomeParentName(option.parentName));

export const isTransferCategoryOption = (option: CategoryOption | null | undefined): boolean =>
  Boolean(option && isTransferParentName(option.parentName));

export const isOtherIncomeCategoryOption = (option: CategoryOption | null | undefined): boolean =>
  Boolean(option && isIncomeCategoryOption(option) && isOtherIncomeName(option.name));

export const isAllowedIncomeCategoryOption = (option: CategoryOption | null | undefined): boolean =>
  Boolean(
    option &&
    (isIncomeCategoryOption(option) ||
      isTransferCategoryOption(option) ||
      isOtherIncomeCategoryOption(option)),
  );

export const findIncomeParentIds = (categories: readonly CategoryRow[]): Set<string> =>
  new Set(
    categories
      .filter((category) => category.level === 1 && isIncomeParentName(category.name))
      .map((category) => category.id),
  );
