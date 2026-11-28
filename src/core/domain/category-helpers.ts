import type { CategoryOverrideRow, CategoryRow } from './categories-types';

export type CategoryMeta = {
  label: string;
  color: string;
  icon: string;
  name: string;
  parentName: string;
};

const normalize = (value: string): string => value.trim().toLowerCase();

const isIncomeParentName = (value: string): boolean => normalize(value) === 'income';
const isOtherIncomeName = (value: string): boolean => {
  const normalized = normalize(value);
  return normalized === 'other income' || normalized === 'others';
};

export const getDisplayCategoryName = (parentName: string, name: string): string =>
  isIncomeParentName(parentName) && isOtherIncomeName(name) ? 'Others' : name;

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
