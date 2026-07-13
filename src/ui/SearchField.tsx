import { ActivityIndicator, Pressable, StyleSheet, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import { FontAwesome6 } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '@/ui/tokens';

type Props = {
  value: string;
  onChangeText: (next: string) => void;
  placeholder?: string;
  onClear?: () => void;
  isLoading?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function SearchField({ value, onChangeText, placeholder, onClear, isLoading = false, style }: Props) {
  const hasQuery = value.trim().length > 0;
  const clear = onClear ?? (() => onChangeText(''));
  return (
    <View style={[styles.wrap, style]}>
      <FontAwesome6 name="magnifying-glass" size={18} color={colors.textMuted} />
      <TextInput
        accessibilityRole="search"
        accessibilityLabel={placeholder ?? 'Search'}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        autoCorrect={false}
        autoCapitalize="none"
        style={styles.input}
      />
      {isLoading ? <ActivityIndicator size="small" color={colors.textMuted} /> : null}
      {!isLoading && hasQuery ? (
        <Pressable onPress={clear} hitSlop={12}>
          <FontAwesome6 name="circle-xmark" size={18} color={colors.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  input: {
    flex: 1,
    color: colors.text,
    ...typography.body,
    paddingVertical: 0,
  },
});
