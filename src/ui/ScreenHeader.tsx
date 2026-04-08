import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
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

  return (
    <View style={styles.wrap}>
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
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  leading: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 },
  back: { padding: 2 },
  title: { ...typography.h2, color: colors.text },
  subtitle: { ...typography.label, color: colors.textMuted, marginTop: 2 },
  actions: { flexDirection: 'row', gap: spacing.sm },
  iconButton: { padding: 2 },
});
