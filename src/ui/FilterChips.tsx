import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from './tokens';
import { MotionView } from './MotionView';

export function FilterChips<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly { label: string; value: T }[];
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.wrap}>
      {options.map((option, index) => {
        const active = option.value === value;
        return (
          <MotionView
            key={option.value}
            index={index}
            direction={active ? 'down' : 'up'}
            distance={70}
            delayMs={120}
            stepMs={55}
          >
            <Pressable
              style={({ pressed }) => [
                styles.chip,
                active && styles.chipActive,
                pressed && styles.chipPressed,
              ]}
              onPress={() => onChange(option.value)}
            >
              <Text style={[styles.text, active && styles.textActive]}>{option.label}</Text>
            </Pressable>
          </MotionView>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
    paddingHorizontal: spacing.lg,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: 'rgba(124,92,255,0.18)',
    borderColor: colors.accent,
  },
  chipPressed: { opacity: 0.85 },
  text: { ...typography.label, color: colors.textMuted },
  textActive: { color: colors.text },
});
