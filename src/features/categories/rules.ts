import type { CategoryOption, CategoryRow } from './types';

const normalize = (value: string): string => value.trim().toLowerCase();

export const isIncomeCategoryOption = (option: CategoryOption | null | undefined): boolean =>
  Boolean(option && normalize(option.parentName) === 'income');

export const isSalaryCategoryOption = (option: CategoryOption | null | undefined): boolean =>
  Boolean(option && isIncomeCategoryOption(option) && normalize(option.name) === 'salary');

export const isMobilePayCategoryOption = (option: CategoryOption | null | undefined): boolean =>
  Boolean(
    option &&
      ((normalize(option.parentName) === 'transfers' &&
        normalize(option.name) === 'mobilepay') ||
        option.icon === 'brand:mobilepay'),
  );

export const findSalaryCategoryOption = (
  options: readonly CategoryOption[],
): CategoryOption | null =>
  options.find((option) => isSalaryCategoryOption(option)) ?? null;

export const findIncomeParentIds = (categories: readonly CategoryRow[]): Set<string> =>
  new Set(
    categories
      .filter((category) => category.level === 1 && normalize(category.name) === 'income')
      .map((category) => category.id),
  );

export const isIncomeCategoryRow = (
  category: CategoryRow,
  incomeParentIds: ReadonlySet<string>,
): boolean =>
  incomeParentIds.has(category.id) || (category.parent_id ? incomeParentIds.has(category.parent_id) : false);
