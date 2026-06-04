import React, { useState } from 'react';
import {
  Modal,
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
} from 'react-native';
import { theme } from '../shared/lib/theme';
import type { LocationRange, LocationDuration } from '../features/location/location.types';

interface ConnectModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (range: LocationRange, durationMinutes: LocationDuration) => void;
}

const RANGE_OPTIONS: { label: string; value: LocationRange }[] = [
  { label: '500 m', value: 500 },
  { label: '1 km', value: 1000 },
  { label: '2 km', value: 2000 },
];

const DURATION_OPTIONS: { label: string; value: LocationDuration }[] = [
  { label: '30 min', value: 30 },
  { label: '1 h', value: 60 },
  { label: '2 h', value: 120 },
];

export default function ConnectModal({ visible, onClose, onConfirm }: ConnectModalProps) {
  const [selectedRange, setSelectedRange] = useState<LocationRange | null>(null);
  const [selectedDuration, setSelectedDuration] = useState<LocationDuration | null>(null);

  const handleConfirm = () => {
    if (selectedRange !== null && selectedDuration !== null) {
      onConfirm(selectedRange, selectedDuration);
      setSelectedRange(null);
      setSelectedDuration(null);
    }
  };

  const handleClose = () => {
    setSelectedRange(null);
    setSelectedDuration(null);
    onClose();
  };

  const canConfirm = selectedRange !== null && selectedDuration !== null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <TouchableWithoutFeedback onPress={handleClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.card}>
              <Text style={styles.title}>Connect to Map</Text>
              <Text style={styles.subtitle}>
                Choose your visibility range and session duration
              </Text>

              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Range</Text>
                <View style={styles.optionsRow}>
                  {RANGE_OPTIONS.map((opt) => (
                    <TouchableOpacity
                      key={opt.value}
                      style={[
                        styles.optionPill,
                        selectedRange === opt.value && styles.optionPillActive,
                      ]}
                      onPress={() => setSelectedRange(opt.value)}
                      activeOpacity={0.75}
                    >
                      <Text
                        style={[
                          styles.optionText,
                          selectedRange === opt.value && styles.optionTextActive,
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Duration</Text>
                <View style={styles.optionsRow}>
                  {DURATION_OPTIONS.map((opt) => (
                    <TouchableOpacity
                      key={opt.value}
                      style={[
                        styles.optionPill,
                        selectedDuration === opt.value && styles.optionPillActive,
                      ]}
                      onPress={() => setSelectedDuration(opt.value)}
                      activeOpacity={0.75}
                    >
                      <Text
                        style={[
                          styles.optionText,
                          selectedDuration === opt.value && styles.optionTextActive,
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <TouchableOpacity
                style={[styles.confirmButton, !canConfirm && styles.confirmButtonDisabled]}
                onPress={handleConfirm}
                activeOpacity={0.75}
                disabled={!canConfirm}
              >
                <Text style={styles.confirmButtonText}>Connect</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: 24,
    gap: 20,
  },
  title: {
    color: theme.colors.text,
    fontSize: theme.typography.fontSize.xl,
    fontWeight: theme.typography.fontWeight.bold,
    textAlign: 'center',
  },
  subtitle: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.fontSize.sm,
    textAlign: 'center',
    marginTop: -8,
  },
  section: {
    gap: 10,
  },
  sectionLabel: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.medium,
  },
  optionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  optionPill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  optionPillActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  optionText: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.medium,
  },
  optionTextActive: {
    color: '#000000',
  },
  confirmButton: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 14,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    marginTop: 8,
  },
  confirmButtonDisabled: {
    backgroundColor: theme.colors.surfaceAlt,
  },
  confirmButtonText: {
    color: '#000000',
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.bold,
  },
});
