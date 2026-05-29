import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { FontAwesome6 } from '@expo/vector-icons';
import { useNavigation, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, typography } from './tokens';
import { MotionView } from './MotionView';

type Action = {
  icon: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'default' | 'accent';
  badgeCount?: number;
  accessibilityLabel?: string;
};

type Avatar = {
  uri: string | null;
  onPress: () => void;
};

export function ScreenHeader({
  title,
  subtitle,
  back,
  onBack,
  actions,
  avatar,
}: {
  title: string;
  subtitle?: string;
  back?: boolean;
  onBack?: () => void;
  actions?: readonly Action[];
  avatar?: Avatar;
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
            <FontAwesome6 name="chevron-left" size={22} color={colors.text} />
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
              accessibilityRole="button"
              accessibilityLabel={action.accessibilityLabel}
              style={[styles.iconButton, action.disabled && styles.iconButtonDisabled]}
            >
              <FontAwesome6
                name={action.icon as never}
                size={20}
                color={action.tone === 'accent' && !action.disabled ? colors.accent : colors.text}
              />
              {typeof action.badgeCount === 'number' && action.badgeCount > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{action.badgeCount > 99 ? '99+' : String(action.badgeCount)}</Text>
                </View>
              ) : null}
            </Pressable>
          </MotionView>
        ))}
        {avatar ? (
          <MotionView
            index={actions?.length ?? 0}
            direction="right"
            distance={110}
            delayMs={90}
            style={styles.iconMotion}
          >
            <Pressable
              onPress={avatar.onPress}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Profile"
              style={styles.avatarButton}
            >
              {avatar.uri ? (
                <Image source={{ uri: avatar.uri }} style={styles.avatarImage} />
              ) : (
                <View style={styles.avatarFallback}>
                  <FontAwesome6 name="user" size={16} color={colors.textMuted} />
                </View>
              )}
            </Pressable>
          </MotionView>
        ) : null}
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
  iconButton: { padding: 4, position: 'relative' },
  iconButtonDisabled: { opacity: 0.4 },
  avatarButton: { marginLeft: spacing.xs },
  avatarImage: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatarFallback: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    ...typography.caption,
    color: colors.bg,
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '700',
  },
});
