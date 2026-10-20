import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { PreviewCanvas } from '@/components/PreviewCanvas';
import { Timeline } from '@/components/Timeline';
import { BottomSheet } from '@/components/BottomSheet';
import { EmptyState } from '@/components/EmptyState';
import { Chip, IconButton, Stepper, ToolButton } from '@/components/ui';
import { useEditorStore } from '@/store/editorStore';
import {
  deleteClip,
  deleteText,
  duplicateClip,
  duplicateText,
  findClip,
  findText,
  makeText,
  setClipAdjust,
  setClipSpeed,
  setClipTransform,
  setClipVolume,
  splitClipAt,
  toggleReverse,
  trimToPlayhead,
  updateText,
  activeClips,
  addMedia,
  copyItem,
  pasteItem,
  splitAllAt,
  splitTextAt,
} from '@/editor/timeline';
import { projectDurationMs } from '@/models/project';
import { SFX_IDS, type SfxId } from '@/sfx/synth';
import { ensureSfxFile } from '@/sfx/sfxFiles';
import { ADJUST_LIMITS, matchingPreset, NEUTRAL_ADJUST, PRESETS, type AdjustKey } from '@/editor/adjust';
import { colors, radius, spacing } from '@/theme/colors';
import { formatDuration } from '@/utils/format';
import { isRTL, t } from '@/i18n';

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];
const VOLUMES = [0, 0.25, 0.5, 1, 1.5, 2];
const SIZES = [0.25, 0.4, 0.5, 0.75, 1];
const STICKERS = [
  '😀', '😂', '😍', '😎', '🥳', '😢', '😡', '🤯', '👍', '👏', '🙏', '💪',
  '🔥', '⭐', '❤️', '💯', '🎉', '🎬', '🎵', '✨', '👑', '💎', '🚀', '🌈',
  '☀️', '🌙', '⚡', '🍕', '🎁', '📌', '✅', '❌',
];

type SheetKind = 'speed' | 'volume' | 'size' | 'sticker' | 'color' | 'sfx' | null;

const ADJUST_ROWS: { key: AdjustKey; label: Parameters<typeof t>[0]; step: number }[] = [
  { key: 'brightness', label: 'adjBrightness', step: 0.1 },
  { key: 'contrast', label: 'adjContrast', step: 0.1 },
  { key: 'saturation', label: 'adjSaturation', step: 0.1 },
  { key: 'warmth', label: 'adjWarmth', step: 0.1 },
];
const PRESET_LABELS: Record<string, Parameters<typeof t>[0]> = {
  none: 'pNone', bw: 'pBw', vivid: 'pVivid', warm: 'pWarm', cool: 'pCool', vintage: 'pVintage', fade: 'pFade',
};

export default function EditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const projectId = String(id ?? '');
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const landscape = width > height;

  const project = useEditorStore((s) => s.project);
  const status = useEditorStore((s) => s.status);
  const error = useEditorStore((s) => s.error);
  const selection = useEditorStore((s) => s.selection);
  const timeMs = useEditorStore((s) => s.timeMs);
  const playing = useEditorStore((s) => s.playing);
  const canUndo = useEditorStore((s) => s.past.length > 0);
  const canRedo = useEditorStore((s) => s.future.length > 0);
  const clipboard = useEditorStore((s) => s.clipboard);
  const { load, reset, flush, commit, run, undo, redo, select, setTime, setPlaying, zoom, clearError, setClipboard } =
    useEditorStore.getState();

  const [sheet, setSheet] = useState<SheetKind>(null);
  const [hint, setHint] = useState<string | null>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showHint = useCallback((msg: string) => {
    setHint(msg);
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setHint(null), 2500);
  }, []);

  useEffect(() => {
    void load(projectId);
    return () => {
      void flush().then(() => reset());
      if (hintTimer.current) clearTimeout(hintTimer.current);
    };
  }, [projectId, load, flush, reset]);

  // ---- playback clock: the timeline time is the single source of truth
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const s = useEditorStore.getState();
      const dur = s.project ? projectDurationMs(s.project) : 0;
      const next = s.timeMs + (now - last);
      last = now;
      if (next >= dur) {
        s.setTime(dur);
        s.setPlaying(false);
        return;
      }
      s.setTime(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const duration = project ? projectDurationMs(project) : 0;
  const selClip = project && selection?.type === 'clip' ? findClip(project, selection.id) : null;
  const selText = project && selection?.type === 'text' ? findText(project, selection.id) : undefined;

  /** The clip a tool acts on: the selected one, otherwise the main-track clip under the playhead. */
  const targetClipId = useMemo(() => {
    if (!project) return null;
    if (selClip) return selClip.clip.id;
    return activeClips(project, 'video', timeMs)[0]?.id ?? null;
  }, [project, selClip, timeMs]);

  const togglePlay = () => {
    if (!project || duration === 0) return;
    if (playing) {
      setPlaying(false);
      return;
    }
    if (timeMs >= duration - 30) setTime(0);
    setPlaying(true);
  };

  const needClip = (): string | null => {
    if (!targetClipId) {
      showHint(t('selectClipFirst'));
      return null;
    }
    return targetClipId;
  };

  /** Premiere-style razor: the selected item, otherwise every clip and text under the playhead. */
  const onSplit = () => {
    const state = useEditorStore.getState();
    const p = state.project;
    if (!p) return;
    if (selText) {
      const r = run((pr) => splitTextAt(pr, selText.id, timeMs));
      if (!r || !r.newTextId) showHint(t('cannotSplitHere'));
      else select({ type: 'text', id: r.newTextId });
      return;
    }
    if (selClip) {
      const r = run((pr) => splitClipAt(pr, selClip.clip.id, timeMs));
      if (!r || !r.newClipId) showHint(t('cannotSplitHere'));
      else select({ type: 'clip', id: r.newClipId });
      return;
    }
    const r = run((pr) => splitAllAt(pr, timeMs));
    if (!r || r.count === 0) showHint(t('cannotSplitHere'));
  };

  const onCopy = (): boolean => {
    const state = useEditorStore.getState();
    const sel = state.selection ?? (targetClipId ? { type: 'clip' as const, id: targetClipId } : null);
    const item = state.project ? copyItem(state.project, sel) : null;
    if (!item) {
      showHint(t('selectClipFirst'));
      return false;
    }
    setClipboard(item);
    return true;
  };

  const onCut = () => {
    if (!onCopy()) return;
    onDelete();
  };

  const onPaste = () => {
    const item = useEditorStore.getState().clipboard;
    if (!item) {
      showHint(t('nothingToPaste'));
      return;
    }
    const r = run((pr) => pasteItem(pr, item, timeMs));
    if (r?.id) select({ type: r.type, id: r.id });
  };

  const onTrim = (keep: 'before' | 'after') => {
    const cid = needClip();
    if (!cid) return;
    const before = useEditorStore.getState().project;
    commit((p) => trimToPlayhead(p, cid, timeMs, keep));
    if (useEditorStore.getState().project === before) showHint(t('cannotSplitHere'));
  };

  const onDuplicate = () => {
    if (selText) {
      const r = run((p) => duplicateText(p, selText.id));
      if (r?.newTextId) select({ type: 'text', id: r.newTextId });
      return;
    }
    const cid = needClip();
    if (!cid) return;
    const r = run((p) => duplicateClip(p, cid));
    if (r?.newClipId) select({ type: 'clip', id: r.newClipId });
  };

  const onDelete = () => {
    if (selText) commit((p) => deleteText(p, selText.id));
    else if (selClip) commit((p) => deleteClip(p, selClip.clip.id));
    else showHint(t('selectClipFirst'));
  };

  const addText = () => {
    const r = run((p) => makeText(p, { text: t('defaultText') }, timeMs));
    if (r?.textId) {
      select({ type: 'text', id: r.textId });
      router.push({ pathname: '/editor/[id]/text', params: { id: projectId, textId: r.textId } });
    }
  };

  const addSfx = async (id: SfxId) => {
    try {
      const f = await ensureSfxFile(id);
      const at = useEditorStore.getState().timeMs;
      const r = run((p) => {
        const res = addMedia(p, { kind: 'audio', uri: f.uri, name: t(`sfx_${id}`), durationMs: f.durationMs, hasAudio: true }, 'audio', at);
        return { project: res.project, clipId: res.clipId };
      });
      if (r?.clipId) select({ type: 'clip', id: r.clipId });
      showHint(t('sfxAdded'));
    } catch (e) {
      console.warn('[sfx] failed', e);
      showHint(t('errorTitle'));
    }
  };

  const addSticker = (emoji: string) => {
    setSheet(null);
    const r = run((p) => makeText(p, { text: emoji, isSticker: true }, timeMs));
    if (r?.textId) select({ type: 'text', id: r.textId });
  };

  if (status === 'loading' || status === 'idle') {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }
  if (status === 'error' || !project) {
    return (
      <View style={[styles.root, styles.center, { paddingTop: insets.top }]}>
        <EmptyState icon="alert-circle-outline" title={t('errorTitle')} subtitle={error ?? undefined} actionLabel={t('back')} onAction={() => router.back()} />
      </View>
    );
  }

  const target = targetClipId ? findClip(project, targetClipId) : null;
  const isStill = target?.clip.kind === 'image' || target?.clip.kind === 'gif';
  const isOverlay = target?.track.kind === 'overlay';
  const hasClips = project.tracks.some((tr) => tr.clips.length > 0);

  const transport = (
    <View style={styles.transport}>
      <IconButton icon={playing ? 'pause' : 'play'} onPress={togglePlay} label={playing ? 'pause' : 'play'} size={30} testID="play-button" />
      <Text style={styles.time}>
        {formatDuration(timeMs)} / {formatDuration(duration)}
      </Text>
      <View style={{ flex: 1 }} />
      <IconButton icon="arrow-undo" onPress={undo} disabled={!canUndo} label={t('undo')} testID="undo-button" />
      <IconButton icon="arrow-redo" onPress={redo} disabled={!canRedo} label={t('redo')} testID="redo-button" />
      <IconButton icon="remove-circle-outline" onPress={() => zoom(0.7)} label="zoom out" />
      <IconButton icon="add-circle-outline" onPress={() => zoom(1.4)} label="zoom in" />
    </View>
  );

  const timeline = (
    <View style={landscape ? { flex: 1 } : { height: 236 }}>
      {hasClips || project.texts.length > 0 ? null : <Text style={styles.emptyHint}>{t('timelineEmpty')}</Text>}
      <Timeline />
    </View>
  );

  const toolbar = (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.toolbar} contentContainerStyle={{ paddingHorizontal: spacing.sm }}>
      <ToolButton icon="images-outline" label={t('tMedia')} onPress={() => router.push({ pathname: '/editor/[id]/import', params: { id: projectId } })} testID="tool-media" />
      <ToolButton icon="text-outline" label={t('tText')} onPress={addText} testID="tool-text" />
      <ToolButton icon="happy-outline" label={t('tSticker')} onPress={() => setSheet('sticker')} />
      <ToolButton icon="musical-notes-outline" label={t('tSfx')} onPress={() => setSheet('sfx')} testID="tool-sfx" />
      <ToolButton icon="chatbox-ellipses-outline" label={t('tCaptions')} onPress={() => router.push({ pathname: '/editor/[id]/captions', params: { id: projectId } })} testID="tool-captions" />
      {selText ? (
        <ToolButton icon="create-outline" label={t('tEdit')} onPress={() => router.push({ pathname: '/editor/[id]/text', params: { id: projectId, textId: selText.id } })} />
      ) : null}
      <ToolButton icon="cut-outline" label={t('tSplit')} onPress={onSplit} disabled={!hasClips && project.texts.length === 0} testID="tool-split" />
      <ToolButton icon="copy-outline" label={t('tCopy')} onPress={onCopy} disabled={!selClip && !selText && !targetClipId} testID="tool-copy" />
      <ToolButton icon="backspace-outline" label={t('tCut')} onPress={onCut} disabled={!selClip && !selText} testID="tool-cut" />
      <ToolButton icon="clipboard-outline" label={t('tPaste')} onPress={onPaste} disabled={!clipboard} testID="tool-paste" />
      {!selText ? (
        <>
          <ToolButton icon="arrow-back-circle-outline" label={t('tTrimStart')} onPress={() => onTrim('after')} disabled={!targetClipId} />
          <ToolButton icon="arrow-forward-circle-outline" label={t('tTrimEnd')} onPress={() => onTrim('before')} disabled={!targetClipId} />
          <ToolButton icon="color-palette-outline" label={t('tColor')} onPress={() => setSheet('color')} disabled={!targetClipId || target?.clip.kind === 'audio'} testID="tool-color" />
          <ToolButton icon="speedometer-outline" label={t('tSpeed')} onPress={() => setSheet('speed')} disabled={!targetClipId || isStill} />
          <ToolButton icon="repeat-outline" label={t('tReverse')} onPress={() => targetClipId && commit((p) => toggleReverse(p, targetClipId))} disabled={!targetClipId || isStill} />
          <ToolButton icon="volume-high-outline" label={t('tVolume')} onPress={() => setSheet('volume')} disabled={!targetClipId || isStill} />
          {isOverlay ? <ToolButton icon="resize-outline" label={t('tSize')} onPress={() => setSheet('size')} /> : null}
        </>
      ) : null}
      <ToolButton icon="duplicate-outline" label={t('duplicate')} onPress={onDuplicate} disabled={!targetClipId && !selText} />
      <ToolButton icon="trash-outline" label={t('delete')} onPress={onDelete} disabled={!selClip && !selText} testID="tool-delete" />
    </ScrollView>
  );

  const preview = (
    <View style={{ flex: 1 }}>
      <PreviewCanvas
        project={project}
        timeMs={timeMs}
        playing={playing}
        selection={selection}
        onSelect={select}
        onMoveClip={(cid, x, y) => commit((p) => setClipTransform(p, cid, { x, y }))}
        onMoveText={(tid, x, y) => commit((p) => updateText(p, tid, { x, y }))}
      />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      {error ? (
        <Pressable onPress={clearError} style={styles.errorBar}>
          <Text style={styles.errorText}>{error}</Text>
        </Pressable>
      ) : null}
    </View>
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom, paddingLeft: insets.left, paddingRight: insets.right }]}>
      <View style={styles.header}>
        <IconButton icon={isRTL() ? 'arrow-forward' : 'arrow-back'} onPress={() => router.back()} label={t('back')} testID="editor-back" />
        <Text style={styles.title} numberOfLines={1}>
          {project.name}
        </Text>
        <Pressable
          testID="export-button"
          onPress={() => {
            setPlaying(false);
            router.push({ pathname: '/editor/[id]/export', params: { id: projectId } });
          }}
          style={styles.exportBtn}
          accessibilityRole="button"
        >
          <Text style={styles.exportText}>{t('exportBtn')}</Text>
        </Pressable>
      </View>

      {landscape ? (
        <View style={{ flex: 1, flexDirection: 'row' }}>
          <View style={{ flex: 1 }}>{preview}</View>
          <View style={{ flex: 1.2 }}>
            {transport}
            {timeline}
            {toolbar}
          </View>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          {preview}
          {transport}
          {timeline}
          {toolbar}
        </View>
      )}

      <BottomSheet visible={sheet === 'speed'} onClose={() => setSheet(null)}>
        <Text style={styles.sheetTitle}>{t('speedTitle')}</Text>
        <View style={styles.chips}>
          {SPEEDS.map((s) => (
            <Chip key={s} label={`${s}x`} active={target?.clip.speed === s} onPress={() => targetClipId && commit((p) => setClipSpeed(p, targetClipId, s))} />
          ))}
        </View>
        {target?.clip.reversed ? <Text style={styles.note}>{t('previewReverseNote')}</Text> : null}
      </BottomSheet>

      <BottomSheet visible={sheet === 'volume'} onClose={() => setSheet(null)}>
        <Text style={styles.sheetTitle}>{t('volumeTitle')}</Text>
        <View style={styles.chips}>
          {VOLUMES.map((v) => (
            <Chip key={v} label={`${Math.round(v * 100)}%`} active={target?.clip.volume === v} onPress={() => targetClipId && commit((p) => setClipVolume(p, targetClipId, v))} />
          ))}
        </View>
      </BottomSheet>

      <BottomSheet visible={sheet === 'size'} onClose={() => setSheet(null)}>
        <Text style={styles.sheetTitle}>{t('sizeTitle')}</Text>
        <View style={styles.chips}>
          {SIZES.map((v) => (
            <Chip key={v} label={`${Math.round(v * 100)}%`} active={target?.clip.scale === v} onPress={() => targetClipId && commit((p) => setClipTransform(p, targetClipId, { scale: v }))} />
          ))}
        </View>
      </BottomSheet>

      <BottomSheet visible={sheet === 'sfx'} onClose={() => setSheet(null)}>
        <Text style={styles.sheetTitle}>{t('sfxTitle')}</Text>
        <View style={styles.chips}>
          {SFX_IDS.map((id) => (
            <Chip key={id} label={t(`sfx_${id}`)} onPress={() => void addSfx(id)} testID={`sfx-${id}`} />
          ))}
        </View>
      </BottomSheet>

      <BottomSheet visible={sheet === 'color'} onClose={() => setSheet(null)}>
        <Text style={styles.sheetTitle}>{t('colorTitle')}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
          {Object.keys(PRESETS).map((name) => (
            <Chip
              key={name}
              label={t(PRESET_LABELS[name] ?? 'pNone')}
              active={matchingPreset(target?.clip.adjust) === name}
              onPress={() => targetClipId && commit((p) => setClipAdjust(p, targetClipId, PRESETS[name] ?? NEUTRAL_ADJUST))}
            />
          ))}
        </ScrollView>
        {ADJUST_ROWS.map((row) => {
          const cur = (target?.clip.adjust ?? NEUTRAL_ADJUST)[row.key];
          const [lo, hi] = ADJUST_LIMITS[row.key];
          const shown = row.key === 'brightness' || row.key === 'warmth' ? Math.round(cur * 100) : Math.round(cur * 100) - 100;
          const set = (v: number) =>
            targetClipId && commit((p) => setClipAdjust(p, targetClipId, { [row.key]: Math.min(hi, Math.max(lo, Math.round(v * 100) / 100)) }), { coalesce: `adj-${row.key}` });
          return (
            <View key={row.key} style={styles.adjRow}>
              <Text style={styles.adjLabel}>{t(row.label)}</Text>
              <Stepper value={`${shown > 0 ? '+' : ''}${shown}`} onDec={() => set(cur - row.step)} onInc={() => set(cur + row.step)} />
            </View>
          );
        })}
        <Chip label={t('adjReset')} onPress={() => targetClipId && commit((p) => setClipAdjust(p, targetClipId, NEUTRAL_ADJUST))} />
        <Text style={styles.note}>{t('adjNote')}</Text>
      </BottomSheet>

      <BottomSheet visible={sheet === 'sticker'} onClose={() => setSheet(null)}>
        <Text style={styles.sheetTitle}>{t('stickerTitle')}</Text>
        <View style={styles.stickerGrid}>
          {STICKERS.map((s) => (
            <Pressable key={s} onPress={() => addSticker(s)} style={styles.sticker} accessibilityRole="button" accessibilityLabel={s}>
              <Text style={{ fontSize: 30 }}>{s}</Text>
            </Pressable>
          ))}
        </View>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.md },
  title: { flex: 1, color: colors.text, fontSize: 16, fontWeight: '700' },
  exportBtn: { backgroundColor: colors.primary, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.pill },
  exportText: { color: colors.primaryText, fontWeight: '700' },
  transport: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.xs, gap: spacing.xs, backgroundColor: colors.surface },
  time: { color: colors.text, fontVariant: ['tabular-nums'], marginStart: spacing.sm },
  toolbar: { flexGrow: 0, backgroundColor: colors.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  emptyHint: { position: 'absolute', zIndex: 5, alignSelf: 'center', top: 60, color: colors.textMuted, textAlign: 'center', paddingHorizontal: spacing.xl },
  hint: { position: 'absolute', bottom: spacing.md, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.75)', color: colors.text, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, overflow: 'hidden' },
  errorBar: { position: 'absolute', top: spacing.sm, alignSelf: 'center', backgroundColor: colors.danger, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.sm },
  errorText: { color: '#fff' },
  sheetTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  adjRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  adjLabel: { color: colors.text, fontSize: 15 },
  note: { color: colors.textMuted, fontSize: 12 },
  stickerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'center' },
  sticker: { width: 54, height: 54, borderRadius: radius.md, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
});
