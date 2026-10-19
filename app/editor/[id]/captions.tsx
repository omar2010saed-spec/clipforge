import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Chip, IconButton, SectionLabel, Stepper } from '@/components/ui';
import { useEditorStore } from '@/store/editorStore';
import { makeText, removeCaptions, updateText } from '@/editor/timeline';
import { getEngine } from '@/engine/ffmpeg';
import {
  cancelModelDownload,
  deleteQuietly,
  ensureModel,
  extractWav,
  transcribeWav,
  type ModelKey,
  type SpeechLanguage,
} from '@/captions/whisper';
import { mapLinesToTimeline, splitIntoCaptionLines } from '@/captions/segments';
import type { Clip, TextOverlay } from '@/types';
import { colors, radius, spacing } from '@/theme/colors';
import { formatDuration } from '@/utils/format';
import { isRTL, t } from '@/i18n';

type Phase = 'idle' | 'download' | 'extract' | 'transcribe';
type StyleKey = 'classic' | 'yellow' | 'boxed';

const STYLES: Record<StyleKey, Partial<TextOverlay>> = {
  classic: { color: '#FFFFFF', strokeColor: '#000000', strokeWidth: 6, backgroundColor: 'transparent' },
  yellow: { color: '#FFE600', strokeColor: '#000000', strokeWidth: 6, backgroundColor: 'transparent' },
  boxed: { color: '#FFFFFF', strokeColor: '#000000', strokeWidth: 0, backgroundColor: 'rgba(0,0,0,0.65)' },
};

const secs = (ms: number) => (ms / 1000).toFixed(1);

export default function CaptionsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const project = useEditorStore((s) => s.project);
  const commit = useEditorStore((s) => s.commit);

  /** Only clips that can contain speech: video / audio with sound, on any track. */
  const sources = useMemo<Clip[]>(() => {
    if (!project) return [];
    return project.tracks
      .filter((tr) => tr.kind === 'video' || tr.kind === 'overlay' || tr.kind === 'audio')
      .flatMap((tr) => tr.clips)
      .filter((c) => (c.kind === 'video' || c.kind === 'audio') && c.hasAudio !== false)
      .sort((a, b) => a.startMs - b.startMs);
  }, [project]);

  const [clipId, setClipId] = useState<string | null>(null);
  const clip = sources.find((c) => c.id === clipId) ?? sources[0] ?? null;
  const [rangeStart, setRangeStart] = useState(0);
  const [rangeEnd, setRangeEnd] = useState(0);
  const [language, setLanguage] = useState<SpeechLanguage>('ar');
  const [model, setModel] = useState<ModelKey>('base');
  const [style, setStyle] = useState<StyleKey>('classic');
  const [replace, setReplace] = useState(true);
  const [phase, setPhase] = useState<Phase>('idle');
  const [pct, setPct] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const cancelled = useRef(false);
  const stopRef = useRef<null | (() => Promise<void>)>(null);

  // reset the range whenever another source clip is chosen
  const clipKey = clip?.id;
  useEffect(() => {
    if (clip) {
      setRangeStart(clip.inMs);
      setRangeEnd(clip.outMs);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clipKey]);

  const captions = useMemo(
    () => (project ? project.texts.filter((x) => x.isCaption).sort((a, b) => a.startMs - b.startMs) : []),
    [project],
  );

  const generate = async () => {
    if (!clip || !project) return;
    const engine = getEngine();
    if (!engine) {
      Alert.alert(t('engineMissingTitle'), t('engineMissingBody'));
      return;
    }
    if (clip.reversed) {
      setMessage(t('reversedNoCaptions'));
      return;
    }
    cancelled.current = false;
    setMessage(null);
    let wav: string | null = null;
    try {
      setPhase('download');
      setPct(0);
      const modelPath = await ensureModel(model, setPct);
      if (cancelled.current) throw new Error('cancelled');

      setPhase('extract');
      wav = await extractWav(engine, clip, rangeStart, rangeEnd);
      if (cancelled.current) throw new Error('cancelled');

      setPhase('transcribe');
      const segments = await transcribeWav(wav, modelPath, language, rangeEnd - rangeStart, (stop) => {
        stopRef.current = stop;
      });
      if (cancelled.current) throw new Error('cancelled');

      // segment times are relative to the extracted audio -> shift to source time, then to the timeline
      const shifted = segments.map((s) => ({ ...s, startMs: s.startMs + rangeStart, endMs: s.endMs + rangeStart }));
      const lines = mapLinesToTimeline(splitIntoCaptionLines(shifted), clip);
      if (lines.length === 0) {
        setMessage(t('noSpeech'));
        return;
      }
      const font = language === 'en' ? 'poppins' : 'cairo';
      commit((p) => {
        let q = replace ? removeCaptions(p) : p;
        for (const l of lines) {
          q = makeText(
            q,
            { text: l.text, startMs: l.startMs, endMs: l.endMs, isCaption: true, fontFamily: font, fontSize: 64, y: 0.82, ...STYLES[style] },
            l.startMs,
          ).project;
        }
        return q;
      });
      setMessage(t('captionsReady', { count: lines.length }));
    } catch (e) {
      if (!cancelled.current) {
        console.warn('[captions] failed', e);
        setMessage(t('captionsFailed'));
      }
    } finally {
      stopRef.current = null;
      if (wav) await deleteQuietly(wav);
      setPhase('idle');
    }
  };

  const cancel = async () => {
    cancelled.current = true;
    await cancelModelDownload();
    await getEngine()?.cancel().catch(() => undefined);
    await stopRef.current?.().catch(() => undefined);
  };

  const busy = phase !== 'idle';
  const phaseText =
    phase === 'download' ? t('downloadingModel', { pct }) : phase === 'extract' ? t('extractingAudio') : phase === 'transcribe' ? t('transcribing') : '';

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.header}>
        <IconButton icon={isRTL() ? 'arrow-forward' : 'arrow-back'} onPress={() => router.back()} label={t('back')} testID="captions-back" />
        <Text style={styles.title}>{t('captionsTitle')}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {sources.length === 0 || !clip ? (
          <Text style={styles.muted}>{t('noAudioClips')}</Text>
        ) : (
          <>
            <SectionLabel>{t('captionSource')}</SectionLabel>
            <View style={{ gap: spacing.sm }}>
              {sources.map((c) => (
                <Pressable key={c.id} onPress={() => setClipId(c.id)} style={[styles.source, c.id === clip.id && styles.sourceActive]} accessibilityRole="button">
                  <Text style={styles.sourceName} numberOfLines={1}>
                    {c.name}
                  </Text>
                  <Text style={styles.muted}>{formatDuration(c.startMs)}</Text>
                </Pressable>
              ))}
            </View>

            <SectionLabel>{t('captionRange')}</SectionLabel>
            <View style={styles.rowBetween}>
              <Text style={styles.label}>{t('from')}</Text>
              <Stepper value={secs(rangeStart)} onDec={() => setRangeStart(Math.max(clip.inMs, rangeStart - 1000))} onInc={() => setRangeStart(Math.min(rangeEnd - 500, rangeStart + 1000))} />
            </View>
            <View style={styles.rowBetween}>
              <Text style={styles.label}>{t('to')}</Text>
              <Stepper value={secs(rangeEnd)} onDec={() => setRangeEnd(Math.max(rangeStart + 500, rangeEnd - 1000))} onInc={() => setRangeEnd(Math.min(clip.outMs, rangeEnd + 1000))} />
            </View>

            <SectionLabel>{t('language')}</SectionLabel>
            <View style={styles.chips}>
              <Chip label={t('langAr')} active={language === 'ar'} onPress={() => setLanguage('ar')} />
              <Chip label={t('langEn')} active={language === 'en'} onPress={() => setLanguage('en')} />
              <Chip label={t('langAuto')} active={language === 'auto'} onPress={() => setLanguage('auto')} />
            </View>

            <SectionLabel>{t('quality')}</SectionLabel>
            <View style={styles.chips}>
              <Chip label={t('qFast')} active={model === 'tiny'} onPress={() => setModel('tiny')} />
              <Chip label={t('qBalanced')} active={model === 'base'} onPress={() => setModel('base')} />
              <Chip label={t('qAccurate')} active={model === 'small'} onPress={() => setModel('small')} />
            </View>
            <Text style={[styles.muted, { marginTop: spacing.sm }]}>{t('firstDownloadNote')}</Text>

            <SectionLabel>{t('style')}</SectionLabel>
            <View style={styles.chips}>
              <Chip label={t('styleClassic')} active={style === 'classic'} onPress={() => setStyle('classic')} />
              <Chip label={t('styleYellow')} active={style === 'yellow'} onPress={() => setStyle('yellow')} />
              <Chip label={t('styleBoxed')} active={style === 'boxed'} onPress={() => setStyle('boxed')} />
            </View>

            <View style={[styles.rowBetween, { marginTop: spacing.lg }]}>
              <Text style={styles.label}>{t('replaceCaptions')}</Text>
              <Chip label={replace ? 'ON' : 'OFF'} active={replace} onPress={() => setReplace(!replace)} />
            </View>

            {busy ? (
              <View style={styles.progress}>
                <ActivityIndicator color={colors.primary} />
                <Text style={[styles.label, { flex: 1 }]}>{phaseText}</Text>
                <Pressable onPress={() => void cancel()} accessibilityRole="button">
                  <Text style={{ color: colors.danger, fontWeight: '700' }}>{t('cancel')}</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable testID="generate-captions" onPress={() => void generate()} style={styles.primary} accessibilityRole="button">
                <Text style={styles.primaryText}>{t('generate')}</Text>
              </Pressable>
            )}
            {message ? <Text style={[styles.label, { marginTop: spacing.md }]}>{message}</Text> : null}
          </>
        )}

        <SectionLabel>{t('editCaptions')}</SectionLabel>
        {captions.length === 0 ? <Text style={styles.muted}>{t('noCaptions')}</Text> : null}
        {captions.map((c) => (
          <View key={c.id} style={styles.captionRow}>
            <TextInput
              value={c.text}
              onChangeText={(text) => commit((p) => updateText(p, c.id, { text }), { coalesce: `cap-${c.id}` })}
              multiline
              style={[styles.captionInput, { textAlign: isRTL() ? 'right' : 'left' }]}
            />
            <View style={styles.rowBetween}>
              <Stepper value={secs(c.startMs)} onDec={() => commit((p) => updateText(p, c.id, { startMs: Math.max(0, c.startMs - 100) }))} onInc={() => commit((p) => updateText(p, c.id, { startMs: Math.min(c.endMs - 100, c.startMs + 100) }))} />
              <Stepper value={secs(c.endMs)} onDec={() => commit((p) => updateText(p, c.id, { endMs: Math.max(c.startMs + 100, c.endMs - 100) }))} onInc={() => commit((p) => updateText(p, c.id, { endMs: c.endMs + 100 }))} />
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg },
  title: { color: colors.text, fontSize: 20, fontWeight: '800' },
  body: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl * 2 },
  muted: { color: colors.textMuted, fontSize: 13 },
  label: { color: colors.text, fontSize: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm },
  source: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  sourceActive: { borderColor: colors.primary },
  sourceName: { color: colors.text, flex: 1, marginEnd: spacing.md },
  primary: { marginTop: spacing.xl, backgroundColor: colors.primary, borderRadius: radius.pill, paddingVertical: spacing.md, alignItems: 'center' },
  primaryText: { color: colors.primaryText, fontWeight: '700', fontSize: 16 },
  progress: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.xl },
  captionRow: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, gap: spacing.sm },
  captionInput: { color: colors.text, fontSize: 15, minHeight: 40 },
});
