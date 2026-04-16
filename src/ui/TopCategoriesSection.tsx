import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { MotionView } from '@/ui/MotionView';
import { ProgressBar } from '@/ui/ProgressBar';
import { colors, radius, spacing, typography } from '@/ui/tokens';

export type TopCategoryItem = {
    id: string;
    label: string;
    amountLabel: string;
    progress: number;
    color: string;
    amountColor?: string;
};

type TopCategoriesAction = {
    label: string;
    onPress: () => void;
    tone?: 'accent' | 'muted';
    disabled?: boolean;
};

type TopCategoriesSectionProps = {
    title: string;
    items: readonly TopCategoryItem[];
    emptyLabel: string;
    actions?: readonly TopCategoriesAction[];
    onPressItem?: (item: TopCategoryItem) => void;
};

export function TopCategoriesSection({ title, items, emptyLabel, actions, onPressItem }: TopCategoriesSectionProps): JSX.Element {
    const resolvedActions = actions ?? [];
    return (
        <View style={styles.section}>
            <View style={styles.headerRow}>
                <Text style={styles.sectionTitle}>{title}</Text>
                {resolvedActions.length > 0 ? (
                    <View style={styles.actions}>
                        {resolvedActions.map((action) => (
                            <Pressable
                                key={action.label}
                                onPress={action.onPress}
                                disabled={action.disabled}
                                style={({ pressed }) => [
                                    styles.actionButton,
                                    action.tone === 'muted' ? styles.actionMuted : styles.actionAccent,
                                    (pressed || action.disabled) && styles.pressed,
                                ]}
                            >
                                <Text
                                    style={[
                                        styles.actionText,
                                        action.tone === 'muted' ? styles.actionTextMuted : styles.actionTextAccent,
                                    ]}
                                >
                                    {action.label}
                                </Text>
                            </Pressable>
                        ))}
                    </View>
                ) : null}
            </View>
            <View style={styles.sectionBody}>
                {items.length === 0 ? (
                    <View style={styles.emptyCard}>
                        <Text style={styles.emptyText}>{emptyLabel}</Text>
                    </View>
                ) : (
                    items.map((item, index) => {
                        const content = (
                            <>
                                <View style={styles.row}>
                                    <Text style={styles.categoryLabel}>{item.label}</Text>
                                    <Text style={[styles.categoryAmount, { color: item.amountColor ?? item.color }]} numberOfLines={1}>
                                        {item.amountLabel}
                                    </Text>
                                </View>
                                <ProgressBar value={item.progress} color={item.color} />
                            </>
                        );

                        return (
                            <MotionView key={item.id} index={index} direction="left" distance={145} delayMs={250}>
                                {onPressItem ? (
                                    <Pressable
                                        accessibilityRole="button"
                                        accessibilityLabel={`Show ${item.label} transactions`}
                                        style={({ pressed }) => [styles.card, pressed && styles.pressed]}
                                        onPress={() => onPressItem(item)}
                                    >
                                        {content}
                                    </Pressable>
                                ) : (
                                    <View style={styles.card}>{content}</View>
                                )}
                            </MotionView>
                        );
                    })
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    section: { paddingHorizontal: spacing.lg, gap: spacing.sm },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
    sectionTitle: { ...typography.label, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
    actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    actionButton: {
        borderRadius: radius.pill,
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xs,
        borderWidth: 1,
    },
    actionAccent: { borderColor: colors.accent, backgroundColor: 'rgba(245,185,66,0.18)' },
    actionMuted: { borderColor: colors.border, backgroundColor: colors.surfaceAlt },
    actionText: { ...typography.label, fontWeight: '600' },
    actionTextAccent: { color: colors.text },
    actionTextMuted: { color: colors.textMuted },
    sectionBody: { gap: spacing.sm },
    emptyCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg },
    emptyText: { ...typography.body, color: colors.textMuted },
    card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
    pressed: { opacity: 0.86 },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
    categoryLabel: { ...typography.body, color: colors.text, flex: 1 },
    categoryAmount: { ...typography.body, color: colors.text, fontWeight: '600' },
});