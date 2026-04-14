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

type TopCategoriesSectionProps = {
    title: string;
    items: readonly TopCategoryItem[];
    emptyLabel: string;
    onPressItem?: (item: TopCategoryItem) => void;
};

export function TopCategoriesSection({ title, items, emptyLabel, onPressItem }: TopCategoriesSectionProps): JSX.Element {
    return (
        <View style={styles.section}>
            <Text style={styles.sectionTitle}>{title}</Text>
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
    sectionTitle: { ...typography.label, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
    sectionBody: { gap: spacing.sm },
    emptyCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg },
    emptyText: { ...typography.body, color: colors.textMuted },
    card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
    pressed: { opacity: 0.86 },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
    categoryLabel: { ...typography.body, color: colors.text, flex: 1 },
    categoryAmount: { ...typography.body, color: colors.text, fontWeight: '600' },
});