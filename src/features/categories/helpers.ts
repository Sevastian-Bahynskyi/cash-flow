import type { CategoryOverrideRow, CategoryRow } from './types';

export type CategoryMeta = {
  label: string;
  color: string;
  icon: string;
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
        label: `${parent?.name ?? 'Category'} · ${category.name}`,
        color: parent?.color ?? category.color,
        icon: category.icon,
      };
    } else {
      out[category.id] = {
        label: category.name,
        color: category.color,
        icon: category.icon,
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
