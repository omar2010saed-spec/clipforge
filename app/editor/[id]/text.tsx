import React from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TextOverlayBody } from '@/components/TextOverlayView';
import { BG_COLORS, Chip, ColorSwatches, IconButton, SectionLabel, Stepper, TEXT_COLORS } from '@/components/ui';
import { EmptyState } from '@/components/EmptyState';
import { useEditorStore } from '@/store/editorStore';
import { deleteText, findText, updateText } from '@/editor/timeline';
import { FONTS } from '@/fonts/fonts';
import type { TextAlign, TextAnimation, TextOverlay } from '@/types';
import { colors, radius, spacing } from '@/theme/colors';
import { formatDuration } from '@/utils/format';
import { isRTL, t } from '@/i18n';

const ALIGNS: { key: TextAlign; label: () => string }[] = [
  { key: 'left', label: () => t('alignLeft') },
  { key: 'center', label: () => t('alignCenter') },
  { key: 'right', label: () => t('alignRight') },
];
const ANIMS: { key: TextAnimation; label: () => string }[] = [
  { key: 'none', label: () => t('animNone') },
  { key: 'fade', label: () => t('animFade') },
  { key: 'slideUp', label: () => t('animSlide') },
];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export default function TextEditorScreen() {
  const { textId } = useLocalSearchParams<{ id: string; textId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const overlay = useEditorStore((s) => (s.project ? findText(s.project, String(textId)) : undefined));
  const commit = useEditorStore((s) => s.commit);

  const header = (
    <View style={styles.header}>
      <IconButton icon={isRTL() ? 'arrow-forward' : 'arrow-back'} onPress={() => router.back()} label={t('back')} testID="text-back" />
      <Text style={styles.title}>{t('textTitle')}</Text>
      <View style={{ flex: 1 }} />
      {overlay ? (
        <IconButton
          icon="trash-outline"
          label={t('delete')}
          onPress={() => {
            commit((p) => deleteText(p, overlay.id));
            router.back();
          }}
        />
      ) : null}
    </View>
  );

  if (!overlay) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        {header}
        <EmptyState icon="alert-circle-outline" title={t('textNotFound')} actionLabel={t('back')} onAction={() => router.back()} />
      </View>
    );
  }

  const upd = (patch: Partial<TextOverlay>) =>
    commit((p) => updateText(p, overlay.id, patch), { coalesce: `text-${overlay.id}` });
  const sec = (ms: number) => `${formatDuration(ms)}`;

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {header}
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.previewBox} testID="text-preview">
          <TextOverlayBody overlay={{ ...overlay, rotation: 0 }} scale={0.4} maxWidth={width - spacing.lg * 4} />
        </View>

        <TextInput
          testID="text-input"
          value={overlay.text}
          onChangeText={(text) => upd({ text })}
          placeholder={t('textPlaceholder')}
          placeholderTextColor={colors.textMuted}
          multiline
          style={[styles.input, { textAlign: isRTL() ? 'right' : 'left' }]}
        />

        <SectionLabel>{t('font')}</SectionLabel>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
          {FONTS.map((f) => (
            <Chip key={f.id} label={f.label} active={overlay.fontFamily === f.id} onPress={() => upd({ fontFamily: f.id })} />
          ))}
        </ScrollView>

        <View style={styles.rowBetween}>
          <Text style={styles.label}>{t('fontSize')}</Text>
          <Stepper value={String(overlay.fontSize)} onDec={() => upd({ fontSize: clamp(overlay.fontSize - 8, 24, 400) })} onInc={() => upd({ fontSize: clamp(overlay.fontSize + 8, 24, 400) })} />
        </View>
        <View style={styles.rowBetween}>
          <Text style={styles.label}>{t('bold')}</Text>
          <Chip label={overlay.bold ? 'ON' : 'OFF'} active={overlay.bold} onPress={() => upd({ bold: !overlay.bold })} />
        </View>
        <View style={styles.rowBetween}>
          <Text style={styles.label}>{t('shadow')}</Text>
          <Chip label={overlay.shadow ? 'ON' : 'OFF'} active={overlay.shadow} onPress={() => upd({ shadow: !overlay.shadow })} />
        </View>

        <SectionLabel>{t('color')}</SectionLabel>
        <ColorSwatches value={overlay.color} options={TEXT_COLORS} onChange={(c) => upd({ color: c })} />

        <SectionLabel>{t('strokeColor')}</SectionLabel>
        <ColorSwatches value={overlay.strokeColor} options={TEXT_COLORS} onChange={(c) => upd({ strokeColor: c })} />
        <View style={styles.rowBetween}>
          <Text style={styles.label}>{t('strokeWidth')}</Text>
          <Stepper value={String(overlay.strokeWidth)} onDec={() => upd({ strokeWidth: clamp(overlay.strokeWidth - 2, 0, 24) })} onInc={() => upd({ strokeWidth: clamp(overlay.strokeWidth + 2, 0, 24) })} />
        </View>

        <SectionLabel>{t('background')}</SectionLabel>
        <ColorSwatches value={overlay.backgroundColor} options={BG_COLORS} onChange={(c) => upd({ backgroundColor: c })} allowNone />

        <SectionLabel>{t('align')}</SectionLabel>
        <View style={styles.chips}>
          {ALIGNS.map((a) => (
            <Chip key={a.key} label={a.label()} active={overlay.align === a.key} onPress={() => upd({ align: a.key })} />
          ))}
        </View>

        <View style={styles.rowBetween}>
          <Text style={styles.label}>{t('rotation')}</Text>
          <Stepper value={`${overlay.rotation}°`} onDec={() => upd({ rotation: clamp(overlay.rotation - 5, -180, 180) })} onInc={() => upd({ rotation: clamp(overlay.rotation + 5, -180, 180) })} />
        </View>

        <SectionLabel>{t('animation')}</SectionLabel>
        <View style={styles.chips}>
          {ANIMS.map((a) => (
            <Chip key={a.key} label={a.label()} active={overlay.animation === a.key} onPress={() => upd({ animation: a.key })} />
          ))}
        </View>

        <View style={styles.rowBetween}>
          <Text style={styles.label}>{t('startsAt')}</Text>
          <Stepper value={sec(overlay.startMs)} onDec={() => upd({ startMs: Math.max(0, overlay.startMs - 500) })} onInc={() => upd({ startMs: overlay.startMs + 500 })} />
        </View>
        <View style={styles.rowBetween}>
          <Text style={styles.label}>{t('endsAt')}</Text>
          <Stepper value={sec(overlay.endMs)} onDec={() => upd({ endMs: Math.max(overlay.startMs + 100, overlay.endMs - 500) })} onInc={() => upd({ endMs: overlay.endMs + 500 })} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg },
  title: { color: colors.text, fontSize: 20, fontWeight: '800' },
  body: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl * 2 },
  previewBox: { minHeight: 120, borderRadius: radius.lg, backgroundColor: '#2B2B36', alignItems: 'center', justifyContent: 'center', padding: spacing.md, marginBottom: spacing.md },
  input: { backgroundColor: colors.surface, color: colors.text, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, fontSize: 16, minHeight: 56 },
  label: { color: colors.text, fontSize: 14 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
