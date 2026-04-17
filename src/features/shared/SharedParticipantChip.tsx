import { StyleSheet, Text } from 'react-native';

export function SharedParticipantChip({ participant }: { participant: 'me' | 'gf' }) {
  const style = participant === 'gf' ? styles.gf : styles.me;
  const label = participant === 'gf' ? 'GF' : 'Me';
  return <Text style={style}>{` · ${label}`}</Text>;
}

const styles = StyleSheet.create({
  me: { color: '#60A5FA', fontWeight: '600' },
  gf: { color: '#F472B6', fontWeight: '600' },
});
