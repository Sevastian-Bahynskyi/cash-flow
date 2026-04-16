import { Platform, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

export function WebBackdrop(): null | React.ReactElement {
  if (Platform.OS !== 'web') return null;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={['rgba(124,92,255,0.18)', 'rgba(11,11,15,0)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.leftGlow}
      />
      <LinearGradient
        colors={['rgba(245,185,66,0.12)', 'rgba(11,11,15,0)']}
        start={{ x: 1, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.rightGlow}
      />
      <View style={styles.leftOrb} />
      <View style={styles.rightOrb} />
    </View>
  );
}

const styles = StyleSheet.create({
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
    backgroundColor: 'rgba(61,214,140,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  rightOrb: {
    position: 'absolute',
    bottom: '10%',
    right: '-3%',
    width: 320,
    height: 320,
    borderRadius: 999,
    backgroundColor: 'rgba(124,92,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
});
