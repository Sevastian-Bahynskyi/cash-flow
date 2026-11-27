import { useMemo, useState, type ReactElement } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing, typography } from '@/ui/tokens';
import { useAuth } from '@/features/auth/AuthProvider';
import { runDetached } from '@/lib/async';

type AuthEntryMode = 'sign-in' | 'sign-up';

type AuthEntryScreenProps = {
    mode: AuthEntryMode;
};

export function AuthEntryScreen({ mode }: AuthEntryScreenProps): ReactElement {
    const { signInWithGoogle } = useAuth();
    const router = useRouter();
    const [busy, setBusy] = useState(false);
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

    return (
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
            <View style={styles.brandCompact}>
                <Text style={styles.title}>{copy.title}</Text>
                <Text style={styles.subtitle}>{copy.subtitle}</Text>
            </View>

            <View style={styles.actions}>
                {summaryCard}
                <Pressable
                    onPress={() => runDetached(onPressPrimary(), 'auth.signIn')}
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
