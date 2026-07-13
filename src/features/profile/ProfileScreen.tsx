import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { FontAwesome6 } from '@expo/vector-icons';
import { ScreenHeader } from '@/ui/ScreenHeader';
import { colors, radius, spacing, typography } from '@/ui/tokens';
import { runDetached } from '@/lib/async';
import { getErrorMessage } from '@/lib/errors';
import { formatDateLabel } from '@/lib/format';
import { toLocalIsoDay } from '@/lib/cycles';
import { useAuth } from '@/features/auth/AuthProvider';
import { useProfile } from './ProfileProvider';
import { exportTransactions, type ExportFormat } from './export';

const parseIsoDate = (iso: string): Date => {
  const [year = 1970, month = 1, day = 1] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const daysAgoIso = (days: number): string => {
  const now = new Date();
  return toLocalIsoDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - days));
};

type DateTarget = 'start' | 'end';

const formatOptions: readonly { value: ExportFormat; label: string }[] = [
  { value: 'pdf', label: 'PDF document' },
  { value: 'csv', label: 'CSV spreadsheet' },
];

export default function ProfileScreen() {
  const { signOut } = useAuth();
  const { displayName, avatarUrl, uploadPicture, saveName } = useProfile();

  const [name, setName] = useState(displayName);
  const [savingName, setSavingName] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [startOn, setStartOn] = useState(daysAgoIso(30));
  const [endOn, setEndOn] = useState(daysAgoIso(0));
  const [format, setFormat] = useState<ExportFormat>('pdf');
  const [formatMenuOpen, setFormatMenuOpen] = useState(false);
  const [datePicker, setDatePicker] = useState<DateTarget | null>(null);
  const [exporting, setExporting] = useState(false);

  const formatLabel = useMemo(
    () => formatOptions.find((option) => option.value === format)?.label ?? 'PDF document',
    [format],
  );

  const nameDirty = name.trim() !== displayName.trim();

  const pickAvatar = async (): Promise<void> => {
    if (uploading) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6,
      base64: true,
    });
    if (result.canceled || !result.assets[0]?.base64) return;

    const asset = result.assets[0];
    setUploading(true);
    setMessage(null);
    try {
      await uploadPicture({ base64: asset.base64 ?? '', mimeType: asset.mimeType ?? 'image/jpeg' });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      setMessage(getErrorMessage(error, 'Could not upload picture right now.'));
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setUploading(false);
    }
  };

  const handleSaveName = async (): Promise<void> => {
    if (savingName || !nameDirty) return;
    setSavingName(true);
    setMessage(null);
    try {
      await saveName(name);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      setMessage(getErrorMessage(error, 'Could not save name right now.'));
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSavingName(false);
    }
  };

  const onDateChange = (target: DateTarget, event: DateTimePickerEvent, selected?: Date): void => {
    if (Platform.OS !== 'ios') setDatePicker(null);
    if (event.type === 'dismissed' || !selected) return;
    const iso = toLocalIsoDay(selected);
    if (target === 'start') setStartOn(iso);
    else setEndOn(iso);
  };

  const handleExport = async (): Promise<void> => {
    if (exporting) return;
    if (startOn > endOn) {
      setMessage('Start date must be before the end date.');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    setExporting(true);
    setMessage(null);
    try {
      const result = await exportTransactions({ format, startOn, endOn });
      if (result.status === 'empty') {
        setMessage('No transactions in this date range.');
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      } else if (result.status === 'unavailable') {
        setMessage('Sharing is not available on this device.');
      }
    } catch (error) {
      setMessage(getErrorMessage(error, 'Could not export data right now.'));
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setExporting(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title="Profile" back />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.avatarRow}>
          <Pressable onPress={() => void pickAvatar()} style={styles.avatarPress} accessibilityLabel="Change profile picture">
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <FontAwesome6 name="user" size={32} color={colors.textMuted} />
              </View>
            )}
            <View style={styles.avatarBadge}>
              {uploading ? (
                <ActivityIndicator size="small" color={colors.text} />
              ) : (
                <FontAwesome6 name="camera" size={13} color={colors.text} />
              )}
            </View>
          </Pressable>
          <Text style={styles.avatarHint}>Tap to change picture</Text>
        </View>

        <Text style={styles.label}>Name</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Your name"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          returnKeyType="done"
          onSubmitEditing={() => void handleSaveName()}
        />
        <Pressable
          style={({ pressed }) => [styles.primaryButton, (!nameDirty || savingName) && styles.buttonDisabled, pressed && styles.pressed]}
          onPress={() => void handleSaveName()}
          disabled={!nameDirty || savingName}
        >
          <Text style={styles.primaryButtonText}>{savingName ? 'Saving…' : 'Save name'}</Text>
        </Pressable>

        <View style={styles.divider} />

        <Text style={styles.sectionTitle}>Export data</Text>
        <Text style={styles.sectionHint}>Pick a date range and a format. Everything in range is included.</Text>

        <Text style={styles.label}>From</Text>
        <Pressable style={styles.fieldRow} onPress={() => setDatePicker('start')}>
          <FontAwesome6 name="calendar" size={16} color={colors.textMuted} />
          <Text style={styles.fieldText}>{formatDateLabel(startOn)}</Text>
          <FontAwesome6 name="chevron-down" size={14} color={colors.textMuted} />
        </Pressable>

        <Text style={styles.label}>To</Text>
        <Pressable style={styles.fieldRow} onPress={() => setDatePicker('end')}>
          <FontAwesome6 name="calendar" size={16} color={colors.textMuted} />
          <Text style={styles.fieldText}>{formatDateLabel(endOn)}</Text>
          <FontAwesome6 name="chevron-down" size={14} color={colors.textMuted} />
        </Pressable>

        <Text style={styles.label}>Format</Text>
        <Pressable style={styles.fieldRow} onPress={() => setFormatMenuOpen(true)}>
          <FontAwesome6 name={format === 'pdf' ? 'file-pdf' : 'file-csv'} size={16} color={colors.textMuted} />
          <Text style={styles.fieldText}>{formatLabel}</Text>
          <FontAwesome6 name="chevron-down" size={14} color={colors.textMuted} />
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.primaryButton, styles.exportButton, exporting && styles.buttonDisabled, pressed && styles.pressed]}
          onPress={() => void handleExport()}
          disabled={exporting}
        >
          {exporting ? (
            <ActivityIndicator size="small" color={colors.text} />
          ) : (
            <FontAwesome6 name="arrow-up-from-bracket" size={16} color={colors.text} />
          )}
          <Text style={styles.primaryButtonText}>{exporting ? 'Preparing…' : 'Export'}</Text>
        </Pressable>

        {message ? <Text style={styles.message}>{message}</Text> : null}

        <View style={styles.divider} />

        <Pressable
          style={({ pressed }) => [styles.signOut, pressed && styles.pressed]}
          onPress={() => runDetached(signOut(), 'profile.signOut')}
        >
          <FontAwesome6 name="arrow-right-from-bracket" size={16} color={colors.danger} />
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </ScrollView>

      <Modal transparent visible={formatMenuOpen} animationType="fade" onRequestClose={() => setFormatMenuOpen(false)}>
        <Pressable style={styles.menuBackdrop} onPress={() => setFormatMenuOpen(false)}>
          <View style={styles.menuCard}>
            {formatOptions.map((option) => (
              <Pressable
                key={option.value}
                style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]}
                onPress={() => {
                  setFormat(option.value);
                  setFormatMenuOpen(false);
                }}
              >
                <FontAwesome6
                  name={option.value === 'pdf' ? 'file-pdf' : 'file-csv'}
                  size={16}
                  color={format === option.value ? colors.accent : colors.textMuted}
                />
                <Text style={[styles.menuItemText, format === option.value && styles.menuItemTextActive]}>
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      {datePicker && Platform.OS === 'ios' ? (
        <View style={styles.datePickerOverlay}>
          <Pressable style={styles.datePickerBackdrop} onPress={() => setDatePicker(null)} />
          <View style={styles.datePickerCard}>
            <View style={styles.datePickerHeader}>
              <Text style={styles.datePickerTitle}>{datePicker === 'start' ? 'Start date' : 'End date'}</Text>
              <Pressable onPress={() => setDatePicker(null)}>
                <Text style={styles.datePickerDone}>Done</Text>
              </Pressable>
            </View>
            <DateTimePicker
              value={parseIsoDate(datePicker === 'start' ? startOn : endOn)}
              mode="date"
              display="spinner"
              themeVariant="dark"
              textColor={colors.text}
              accentColor={colors.accentAlt}
              onChange={(event, selected) => onDateChange(datePicker, event, selected)}
            />
          </View>
        </View>
      ) : null}

      {datePicker && Platform.OS === 'android' ? (
        <DateTimePicker
          value={parseIsoDate(datePicker === 'start' ? startOn : endOn)}
          mode="date"
          onChange={(event, selected) => onDateChange(datePicker, event, selected)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl * 3, gap: spacing.sm },
  avatarRow: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg },
  avatarPress: { position: 'relative' },
  avatar: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.surfaceAlt },
  avatarFallback: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  avatarBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.bg,
  },
  avatarHint: { ...typography.label, color: colors.textMuted },
  label: {
    ...typography.label,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.sm,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.text,
    ...typography.body,
  },
  fieldRow: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  fieldText: { ...typography.body, color: colors.text, flex: 1 },
  primaryButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  exportButton: { marginTop: spacing.md },
  primaryButtonText: { ...typography.body, color: colors.text, fontWeight: '600' },
  buttonDisabled: { opacity: 0.4 },
  pressed: { opacity: 0.85 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.lg },
  sectionTitle: { ...typography.h2, color: colors.text },
  sectionHint: { ...typography.label, color: colors.textMuted, marginBottom: spacing.xs },
  message: { ...typography.label, color: colors.accentAlt, marginTop: spacing.sm },
  signOut: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  signOutText: { ...typography.body, color: colors.danger, fontWeight: '600' },
  menuBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  menuCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.md },
  menuItemText: { ...typography.body, color: colors.textMuted },
  menuItemTextActive: { color: colors.text, fontWeight: '600' },
  datePickerOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end' },
  datePickerBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  datePickerCard: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingBottom: spacing.xl },
  datePickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  datePickerTitle: { ...typography.body, color: colors.text, fontWeight: '600' },
  datePickerDone: { ...typography.body, color: colors.accent, fontWeight: '600' },
});
