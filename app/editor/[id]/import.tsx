import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Chip, IconButton, SectionLabel } from '@/components/ui';
import { useEditorStore } from '@/store/editorStore';
import { addMedia, DEFAULT_IMAGE_MS, type AddTarget, type NewMedia } from '@/editor/timeline';
import {
  PermissionDeniedError,
  persistAndProbe,
  pickFiles,
  pickFromCamera,
  pickFromGallery,
  type PickedItem,
} from '@/media/importMedia';
import { colors, radius, spacing } from '@/theme/colors';
import { isRTL, t } from '@/i18n';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

function SourceButton({ icon, label, onPress, disabled, testID }: { icon: IconName; label: string; onPress: () => void; disabled: boolean; testID?: string }) {
  return (
    <Pressable testID={testID} onPress={onPress} disabled={disabled} style={[styles.source, disabled && { opacity: 0.5 }]} accessibilityRole="button">
      <Ionicons name={icon} size={34} color={colors.primary} />
      <Text style={styles.sourceLabel}>{label}</Text>
    </Pressable>
  );
}

export default function ImportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const projectId = String(id ?? '');
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [target, setTarget] = useState<'main' | 'overlay'>('main');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  const importFrom = async (picker: () => Promise<PickedItem[]>) => {
    setBusy(true);
    setMessage(null);
    setIsError(false);
    try {
      const picked = await picker();
      if (picked.length === 0) return;

      const media: NewMedia[] = [];
      let failed = 0;
      for (const item of picked) {
        try {
          media.push(await persistAndProbe(projectId, item));
        } catch (e) {
          failed++;
          console.warn('[import] failed for', item.name, e);
        }
      }

      if (media.length > 0) {
        const { run, timeMs } = useEditorStore.getState();
        run((p) => {
          let q = p;
          let at = timeMs;
          for (const m of media) {
            const where: AddTarget = m.kind === 'audio' ? 'audio' : target;
            q = addMedia(q, m, where, at).project;
            if (where !== 'main') {
              const still = m.kind === 'image' || m.kind === 'gif';
              at += still ? DEFAULT_IMAGE_MS : m.durationMs;
            }
          }
          return { project: q };
        });
      }
      if (failed > 0) {
        setIsError(true);
        setMessage(`${t('importFailed')} (${failed})`);
      } else {
        setMessage(t('importedCount', { count: media.length }));
      }
    } catch (e) {
      setIsError(true);
      setMessage(e instanceof PermissionDeniedError ? t('cameraDenied') : t('importFailed'));
      console.warn('[import] failed', e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.header}>
        <IconButton icon={isRTL() ? 'arrow-forward' : 'arrow-back'} onPress={() => router.back()} label={t('back')} testID="import-back" />
        <Text style={styles.title}>{t('importTitle')}</Text>
      </View>

      <View style={styles.body}>
        <Text style={styles.hint}>{t('importHint')}</Text>

        <SectionLabel>{t('addTo')}</SectionLabel>
        <View style={styles.row}>
          <Chip label={t('addAsMain')} active={target === 'main'} onPress={() => setTarget('main')} />
          <Chip label={t('addAsOverlay')} active={target === 'overlay'} onPress={() => setTarget('overlay')} />
        </View>

        <View style={styles.grid}>
          <SourceButton testID="import-gallery" icon="images-outline" label={t('fromGallery')} disabled={busy} onPress={() => void importFrom(pickFromGallery)} />
          <SourceButton testID="import-camera" icon="camera-outline" label={t('fromCamera')} disabled={busy} onPress={() => void importFrom(pickFromCamera)} />
          <SourceButton testID="import-files" icon="folder-open-outline" label={t('fromFiles')} disabled={busy} onPress={() => void importFrom(() => pickFiles('media'))} />
          <SourceButton testID="import-audio" icon="musical-notes-outline" label={t('fromAudio')} disabled={busy} onPress={() => void importFrom(() => pickFiles('audio'))} />
        </View>

        {busy ? (
          <View style={styles.status}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.statusText}>{t('importing')}</Text>
          </View>
        ) : message ? (
          <Text style={[styles.statusText, isError && { color: colors.danger }]}>{message}</Text>
        ) : null}
      </View>

      <Pressable onPress={() => router.back()} style={styles.done} accessibilityRole="button" testID="import-done">
        <Text style={styles.doneText}>{t('done')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg },
  title: { color: colors.text, fontSize: 20, fontWeight: '800' },
  body: { flex: 1, paddingHorizontal: spacing.lg },
  hint: { color: colors.textMuted, fontSize: 14 },
  row: { flexDirection: 'row', gap: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.xl },
  source: { width: '47%', aspectRatio: 1.3, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  sourceLabel: { color: colors.text, fontWeight: '600' },
  status: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.xl },
  statusText: { color: colors.text, marginTop: spacing.xl },
  done: { margin: spacing.lg, backgroundColor: colors.primary, borderRadius: radius.pill, paddingVertical: spacing.md, alignItems: 'center' },
  doneText: { color: colors.primaryText, fontWeight: '700', fontSize: 16 },
});
