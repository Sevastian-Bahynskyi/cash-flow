import { useEffect } from 'react';
import { Platform, Pressable, StyleSheet, Text, ViewStyle } from 'react-native';
import { FontAwesome6 } from '@expo/vector-icons';
import Animated, {
    Easing,
    interpolate,
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from 'react-native-reanimated';
import { colors, radius, typography } from '@/ui/tokens';

const DEFAULT_HIDE_TRANSLATE = 110;
const DEFAULT_TOGGLE_MS = 300;

type FloatingActionButtonProps = {
    icon: keyof typeof FontAwesome6.glyphMap;
    label: string;
    accessibilityLabel: string;
    onPress: () => void;
    bottom: number;
    right: number;
    backgroundColor?: string;
    hidden?: boolean;
    animateOnMount?: boolean;
    hideTranslate?: number;
    durationMs?: number;
};

export function FloatingActionButton({
    icon,
    label,
    accessibilityLabel,
    onPress,
    bottom,
    right,
    backgroundColor = colors.accent,
    hidden = false,
    animateOnMount = false,
    hideTranslate = DEFAULT_HIDE_TRANSLATE,
    durationMs = DEFAULT_TOGGLE_MS,
}: FloatingActionButtonProps) {
    const visibility = useSharedValue(hidden || animateOnMount ? 1 : 0);

    useEffect(() => {
        visibility.value = withTiming(hidden ? 1 : 0, {
            duration: durationMs,
            easing: Easing.out(Easing.cubic),
        });
    }, [durationMs, hidden, visibility]);

    const motionStyle = useAnimatedStyle((): ViewStyle => ({
        transform: [{ translateY: interpolate(visibility.value, [0, 1], [0, hideTranslate]) }],
        opacity: interpolate(visibility.value, [0, 1], [1, 0]),
    }));

    return (
        <Animated.View
            style={[styles.outer, { bottom, right }, motionStyle]}
            pointerEvents={hidden ? 'none' : 'auto'}
        >
            <Pressable
                accessibilityRole="button"
                accessibilityLabel={accessibilityLabel}
                onPress={Platform.OS === 'web' ? undefined : onPress}
                onPressIn={Platform.OS === 'web' ? onPress : undefined}
                style={({ pressed }) => [styles.fab, { backgroundColor }, pressed && styles.fabPressed]}
            >
                <FontAwesome6 name={icon} size={24} color={colors.text} />
                <Text style={styles.fabLabel}>{label}</Text>
            </Pressable>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    outer: {
        position: 'absolute',
        width: 72,
        height: 72,
        zIndex: 30,
    },
    fab: {
        width: 72,
        height: 72,
        borderRadius: radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOpacity: 0.34,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 10 },
        elevation: 14,
    },
    fabPressed: { opacity: 0.86, transform: [{ scale: 0.98 }] },
    fabLabel: {
        ...typography.label,
        color: colors.text,
        marginTop: 2,
    },
});
