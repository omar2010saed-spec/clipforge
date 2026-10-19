import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { BottomSheet } from './BottomSheet';
import { colors, radius, spacing } from '@/theme/colors';
import { MAX_NAME_LENGTH, type AspectKey } from '@/models/project';
import { isRTL, t } from '@/i18n';

interface Props {
  visible: boolean;
  mode: 'create' | 'rename';
  initialName: string;
  onClose: () => void;
  onSubmit: (name: string, aspect: AspectKey) => void;
}

const ASPECT_OPTIONS: { key: AspectKey; label: () => string }[] = [
  { key: '9:16', label: () => t('ratioPortrait') },
  { key: '16:9', label: () => t('ratioLandscape') },
  { key: '1:1', label: () => t('ratioSquare') },
];

export function ProjectFormModal({ visible, mode, initialName, onClose, onSubmit }: Props) {
  const [name, setName] = useState(initialName);
  const [aspect, setAspect] = useState<AspectKey>('9:16');

  useEffect(() => {
    if (visible) {
      setName(initialName);
      setAspect('9:16');
    }
  }, [visible, initialName]);

  const trimmed = name.trim();
  const tooLong = trimmed.length > MAX_NAME_LENGTH;
  const canSubmit = trimmed.length > 0 && !tooLong;

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text style={styles.title}>{mode === 'create' ? t('newProject') : t('rename')}</Text>

      <TextInput
        testID="project-name-input"
        value={name}
        onChangeText={setName}
        placeholder={t('projectName')}
        placeholderTextColor={colors.textMuted}
        style={[styles.input, { textAlign: isRTL() ? 'right' : 'left' }]}
        autoFocus
        selectTextOnFocus
        returnKeyType="done"
        onSubmitEditing={() => canSubmit && onSubmit(trimmed, aspect)}
      />
      {tooLong ? <Text style={styles.error}>{t('nameTooLong', { max: MAX_NAME_LENGTH })}</Text> : null}

      {mode === 'create' ? (
        <View style={styles.group}>
          <Text style={styles.label}>{t('ratio')}</Text>
          <View style={styles.chips}>
            {ASPECT_OPTIONS.map((o) => {
              const active = o.key === aspect;
              return (
                <Pressable
                  key={o.key}
                  onPress={() => setAspect(o.key)}
                  style={[styles.chip, active && styles.chipActive]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{o.label()}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      <View style={styles.actions}>
        <Pressable style={[styles.btn, styles.btnGhost]} onPress={onClose} accessibilityRole="button">
          <Text style={styles.btnGhostText}>{t('cancel')}</Text>
        </Pressable>
        <Pressable
          testID="project-form-submit"
          style={[styles.btn, styles.btnPrimary, !canSubmit && styles.btnDisabled]}
          disabled={!canSubmit}
          onPress={() => onSubmit(trimmed, aspect)}
          accessibilityRole="button"
        >
          <Text style={styles.btnPrimaryText}>{mode === 'create' ? t('create') : t('save')}</Text>
        </Pressable>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.text, fontSize: 18, fontWeight: '700' },
  input: {
    backgroundColor: colors.surfaceAlt,
    color: colors.text,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 16,
  },
  error: { color: colors.danger, fontSize: 12 },
  group: { gap: spacing.sm },
  label: { color: colors.textMuted, fontSize: 13 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textMuted, fontSize: 13 },
  chipTextActive: { color: colors.primaryText, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  btn: { flex: 1, paddingVertical: spacing.md, borderRadius: radius.md, alignItems: 'center' },
  btnGhost: { backgroundColor: colors.surfaceAlt },
  btnGhostText: { color: colors.text, fontWeight: '600' },
  btnPrimary: { backgroundColor: colors.primary },
  btnPrimaryText: { color: colors.primaryText, fontWeight: '700' },
  btnDisabled: { opacity: 0.4 },
});
