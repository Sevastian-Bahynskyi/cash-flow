import { Modal, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';
import Animated, { Easing, Keyframe } from 'react-native-reanimated';
import { Press } from '@/ui/kit/ui';
import { ThermalNumber } from './ThermalNumber';
import { auraFonts, bigAmount } from './type';

// the card rises and settles as the scrim fades; never from nothing
const CARD_IN = new Keyframe({
  0: { opacity: 0, transform: [{ translateY: 24 }, { scale: 0.94 }] },
  100: { opacity: 1, transform: [{ translateY: 0 }, { scale: 1 }], easing: Easing.bezier(0.23, 1, 0.32, 1) },
}).duration(520);

type Props = { visible: boolean; keptMinor: number; onClose: () => void };

/** The rare moment: a cycle has closed. The kept amount burns in as a thermal number. */
export function CycleClosedMoment({ visible, keptMinor, onClose }: Props) {
  const { width } = useWindowDimensions();
  const cardWidth = Math.min(width - 48, 360);
  const kept = keptMinor >= 0;

  useEffect(() => {
    if (visible) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.scrim}>
        <Animated.View entering={CARD_IN} style={[styles.card, { width: cardWidth }]} accessibilityViewIsModal>
          {visible ? <ThermalNumber text={bigAmount(Math.abs(keptMinor))} width={cardWidth} height={cardWidth * 0.52} /> : null}
          <Text style={styles.title}>Cycle closed.{'\n'}{kept ? `You kept ${bigAmount(keptMinor)} kr.` : `You went over by ${bigAmount(-keptMinor)} kr.`}</Text>
          <Text style={styles.body}>A new cycle starts today.</Text>
          <View style={styles.buttonSlot}>
          <Press
            style={styles.button}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
              onClose();
            }}
            accessibilityRole="button"
          >
            <Text style={styles.buttonText}>Start the new cycle</Text>
          </Press>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 30, overflow: 'hidden', alignItems: 'center', paddingBottom: 24 },
  title: { fontFamily: auraFonts.body, fontSize: 26, lineHeight: 30, color: '#111111', textAlign: 'center', marginTop: 6, paddingHorizontal: 24 },
  body: { fontFamily: auraFonts.body, fontSize: 14, color: '#555555', marginTop: 6, marginBottom: 18 },
  buttonSlot: { alignSelf: 'stretch', marginHorizontal: 20 },
  button: { backgroundColor: '#111111', borderRadius: 14, minHeight: 50, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontFamily: auraFonts.bodyStrong, fontSize: 16, color: '#FFFFFF' },
});
