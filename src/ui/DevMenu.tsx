import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '@/ui/tokens';

type DevMenuProps = {
  visible: boolean;
  onClose: () => void;
  onSignOut: () => void;
};

export default function DevMenu({ visible, onClose, onSignOut }: DevMenuProps) {
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => undefined}>
          <Text style={styles.title}>Developer menu</Text>
          <View style={styles.actions}>
            <Pressable style={({ pressed }) => [styles.action, pressed && styles.actionPressed]} onPress={onSignOut}>
              <Text style={styles.actionText}>Sign out</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    paddingHorizontal: spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 320,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: {
    ...typography.label,
    color: colors.textMuted,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  actions: {
    gap: spacing.sm,
  },
  action: {
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceAlt,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
  },
  actionPressed: {
    opacity: 0.85,
  },
  actionText: {
    ...typography.body,
    color: colors.danger,
    fontWeight: '600',
  },
});
