import { ReactElement } from 'react';
import { ImageBackground, View, Text, StyleSheet } from 'react-native';
import { colors, radius, spacing, typography } from './tokens';

export type HeroCardProps = {
    eyebrow?: string;
    dateRange?: string;
    amount: string;
    meta?: string;
};

export function HeroCard({ eyebrow, dateRange, amount, meta }: HeroCardProps): ReactElement {
    return (
        <ImageBackground
            source={require('../../assets/grad-back.jpg')}
            resizeMode="cover"
            style={styles.hero}
            imageStyle={styles.heroImage}
        >
            <View style={styles.overlay} />
            {eyebrow && (
                <View style={styles.header}>
                    <Text style={styles.eyebrow}>{eyebrow}</Text>
                    {dateRange && <Text style={styles.dateRange}>{dateRange}</Text>}
                </View>
            )}
            <Text style={styles.amount}>{amount}</Text>
            {meta && <Text style={styles.meta}>{meta}</Text>}
        </ImageBackground>
    );
}

const styles = StyleSheet.create({
    hero: {
        borderRadius: radius.lg,
        overflow: 'hidden',
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        gap: spacing.xs,
        backgroundColor: colors.surface,
    },
    heroImage: { borderRadius: radius.lg },
    overlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(10, 18, 25, 0.58)',
    },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
    eyebrow: { ...typography.label, color: '#E8F2FF', textTransform: 'uppercase', letterSpacing: 0.5, flex: 0 },
    dateRange: { ...typography.label, color: '#D6E7FF', fontSize: 11, letterSpacing: 0.3 },
    amount: { ...typography.amount, color: colors.text },
    meta: { ...typography.label, color: '#D6E7FF' },
});
