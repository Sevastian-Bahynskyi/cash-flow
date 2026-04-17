import { useCallback, useState, type ReactElement } from 'react';
import { View, TextInput, StyleSheet, Pressable, Text } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors, radius, spacing, typography } from '@/ui/tokens';
import { runDetached as runDetachedAsync } from '@/lib/async';

export type FormattedText = {
  raw: string;
};

type ParsedSegment = {
  type: 'bold' | 'normal';
  text: string;
};

const parseFormattedText = (raw: string): ParsedSegment[] => {
  const segments: ParsedSegment[] = [];
  let current = '';
  let isBold = false;

  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === '*' && raw[i + 1] === '*') {
      if (current) {
        segments.push({ type: isBold ? 'bold' : 'normal', text: current });
        current = '';
      }
      isBold = !isBold;
      i++; // Skip next *
    } else {
      current += raw[i];
    }
  }

  if (current) {
    segments.push({ type: isBold ? 'bold' : 'normal', text: current });
  }

  return segments;
};

export function RichTextDisplay({ text }: { text: string | null }): ReactElement {
  if (!text) return <Text style={styles.empty}>No notes</Text>;

  const segments = parseFormattedText(text);

  return (
    <Text>
      {segments.map((segment, idx) => (
        <Text
          key={idx}
          style={
            segment.type === 'bold'
              ? [typography.body, { fontWeight: '700', color: colors.text }]
              : [typography.body, { color: colors.text }]
          }
        >
          {segment.text}
        </Text>
      ))}
    </Text>
  );
}

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

export default function RichTextEditor({ value, onChange, placeholder = 'Add notes...' }: Props): ReactElement {
  const [selectionStart, setSelectionStart] = useState(0);
  const [selectionEnd, setSelectionEnd] = useState(0);

  const toggleBold = useCallback(() => {
      runDetachedAsync(Haptics.selectionAsync(), 'rich-text.toggle-bold.haptics');

    if (selectionStart === selectionEnd) {
      // No selection - add template
      const before = value.slice(0, selectionStart);
      const after = value.slice(selectionStart);
      onChange(`${before}****${after}`);
      return;
    }

    const before = value.slice(0, selectionStart);
    const selected = value.slice(selectionStart, selectionEnd);
    const after = value.slice(selectionEnd);

    // Check if selection already has ** markers
    if (selected.startsWith('**') && selected.endsWith('**')) {
      // Remove bold
      onChange(before + selected.slice(2, -2) + after);
    } else {
      // Add bold
      onChange(before + '**' + selected + '**' + after);
    }
  }, [selectionStart, selectionEnd, value, onChange]);

  const isBoldSelected =
    selectionStart !== selectionEnd &&
    value.slice(selectionStart, selectionEnd).startsWith('**') &&
    value.slice(selectionStart, selectionEnd).endsWith('**');

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <Pressable
          onPress={toggleBold}
          style={({ pressed }) => [styles.toolButton, isBoldSelected && styles.toolButtonActive, pressed && styles.pressed]}
        >
          <MaterialCommunityIcons name="format-bold" size={18} color={isBoldSelected ? colors.accent : colors.textMuted} />
        </Pressable>
      </View>

      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        multiline
        selection={{ start: selectionStart, end: selectionEnd }}
        onSelectionChange={(e) => {
          setSelectionStart(e.nativeEvent.selection.start);
          setSelectionEnd(e.nativeEvent.selection.end);
        }}
      />

      {value ? (
        <View style={styles.preview}>
          <Text style={styles.previewLabel}>Preview</Text>
          <View style={styles.previewContent}>
            <RichTextDisplay text={value} />
          </View>
        </View>
      ) : null}
    </View>
  );
}


const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  toolbar: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  toolButton: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  toolButtonActive: {
    backgroundColor: 'rgba(124,92,255,0.2)',
  },
  pressed: {
    opacity: 0.8,
  },
  input: {
    minHeight: 100,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    color: colors.text,
    ...typography.body,
    textAlignVertical: 'top',
  },
  preview: {
    gap: spacing.sm,
  },
  previewLabel: {
    ...typography.label,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontSize: 11,
  },
  previewContent: {
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    minHeight: 60,
    justifyContent: 'center',
  },
  empty: {
    ...typography.body,
    color: colors.textMuted,
  },
});
