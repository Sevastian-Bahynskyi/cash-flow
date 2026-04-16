import { Platform, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import LightPillar from '@/ui/web/LightPillar';

export function WebBackdrop(): null | React.ReactElement {
    if (Platform.OS !== 'web') return null;

    return (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.root]}>
            <View style={styles.pillarWrap}>
                <LightPillar
                    topColor="#7C5CFF"
                    bottomColor="#F5B942"
                    intensity={0.34}
                    rotationSpeed={0.22}
                    glowAmount={0.0028}
                    pillarWidth={2.5}
                    pillarHeight={0.42}
                    noiseIntensity={0.12}
                    pillarRotation={8}
                    interactive={false}
                    mixBlendMode="soft-light"
                    quality="medium"
                />
            </View>
            <LinearGradient
                colors={['rgba(124,92,255,0.12)', 'rgba(11,11,15,0)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.leftGlow}
            />
            <LinearGradient
                colors={['rgba(245,185,66,0.08)', 'rgba(11,11,15,0)']}
                start={{ x: 1, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={styles.rightGlow}
            />
            <View style={styles.leftOrb} />
            <View style={styles.rightOrb} />

            <View style={styles.balanceCard}>
                <Text style={styles.balanceEyebrow}>Balance snapshot</Text>
                <Text style={styles.balanceAmount}>+24.810,00 kr.</Text>
                <Text style={styles.balanceMeta}>Income 42.500,00 kr. · Outflow 17.690,00 kr.</Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        zIndex: 0,
    },
    pillarWrap: {
        position: 'absolute',
        top: -160,
        left: -80,
        right: -80,
        height: 500,
        opacity: 0.36,
    },
    leftGlow: {
        position: 'absolute',
        top: -220,
        left: -220,
        width: 640,
        height: 640,
        borderRadius: 320,
    },
    rightGlow: {
        position: 'absolute',
        top: -180,
        right: -200,
        width: 560,
        height: 560,
        borderRadius: 280,
    },
    leftOrb: {
        position: 'absolute',
        top: '38%',
        left: '-4%',
        width: 240,
        height: 240,
        borderRadius: 999,
        backgroundColor: 'rgba(61,214,140,0.03)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.02)',
    },
    rightOrb: {
        position: 'absolute',
        bottom: '10%',
        right: '-3%',
        width: 320,
        height: 320,
        borderRadius: 999,
        backgroundColor: 'rgba(124,92,255,0.03)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.02)',
    },
    balanceCard: {
        position: 'absolute',
        right: 24,
        top: 84,
        width: 296,
        padding: 14,
        borderRadius: 16,
        backgroundColor: 'rgba(20,20,28,0.36)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    balanceEyebrow: {
        color: 'rgba(255,255,255,0.65)',
        fontSize: 12,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    balanceAmount: {
        marginTop: 8,
        color: '#3DD68C',
        fontSize: 30,
        fontWeight: '700',
    },
    balanceMeta: {
        marginTop: 8,
        color: 'rgba(255,255,255,0.7)',
        fontSize: 13,
    },
});
