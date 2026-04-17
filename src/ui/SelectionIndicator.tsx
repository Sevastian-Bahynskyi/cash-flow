import { StyleSheet, View } from 'react-native';
import { FontAwesome6 } from '@expo/vector-icons';
import { colors, radius } from '@/ui/tokens';

export function SelectionIndicator({ active }: { active: boolean }) {
  return (
    <View style={[styles.base, active && styles.active]}>
      {active ? <FontAwesome6 name="check" size={14} color={colors.text} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  active: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
});
