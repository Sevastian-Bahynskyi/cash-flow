import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, spacing, typography } from '@/ui/tokens';

type Props = {
  title: string;
  style?: StyleProp<ViewStyle>;
  gap?: number;
  children?: ReactNode;
};

export function ErrorCard({ title, style, gap = spacing.xs, children }: Props) {
  return (
    <View style={[styles.card, { gap }, style]}>
      <Text style={styles.title}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(255,92,122,0.12)',
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,92,122,0.32)',
  },
  title: { ...typography.body, color: colors.text, fontWeight: '700' },
});
