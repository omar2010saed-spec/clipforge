import React, { useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { Chip, IconButton, SectionLabel } from '@/components/ui';
import { EmptyState } from '@/components/EmptyState';
import { useEditorStore } from '@/store/editorStore';
import { projectDurationMs } from '@/models/project';
import { bitrateKbps, effectiveFps, effectivePreset, exportSize } from '@/export/plan';
import { runExport, type ExportPhase } from '@/export/runExport';
import { TextRasterizer, type TextRasterizerHandle } from '@/export/TextRasterizer';
import { getEngine } from '@/engine/ffmpeg';
import type { ExportPresetKey, ExportSettings } from '@/types';
import { colors, radius, spacing } from '@/theme/colors';
import { formatDuration } from '@/utils/format';
import { isRTL, t } from '@/i18n';

const PRESETS: { key: ExportPresetKey; label: string }[] = [
  { key: '720p', label: '720p' },
  { key: '1080p', label: '1080p' },
  { key: '2k', label: '2K' },
  { key: '4k', label: '4K' },
];

type State =
  | { kind: 'idle' }
  | { kind: 'running'; phase: ExportPhase; progress: number }
  | { kind: 'done'; uri: string; mime: string }
  | { kind: 'error'; message: string };

export default function ExportScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const project = useEditorStore((s) => s.project);

  const [settings, setSettings] = useState<ExportSettings>({ format: 'mp4', codec: 'h264', preset: '1080p', fps: 30 });
  const [state, setState] = useState<State>({ kind: 'idle' });
  const cancelled = useRef(false);
  const raster = useRef<TextRasterizerHandle>(null);

  const duration = project ? projectDurationMs(project) : 0;
  const size = useMemo(() => (project ? exportSize(project, settings) : { width: 0, height: 0 }), [project, settings]);
  const estimateMb = useMemo(() => {
    if (settings.format === 'gif') return null;
    const kbps = bitrateKbps(effectivePreset(settings), effectiveFps(settings)) + 192;
    return Math.max(1, Math.round((kbps * duration) / 1000 / 8 / 1024));
  }, [settings, duration]);

  if (!project) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <EmptyState icon="alert-circle-outline" title={t('projectNotFound')} actionLabel={t('back')} onAction={() => router.back()} />
      </View>
    );
  }

  const running = state.kind === 'running';
  const set = (patch: Partial<ExportSettings>) => setSettings((s) => ({ ...s, ...patch }));

  const start = async () => {
    if (!getEngine()) {
      Alert.alert(t('engineMissingTitle'), t('engineMissingBody'));
      return;
    }
    if (duration <= 0) {
      setState({ kind: 'error', message: t('emptyProject') });
      return;
    }
    cancelled.current = false;
    setState({ kind: 'running', phase: 'prepare', progress: 0 });
    await activateKeepAwakeAsync('export').catch(() => undefined);
    try {
      const outcome = await runExport(project, settings, {
        renderTexts: () => raster.current?.render() ?? Promise.resolve({}),
        onProgress: (progress, phase) => setState({ kind: 'running', phase, progress }),
        isCancelled: () => cancelled.current,
      });
      if (outcome.ok) {
        setState({ kind: 'done', uri: outcome.uri, mime: settings.format === 'gif' ? 'image/gif' : 'video/mp4' });
      } else if (outcome.reason === 'cancelled') {
        setState({ kind: 'error', message: t('exportCancelled') });
      } else if (outcome.reason === 'engine-missing') {
        setState({ kind: 'idle' });
        Alert.alert(t('engineMissingTitle'), t('engineMissingBody'));
      } else {
        console.warn('[export] failed', outcome.log);
        setState({ kind: 'error', message: outcome.reason === 'empty' ? t('emptyProject') : t('exportFailed') });
      }
    } catch (e) {
      console.warn('[export] crashed', e);
      setState({ kind: 'error', message: t('exportFailed') });
    } finally {
      deactivateKeepAwake('export');
    }
  };

  const cancel = async () => {
    cancelled.current = true;
    await getEngine()?.cancel().catch(() => undefined);
  };

  const saveToGallery = async (uri: string) => {
    try {
      const perm = await MediaLibrary.requestPermissionsAsync(true);
      if (!perm.granted) {
        Alert.alert(t('galleryDenied'));
        return;
      }
      await MediaLibrary.saveToLibraryAsync(uri);
      Alert.alert(t('savedToGallery'));
    } catch (e) {
      console.warn('[export] save failed', e);
      Alert.alert(t('exportFailed'));
    }
  };

  const share = async (uri: string, mime: string) => {
    try {
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: mime });
    } catch (e) {
      console.warn('[export] share failed', e);
    }
  };

  const phaseLabel =
    state.kind === 'running'
      ? state.phase === 'prepare'
        ? t('preparingText')
        : state.phase === 'retry'
          ? t('retryingSoftware')
          : t('exporting')
      : '';

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.header}>
        <IconButton icon={isRTL() ? 'arrow-forward' : 'arrow-back'} onPress={() => router.back()} disabled={running} label={t('back')} testID="export-back" />
        <Text style={styles.title}>{t('exportTitle')}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <SectionLabel>{t('format')}</SectionLabel>
        <View style={styles.chips}>
          <Chip label="MP4" active={settings.format === 'mp4'} onPress={() => set({ format: 'mp4' })} />
          <Chip label="GIF" active={settings.format === 'gif'} onPress={() => set({ format: 'gif' })} />
        </View>

        {settings.format === 'mp4' ? (
          <>
            <SectionLabel>{t('codec')}</SectionLabel>
            <View style={styles.chips}>
              <Chip label="H.264" active={settings.codec === 'h264'} onPress={() => set({ codec: 'h264' })} />
              <Chip label="H.265 (HEVC)" active={settings.codec === 'h265'} onPress={() => set({ codec: 'h265' })} />
            </View>

            <SectionLabel>{t('resolution')}</SectionLabel>
            <View style={styles.chips}>
              {PRESETS.map((p) => (
                <Chip key={p.key} label={p.label} active={settings.preset === p.key} onPress={() => set({ preset: p.key })} />
              ))}
            </View>

            <SectionLabel>{t('fps')}</SectionLabel>
            <View style={styles.chips}>
              {([24, 30, 60] as const).map((f) => (
                <Chip key={f} label={`${f} fps`} active={settings.fps === f} onPress={() => set({ fps: f })} />
              ))}
            </View>
          </>
        ) : (
          <Text style={styles.muted}>{t('gifNote')}</Text>
        )}

        <View style={styles.summary}>
          <Text style={styles.summaryLine}>
            {t('outputSize')}: {size.width}×{size.height}
            {settings.format === 'mp4' ? ` · ${settings.fps} fps · ${settings.codec === 'h265' ? 'H.265' : 'H.264'}` : ' · GIF'}
          </Text>
          <Text style={styles.summaryLine}>
            {t('projectLength')}: {formatDuration(duration)}
            {estimateMb ? ` · ~${estimateMb} MB` : ''}
          </Text>
          <Text style={styles.summaryLine}>✓ {t('noWatermark')}</Text>
        </View>

        {state.kind === 'running' ? (
          <View style={{ marginTop: spacing.xl }}>
            <Text style={styles.label}>{phaseLabel}</Text>
            <View style={styles.barBg}>
              <View style={[styles.barFill, { width: `${Math.round(state.progress * 100)}%` }]} />
            </View>
            <Text style={styles.muted}>{Math.round(state.progress * 100)}%</Text>
            <Pressable testID="cancel-export" onPress={() => void cancel()} style={[styles.secondary, { marginTop: spacing.lg }]} accessibilityRole="button">
              <Text style={styles.secondaryText}>{t('cancelExport')}</Text>
            </Pressable>
          </View>
        ) : state.kind === 'done' ? (
          <View style={{ marginTop: spacing.xl, gap: spacing.md }}>
            <Text style={[styles.label, { fontWeight: '700' }]}>{t('exportDone')} ✓</Text>
            <Pressable onPress={() => void saveToGallery(state.uri)} style={styles.primary} accessibilityRole="button" testID="save-gallery">
              <Text style={styles.primaryText}>{t('saveToGallery')}</Text>
            </Pressable>
            <Pressable onPress={() => void share(state.uri, state.mime)} style={styles.secondary} accessibilityRole="button">
              <Text style={styles.secondaryText}>{t('share')}</Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ marginTop: spacing.xl, gap: spacing.md }}>
            {state.kind === 'error' ? <Text style={{ color: colors.danger }}>{state.message}</Text> : null}
            <Pressable testID="start-export" onPress={() => void start()} style={styles.primary} accessibilityRole="button">
              <Text style={styles.primaryText}>{t('startExport')}</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      {/* off-screen text renderer, only mounted while an export may run */}
      <TextRasterizer ref={raster} texts={project.texts} outWidth={size.width} outHeight={size.height} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg },
  title: { color: colors.text, fontSize: 20, fontWeight: '800' },
  body: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl * 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  muted: { color: colors.textMuted, fontSize: 13, marginTop: spacing.sm },
  label: { color: colors.text, fontSize: 14, marginBottom: spacing.sm },
  summary: { marginTop: spacing.xl, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.lg, gap: spacing.xs, borderWidth: 1, borderColor: colors.border },
  summaryLine: { color: colors.text, fontSize: 14 },
  barBg: { height: 10, borderRadius: 5, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  barFill: { height: 10, backgroundColor: colors.primary },
  primary: { backgroundColor: colors.primary, borderRadius: radius.pill, paddingVertical: spacing.md, alignItems: 'center' },
  primaryText: { color: colors.primaryText, fontWeight: '700', fontSize: 16 },
  secondary: { backgroundColor: colors.surfaceAlt, borderRadius: radius.pill, paddingVertical: spacing.md, alignItems: 'center' },
  secondaryText: { color: colors.text, fontWeight: '600' },
});
