import { Pressable, StyleSheet, View } from 'react-native';
import { FontAwesome6 } from '@expo/vector-icons';
import { colors, radius, spacing } from '@/ui/tokens';

type Props = {
  onPrev: () => void;
  onNext: () => void;
  prevDisabled?: boolean;
  nextDisabled?: boolean;
};

export function HeroPagerArrows({ onPrev, onNext, prevDisabled = false, nextDisabled = false }: Props) {
  return (
    <View pointerEvents="box-none" style={styles.wrap}>
      {prevDisabled ? (
        <View style={styles.spacer} />
      ) : (
        <Pressable style={({ pressed }) => [styles.arrow, pressed && styles.pressed]} onPress={onPrev}>
          <FontAwesome6 name="chevron-left" size={24} color={colors.text} />
        </Pressable>
      )}
      {nextDisabled ? (
        <View style={styles.spacer} />
      ) : (
        <Pressable style={({ pressed }) => [styles.arrow, pressed && styles.pressed]} onPress={onNext}>
          <FontAwesome6 name="chevron-right" size={24} color={colors.text} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: spacing.sm,
    right: spacing.sm,
    top: 0,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  spacer: { width: 34 },
  arrow: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(11,11,15,0.46)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
});
