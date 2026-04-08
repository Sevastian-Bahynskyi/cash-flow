import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, typography } from './tokens';

type Action = {
  icon: string;
  onPress: () => void;
};

export function ScreenHeader({
  title,
  subtitle,
  back,
  actions,
}: {
  title: string;
  subtitle?: string;
  back?: boolean;
  actions?: readonly Action[];
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrap, { paddingTop: Math.max(insets.top, spacing.md) }]}>
      <View style={styles.leading}>
        {back ? (
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.back}>
            <MaterialCommunityIcons name="chevron-left" size={22} color={colors.text} />
          </Pressable>
        ) : null}
        <View>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
      </View>
      <View style={styles.actions}>
        {actions?.map((action, index) => (
          <Pressable key={`${action.icon}-${index}`} onPress={action.onPress} hitSlop={12} style={styles.iconButton}>
            <MaterialCommunityIcons name={action.icon as never} size={20} color={colors.text} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  leading: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, flex: 1 },
  back: { padding: 2, marginTop: 1 },
  title: { ...typography.h2, color: colors.text },
  subtitle: { ...typography.label, color: colors.textMuted, marginTop: 2 },
  actions: { flexDirection: 'row', gap: spacing.sm, paddingTop: 2 },
  iconButton: { padding: 4 },
});
