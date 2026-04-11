import { colors } from '@/ui/tokens';
import type { TransactionKind } from '@/features/transactions/types';
import type { CategoryOverrideRow, CategoryRow } from './types';

export type CategoryMeta = {
  label: string;
  color: string;
  icon: string;
  name: string;
  parentName: string;
};

const normalize = (value: string): string => value.trim().toLowerCase();

const isTransferParentName = (value: string): boolean => normalize(value) === 'transfers';
const isIncomeParentName = (value: string): boolean => normalize(value) === 'income';
const isOtherIncomeName = (value: string): boolean => {
  const normalized = normalize(value);
  return normalized === 'other income' || normalized === 'others';
};

const incomeOtherTone = '#6F8F7D';
const expenseTransferTone = '#7C5CFF';

export const getDisplayCategoryName = (parentName: string, name: string): string =>
  isIncomeParentName(parentName) && isOtherIncomeName(name) ? 'Others' : name;

export const getCategoryDisplayColor = ({
  kind,
  parentName,
  name,
  parentColor,
  color,
}: {
  kind: TransactionKind;
  parentName: string;
  name: string;
  parentColor?: string | null;
  color?: string | null;
}): string => {
  if (isTransferParentName(parentName)) {
    return kind === 'income' ? colors.success : expenseTransferTone;
  }

  if (isIncomeParentName(parentName)) {
    return isOtherIncomeName(name) ? incomeOtherTone : colors.success;
  }

  return parentColor ?? color ?? colors.textMuted;
};

export const getCategoryMetaDisplayColor = (
  meta: Pick<CategoryMeta, 'parentName' | 'name' | 'color'> | null | undefined,
  kind: TransactionKind,
): string => {
  if (!meta) return colors.textMuted;
  return getCategoryDisplayColor({
    kind,
    parentName: meta.parentName,
    name: meta.name,
    color: meta.color,
    parentColor: meta.color,
  });
};

export const buildCategoryMeta = (
  categories: readonly CategoryRow[],
): Record<string, CategoryMeta> => {
  const parents = new Map<string, CategoryRow>();
  for (const category of categories) {
    if (category.level === 1) parents.set(category.id, category);
  }

  const out: Record<string, CategoryMeta> = {};
  for (const category of categories) {
    if (category.level === 2 && category.parent_id) {
      const parent = parents.get(category.parent_id);
      out[category.id] = {
        label: `${parent?.name ?? 'Category'} · ${getDisplayCategoryName(parent?.name ?? '', category.name)}`,
        color: parent?.color ?? category.color,
        icon: category.icon,
        name: getDisplayCategoryName(parent?.name ?? '', category.name),
        parentName: parent?.name ?? 'Category',
      };
    } else {
      out[category.id] = {
        label: category.name,
        color: category.color,
        icon: category.icon,
        name: category.name,
        parentName: '',
      };
    }
  }
  return out;
};

export const applyCategoryOverrides = (
  categories: readonly CategoryRow[],
  overrides: readonly CategoryOverrideRow[],
): CategoryRow[] => {
  if (overrides.length === 0) return [...categories];

  const overridesByCategoryId = new Map(overrides.map((override) => [override.category_id, override]));
  return categories.map((category) => {
    const override = overridesByCategoryId.get(category.id);
    if (!override) return category;

    return {
      ...category,
      name: override.name?.trim() ? override.name : category.name,
      icon: override.icon?.trim() ? override.icon : category.icon,
    };
  });
};
