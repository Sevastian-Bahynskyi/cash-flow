import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';
import { ThermalNumber } from './ThermalNumber';
import { auraFonts, bigAmount } from './type';

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
        <View style={[styles.card, { width: cardWidth }]} accessibilityViewIsModal>
          {visible ? <ThermalNumber text={bigAmount(Math.abs(keptMinor))} width={cardWidth} height={cardWidth * 0.52} /> : null}
          <Text style={styles.title}>Cycle closed.{'\n'}{kept ? `You kept ${bigAmount(keptMinor)} kr.` : `You went over by ${bigAmount(-keptMinor)} kr.`}</Text>
          <Text style={styles.body}>A new cycle starts today.</Text>
          <Pressable
            style={({ pressed }) => [styles.button, pressed && { opacity: 0.85 }]}
            onPress={() => {
              Haptics.selectionAsync().catch(() => undefined);
              onClose();
            }}
            accessibilityRole="button"
          >
            <Text style={styles.buttonText}>Start the new cycle</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 30, overflow: 'hidden', alignItems: 'center', paddingBottom: 24 },
  title: { fontFamily: auraFonts.body, fontSize: 26, lineHeight: 30, color: '#111111', textAlign: 'center', marginTop: 6, paddingHorizontal: 24 },
  body: { fontFamily: auraFonts.body, fontSize: 14, color: '#555555', marginTop: 6, marginBottom: 18 },
  button: { backgroundColor: '#111111', borderRadius: 14, minHeight: 50, alignSelf: 'stretch', marginHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontFamily: auraFonts.bodyStrong, fontSize: 16, color: '#FFFFFF' },
});
