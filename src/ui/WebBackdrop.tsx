import { Platform, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

export function WebBackdrop(): null | React.ReactElement {
    if (Platform.OS !== 'web') return null;

    return (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.root]}>
            <LinearGradient
                colors={['rgba(124,92,255,0.09)', 'rgba(11,11,15,0)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.leftGlow}
            />
            <View style={styles.topRule} />
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        zIndex: 0,
    },
    leftGlow: {
        position: 'absolute',
        top: -280,
        left: 120,
        width: 720,
        height: 720,
        borderRadius: 360,
    },
    topRule: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.06)',
    },
});
