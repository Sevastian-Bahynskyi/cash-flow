import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from './tokens';

type Props = {
  value: string;
  onChange: (next: string) => void;
  onClose?: () => void;
};

// Append with sane rules: max 2 decimals, single dot, max 9 integer digits,
// strip leading zeros unless it's "0." case.
const append = (current: string, ch: string): string => {
  if (ch === '.') {
    if (current.includes('.')) return current;
    if (current.length === 0) return '0.';
    return current + '.';
  }
  const dotAt = current.indexOf('.');
  if (dotAt >= 0) {
    const decimals = current.length - dotAt - 1;
    if (decimals >= 2) return current;
  } else if (current.length >= 9) {
    return current;
  }
  if (current === '0') return ch; // drop leading zero
  return current + ch;
};

const backspace = (current: string): string => {
  if (current.length <= 1) return '';
  return current.slice(0, -1);
};

const KEYS: string[][] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['.', '0', '⌫'],
];

function Key({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [styles.key, pressed && styles.keyPressed]}
      accessibilityRole="button"
      accessibilityLabel={label === '⌫' ? 'Backspace' : label}
    >
      <Text style={styles.keyText}>{label}</Text>
    </Pressable>
  );
}

export const NumericKeypad = memo(function NumericKeypad({ value, onChange, onClose }: Props) {
  const handle = (label: string): void => {
    if (label === '⌫') onChange(backspace(value));
    else onChange(append(value, label));
  };

  return (
    <View style={styles.wrap}>
      {onClose ? (
        <View style={styles.closeRow}>
          <Pressable
            onPress={onClose}
            hitSlop={6}
            style={({ pressed }) => [styles.closeButton, pressed && styles.keyPressed]}
            accessibilityRole="button"
            accessibilityLabel="Hide keypad"
          >
            <MaterialCommunityIcons name="keyboard-close-outline" size={16} color={colors.text} />
            <Text style={styles.closeButtonText}>Hide</Text>
          </Pressable>
        </View>
      ) : null}
      {KEYS.map((row, ri) => (
        <View key={ri} style={styles.row}>
          {row.map((label) => (
            <Key key={label} label={label} onPress={() => handle(label)} />
          ))}
        </View>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.sm,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    overflow: 'visible',
  },
  closeRow: {
    alignItems: 'flex-end',
    paddingBottom: spacing.xs,
  },
  closeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(245,185,66,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(245,185,66,0.32)',
  },
  closeButtonText: { ...typography.label, color: colors.text },
  row: { flexDirection: 'row', gap: spacing.sm },
  key: {
    flex: 1,
    paddingVertical: spacing.lg,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyPressed: { backgroundColor: colors.border },
  keyText: { ...typography.h2, color: colors.text, fontSize: 26 },
});
