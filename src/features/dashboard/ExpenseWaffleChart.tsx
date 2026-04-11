import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { DashboardCategoryBreakdown } from './useDashboard';
import { colors, radius, spacing } from '@/ui/tokens';

const WAFFLE_COLUMNS = 10;
const WAFFLE_ROWS = 10;
const WAFFLE_CELLS = WAFFLE_COLUMNS * WAFFLE_ROWS;
const CELL_GAP = spacing.xs;

type Props = {
  categories: readonly DashboardCategoryBreakdown[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  size: number;
};

type WaffleCell = {
  key: string;
  categoryIndex: number | null;
  color: string;
};

const buildCellCounts = (categories: readonly DashboardCategoryBreakdown[]): number[] => {
  const rawCounts = categories.map((category) => category.share * WAFFLE_CELLS);
  const counts = rawCounts.map((count) => Math.floor(count));
  const roundedTotal = Math.min(
    WAFFLE_CELLS,
    Math.round(rawCounts.reduce((sum, count) => sum + count, 0)),
  );

  let remaining = Math.max(0, roundedTotal - counts.reduce((sum, count) => sum + count, 0));

  const rankedRemainders = rawCounts
    .map((count, index) => ({
      index,
      remainder: count - (counts[index] ?? 0),
      amountMinor: categories[index]?.amountMinor ?? 0,
    }))
    .sort((left, right) => right.remainder - left.remainder || right.amountMinor - left.amountMinor);

  for (const item of rankedRemainders) {
    if (remaining === 0) break;
    if ((categories[item.index]?.share ?? 0) <= 0) continue;
    counts[item.index] = (counts[item.index] ?? 0) + 1;
    remaining -= 1;
  }

  return counts;
};

export function ExpenseWaffleChart({ categories, selectedIndex, onSelect, size }: Props) {
  const cellSize = Math.max(12, Math.floor((size - CELL_GAP * (WAFFLE_COLUMNS - 1)) / WAFFLE_COLUMNS));
  const gridWidth = cellSize * WAFFLE_COLUMNS + CELL_GAP * (WAFFLE_COLUMNS - 1);
  const gridHeight = cellSize * WAFFLE_ROWS + CELL_GAP * (WAFFLE_ROWS - 1);
  const cellRadius = Math.max(4, Math.min(radius.sm, Math.floor(cellSize / 4)));

  const cells = useMemo(() => {
    const counts = buildCellCounts(categories);
    const filledCells = counts.flatMap((count, categoryIndex) =>
      Array.from({ length: count }, (_, cellIndex) => ({
        key: `${categories[categoryIndex]?.categoryId ?? categoryIndex}-${cellIndex}`,
        categoryIndex,
        color: categories[categoryIndex]?.color ?? colors.accent,
      })),
    );

    const emptyCount = Math.max(0, WAFFLE_CELLS - filledCells.length);
    const emptyCells = Array.from({ length: emptyCount }, (_, cellIndex) => ({
      key: `empty-${cellIndex}`,
      categoryIndex: null,
      color: 'rgba(255,255,255,0.05)',
    }));

    return [...filledCells, ...emptyCells] satisfies WaffleCell[];
  }, [categories]);

  return (
    <View style={[styles.container, { width: gridWidth, height: gridHeight }]}>
      {cells.map((cell) => {
        const category = cell.categoryIndex === null ? null : categories[cell.categoryIndex] ?? null;
        const isSelected = cell.categoryIndex === selectedIndex;

        return (
          <Pressable
            key={cell.key}
            accessibilityRole={category ? 'button' : undefined}
            accessibilityLabel={category ? `Show ${category.label}` : undefined}
            disabled={!category}
            onPress={category ? () => onSelect(cell.categoryIndex as number) : undefined}
            style={({ pressed }) => [
              styles.cell,
              {
                width: cellSize,
                height: cellSize,
                borderRadius: cellRadius,
              },
              category ? { backgroundColor: cell.color } : styles.emptyCell,
              category && isSelected ? styles.selectedCell : null,
              category && !isSelected ? styles.unselectedCell : null,
              pressed && category ? styles.pressedCell : null,
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: CELL_GAP,
    alignSelf: 'center',
  },
  cell: {
    borderWidth: 1,
    borderColor: 'transparent',
  },
  emptyCell: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderColor: colors.border,
  },
  selectedCell: {
    borderColor: 'rgba(255,255,255,0.9)',
    opacity: 1,
  },
  unselectedCell: {
    opacity: 0.64,
  },
  pressedCell: {
    opacity: 0.84,
  },
});
