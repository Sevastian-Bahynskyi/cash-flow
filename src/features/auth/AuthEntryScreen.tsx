import { useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing, typography } from '@/ui/tokens';
import { useAuth } from '@/features/auth/AuthProvider';

type AuthEntryMode = 'sign-in' | 'sign-up';

type AuthEntryScreenProps = {
    mode: AuthEntryMode;
};

export function AuthEntryScreen({ mode }: AuthEntryScreenProps): JSX.Element {
    const { signInWithGoogle } = useAuth();
    const router = useRouter();
    const [busy, setBusy] = useState(false);
    const { width } = useWindowDimensions();
    const isDesktop = Platform.OS === 'web' && width >= 960;
    const isSignUp = mode === 'sign-up';

    const copy = useMemo(
        () => ({
            title: isSignUp ? 'Create your Cash Flow account' : 'Welcome back',
            subtitle: isSignUp ? 'One Google tap and your budgeting space is ready.' : 'Sign in and pick up your flow instantly.',
            primaryAction: isSignUp ? 'Create account with Google' : 'Continue with Google',
            switchLabel: isSignUp ? 'Already have an account?' : 'Need an account?',
            switchAction: isSignUp ? 'Sign in' : 'Sign up',
            switchRoute: isSignUp ? '/sign-in' : '/sign-up',
        }),
        [isSignUp],
    );

    const onPressPrimary = async (): Promise<void> => {
        setBusy(true);
        try {
            await signInWithGoogle();
        } finally {
            setBusy(false);
        }
    };

    const summaryCard = (
        <View style={styles.balanceCard}>
            <Text style={styles.balanceEyebrow}>Balance snapshot</Text>
            <Text style={styles.balanceAmount}>+24.810,00 kr.</Text>
            <Text style={styles.balanceMeta}>Income 42.500,00 kr. · Outflow 17.690,00 kr.</Text>
        </View>
    );

    if (isDesktop) {
        return (
            <SafeAreaView style={styles.desktopContainer} edges={['top', 'bottom']}>
                <View style={styles.desktopShell}>
                    <View style={styles.desktopIntro}>
                        <Text style={styles.kicker}>Behavioral budgeting</Text>
                        <Text style={styles.desktopTitle}>Cash Flow</Text>
                        <Text style={styles.desktopSubtitle}>{copy.subtitle}</Text>
                        {summaryCard}
                    </View>

                    <View style={styles.desktopCard}>
                        <View style={styles.brand}>
                            <Text style={styles.title}>{copy.title}</Text>
                            <Text style={styles.subtitle}>OAuth only · no passwords</Text>
                        </View>
                        <View style={styles.actions}>
                            <Pressable
                                onPress={() => {
                                    void onPressPrimary();
                                }}
                                disabled={busy}
                                style={({ pressed }) => [styles.btn, pressed && styles.btnPressed, busy && styles.btnDisabled]}
                            >
                                {busy ? <ActivityIndicator color={colors.text} /> : <Text style={styles.btnText}>{copy.primaryAction}</Text>}
                            </Pressable>

                            <Pressable
                                onPress={() => {
                                    router.replace(copy.switchRoute as '/sign-in' | '/sign-up');
                                }}
                                style={({ pressed }) => [styles.ghostAction, pressed && styles.btnPressed]}
                            >
                                <Text style={styles.ghostText}>{copy.switchLabel} <Text style={styles.ghostTextAccent}>{copy.switchAction}</Text></Text>
                            </Pressable>
                        </View>
                    </View>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
            <View style={styles.brandCompact}>
                <Text style={styles.title}>{copy.title}</Text>
                <Text style={styles.subtitle}>{copy.subtitle}</Text>
            </View>

            <View style={styles.actions}>
                {summaryCard}
                <Pressable
                    onPress={() => {
                        void onPressPrimary();
                    }}
                    disabled={busy}
                    style={({ pressed }) => [styles.btn, pressed && styles.btnPressed, busy && styles.btnDisabled]}
                >
                    {busy ? <ActivityIndicator color={colors.text} /> : <Text style={styles.btnText}>{copy.primaryAction}</Text>}
                </Pressable>

                <Pressable
                    onPress={() => {
                        router.replace(copy.switchRoute as '/sign-in' | '/sign-up');
                    }}
                    style={({ pressed }) => [styles.ghostAction, pressed && styles.btnPressed]}
                >
                    <Text style={styles.ghostText}>{copy.switchLabel} <Text style={styles.ghostTextAccent}>{copy.switchAction}</Text></Text>
                </Pressable>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg, justifyContent: 'space-between', paddingVertical: spacing.xxl },
    desktopContainer: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: spacing.xl },
    desktopShell: { width: '100%', maxWidth: 1240, alignSelf: 'center', flexDirection: 'row', gap: spacing.xl, alignItems: 'stretch' },
    desktopIntro: { flex: 1.1, justifyContent: 'center', padding: spacing.xl, gap: spacing.lg },
    desktopCard: {
        flex: 0.9,
        backgroundColor: 'rgba(22,22,29,0.88)',
        borderRadius: 28,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.09)',
        padding: spacing.xl,
        justifyContent: 'space-between',
        minHeight: 520,
        shadowColor: '#000',
        shadowOpacity: 0.28,
        shadowRadius: 28,
        shadowOffset: { width: 0, height: 18 },
    },
    kicker: { ...typography.label, color: colors.accentAlt, textTransform: 'uppercase', letterSpacing: 2 },
    desktopTitle: { ...typography.h1, color: colors.text, fontSize: 72, lineHeight: 74 },
    desktopSubtitle: { ...typography.body, color: colors.textMuted, maxWidth: 560, fontSize: 18, lineHeight: 26 },
    brand: { gap: spacing.sm },
    brandCompact: { paddingTop: spacing.xxl * 2, paddingHorizontal: spacing.xl, gap: spacing.sm },
    title: { ...typography.h1, color: colors.text, fontSize: 44 },
    subtitle: { ...typography.body, color: colors.textMuted },
    actions: { paddingHorizontal: spacing.xl, gap: spacing.md, alignItems: 'center' },
    btn: {
        alignSelf: 'stretch',
        backgroundColor: colors.accent,
        borderRadius: radius.lg,
        paddingVertical: spacing.lg,
        alignItems: 'center',
    },
    btnPressed: { opacity: 0.85 },
    btnDisabled: { opacity: 0.6 },
    btnText: { ...typography.body, color: colors.text, fontWeight: '600' },
    ghostAction: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
    ghostText: { ...typography.label, color: colors.textMuted },
    ghostTextAccent: { color: colors.accent, fontWeight: '700' },
    balanceCard: {
        alignSelf: 'stretch',
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: radius.lg,
        padding: spacing.md,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.09)',
        gap: spacing.xs,
    },
    balanceEyebrow: { ...typography.label, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
    balanceAmount: { ...typography.h2, color: colors.success },
    balanceMeta: { ...typography.label, color: colors.textMuted },
});
