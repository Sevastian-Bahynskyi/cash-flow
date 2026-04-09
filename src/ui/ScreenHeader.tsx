import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, typography } from './tokens';
import { MotionView } from './MotionView';

type Action = {
  icon: string;
  onPress: () => void;
  disabled?: boolean;
};

export function ScreenHeader({
  title,
  subtitle,
  back,
  onBack,
  actions,
}: {
  title: string;
  subtitle?: string;
  back?: boolean;
  onBack?: () => void;
  actions?: readonly Action[];
}) {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const handleBack = (): void => {
    if (onBack) {
      onBack();
      return;
    }
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    router.replace('/');
  };

  return (
    <View style={[styles.wrap, { paddingTop: Math.max(insets.top, spacing.md) }]}>
      <MotionView style={styles.leading} direction="left" distance={150} delayMs={30}>
        {back ? (
          <Pressable onPress={handleBack} hitSlop={12} style={styles.back}>
            <MaterialCommunityIcons name="chevron-left" size={22} color={colors.text} />
          </Pressable>
        ) : null}
        <View>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
      </MotionView>
      <View style={styles.actions}>
        {actions?.map((action, index) => (
          <MotionView
            key={`${action.icon}-${index}`}
            index={index}
            direction="right"
            distance={110}
            delayMs={90}
            style={styles.iconMotion}
          >
            <Pressable
              onPress={action.onPress}
              disabled={action.disabled}
              hitSlop={12}
              style={[styles.iconButton, action.disabled && styles.iconButtonDisabled]}
            >
              <MaterialCommunityIcons name={action.icon as never} size={20} color={colors.text} />
            </Pressable>
          </MotionView>
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
  iconMotion: { alignSelf: 'flex-start' },
  iconButton: { padding: 4 },
  iconButtonDisabled: { opacity: 0.4 },
});
