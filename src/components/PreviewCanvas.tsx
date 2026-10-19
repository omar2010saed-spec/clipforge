import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { VideoView, useVideoPlayer } from 'expo-video';
import type { Clip, Project, TextOverlay } from '@/types';
import { DESIGN_SHORT_SIDE } from '@/types';
import { activeClips, activeTexts, sourceTimeMs, trackOf } from '@/editor/timeline';
import type { Selection } from '@/store/editorStore';
import { TextOverlayBody } from './TextOverlayView';
import { colors } from '@/theme/colors';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

interface Box {
  w: number;
  h: number;
}

/**
 * Keeps a native player aligned with the timeline clock.
 * - playing: the player runs at the clip speed and is re-synced only when it drifts > 350 ms
 * - paused / scrubbing / reversed: the player is parked on the exact frame (reverse playback
 *   is therefore shown frame-by-frame in the preview; the export itself is smooth).
 */
function useSyncedPlayer(clip: Clip, timeMs: number, playing: boolean, muted: boolean) {
  const player = useVideoPlayer(clip.sourceUri, (p) => {
    p.loop = false;
    p.muted = muted;
    p.volume = Math.min(1, clip.volume);
  });
  const target = sourceTimeMs(clip, timeMs) / 1000;
  const targetRef = useRef(target);
  targetRef.current = target;
  const stepping = !playing || clip.reversed;

  useEffect(() => {
    player.muted = muted;
    player.volume = Math.min(1, clip.volume);
  }, [player, muted, clip.volume]);

  useEffect(() => {
    try {
      if (!stepping) {
        player.playbackRate = clip.speed;
        player.currentTime = targetRef.current;
        player.play();
      } else {
        player.pause();
      }
    } catch (e) {
      console.warn('[preview] player control failed', e);
    }
    return () => {
      try {
        player.pause();
      } catch {
        /* player already released */
      }
    };
  }, [player, stepping, clip.speed]);

  const bucket = stepping ? timeMs : Math.floor(timeMs / 250);
  useEffect(() => {
    try {
      const diff = Math.abs(player.currentTime - targetRef.current);
      if (diff > (stepping ? 0.04 : 0.35)) player.currentTime = targetRef.current;
    } catch {
      /* player not ready yet */
    }
  }, [player, bucket, stepping]);

  return player;
}

function VideoLayer({ clip, timeMs, playing, muted }: { clip: Clip; timeMs: number; playing: boolean; muted: boolean }) {
  const player = useSyncedPlayer(clip, timeMs, playing, muted);
  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} />;
}

function AudioLayer({ clip, timeMs, playing, muted }: { clip: Clip; timeMs: number; playing: boolean; muted: boolean }) {
  useSyncedPlayer(clip, timeMs, playing, muted);
  return null;
}

function MediaLayer({ clip, timeMs, playing, muted }: { clip: Clip; timeMs: number; playing: boolean; muted: boolean }) {
  if (clip.kind === 'image' || clip.kind === 'gif') {
    return <Image source={{ uri: clip.sourceUri }} resizeMode="contain" style={StyleSheet.absoluteFill} />;
  }
  return <VideoLayer clip={clip} timeMs={timeMs} playing={playing} muted={muted} />;
}

function Draggable({
  enabled,
  onSelect,
  onMove,
  box,
  x,
  y,
  children,
}: {
  enabled: boolean;
  onSelect: () => void;
  onMove: (x: number, y: number) => void;
  box: Box;
  x: number;
  y: number;
  children: React.ReactNode;
}) {
  const [drag, setDrag] = useState({ x: 0, y: 0 });
  const gesture = useMemo(
    () =>
      Gesture.Exclusive(
        Gesture.Pan()
          .runOnJS(true)
          .enabled(enabled)
          .onUpdate((e) => setDrag({ x: e.translationX, y: e.translationY }))
          .onEnd((e) => {
            setDrag({ x: 0, y: 0 });
            onMove(clamp01(x + e.translationX / box.w), clamp01(y + e.translationY / box.h));
          })
          .onFinalize(() => setDrag({ x: 0, y: 0 })),
        Gesture.Tap().runOnJS(true).onEnd(onSelect),
      ),
    [enabled, onMove, onSelect, box.w, box.h, x, y],
  );
  return (
    <GestureDetector gesture={gesture}>
      <View collapsable={false} style={{ transform: [{ translateX: drag.x }, { translateY: drag.y }] }}>
        {children}
      </View>
    </GestureDetector>
  );
}

function OverlayClipLayer({
  clip,
  box,
  timeMs,
  playing,
  muted,
  selected,
  onSelect,
  onMove,
}: {
  clip: Clip;
  box: Box;
  timeMs: number;
  playing: boolean;
  muted: boolean;
  selected: boolean;
  onSelect: () => void;
  onMove: (x: number, y: number) => void;
}) {
  // The overlay is fitted into a square of `scale * canvasWidth` (same rule as the export).
  const side = box.w * clip.scale;
  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: clip.x * box.w - side / 2, top: clip.y * box.h - side / 2, width: side, height: side }}
    >
      <Draggable enabled={selected} onSelect={onSelect} onMove={onMove} box={box} x={clip.x} y={clip.y}>
        <View style={[{ width: side, height: side }, selected && styles.selected]}>
          <MediaLayer clip={clip} timeMs={timeMs} playing={playing} muted={muted} />
        </View>
      </Draggable>
    </View>
  );
}

function TextLayer({
  overlay,
  box,
  scale,
  timeMs,
  selected,
  onSelect,
  onMove,
}: {
  overlay: TextOverlay;
  box: Box;
  scale: number;
  timeMs: number;
  selected: boolean;
  onSelect: () => void;
  onMove: (x: number, y: number) => void;
}) {
  const [h, setH] = useState(0);
  const age = timeMs - overlay.startMs;
  const left = overlay.endMs - timeMs;
  let opacity = 1;
  let ty = 0;
  if (overlay.animation === 'fade') opacity = Math.min(1, Math.max(0, Math.min(age, left) / 300));
  if (overlay.animation === 'slideUp') ty = box.h * 0.03 * Math.max(0, 1 - age / 300);

  return (
    <View
      pointerEvents="box-none"
      onLayout={(e: LayoutChangeEvent) => setH(e.nativeEvent.layout.height)}
      style={{
        position: 'absolute',
        left: overlay.x * box.w - box.w / 2,
        width: box.w,
        top: overlay.y * box.h - h / 2 + ty,
        opacity,
        alignItems: 'center',
        transform: [{ rotate: `${overlay.rotation}deg` }],
      }}
    >
      <Draggable enabled={selected} onSelect={onSelect} onMove={onMove} box={box} x={overlay.x} y={overlay.y}>
        <View style={selected ? styles.selected : undefined}>
          <TextOverlayBody overlay={overlay} scale={scale} maxWidth={box.w * 0.9} />
        </View>
      </Draggable>
    </View>
  );
}

interface Props {
  project: Project;
  timeMs: number;
  playing: boolean;
  selection: Selection;
  onSelect: (sel: Selection) => void;
  onMoveClip: (id: string, x: number, y: number) => void;
  onMoveText: (id: string, x: number, y: number) => void;
}

export function PreviewCanvas({ project, timeMs, playing, selection, onSelect, onMoveClip, onMoveText }: Props) {
  const [area, setArea] = useState<Box>({ w: 0, h: 0 });
  const aspect = project.width / project.height;
  const box: Box = useMemo(() => {
    if (area.w <= 0 || area.h <= 0) return { w: 0, h: 0 };
    return area.w / area.h > aspect ? { w: area.h * aspect, h: area.h } : { w: area.w, h: area.w / aspect };
  }, [area, aspect]);
  const scale = Math.min(box.w, box.h) / DESIGN_SHORT_SIDE;

  const main = activeClips(project, 'video', timeMs)[0];
  const overlays = activeClips(project, 'overlay', timeMs);
  const audios = activeClips(project, 'audio', timeMs);
  const texts = activeTexts(project, timeMs);
  const muted = (kind: 'video' | 'overlay' | 'audio') => trackOf(project, kind)?.muted ?? false;

  return (
    <View style={styles.area} onLayout={(e) => setArea({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {box.w > 0 ? (
        <View style={[styles.canvas, { width: box.w, height: box.h }]}>
          {main ? (
            <MediaLayer key={main.id} clip={main} timeMs={timeMs} playing={playing} muted={muted('video')} />
          ) : null}
          {overlays.map((c) => (
            <OverlayClipLayer
              key={c.id}
              clip={c}
              box={box}
              timeMs={timeMs}
              playing={playing}
              muted={muted('overlay')}
              selected={selection?.type === 'clip' && selection.id === c.id}
              onSelect={() => onSelect({ type: 'clip', id: c.id })}
              onMove={(x, y) => onMoveClip(c.id, x, y)}
            />
          ))}
          {texts.map((x) => (
            <TextLayer
              key={x.id}
              overlay={x}
              box={box}
              scale={scale}
              timeMs={timeMs}
              selected={selection?.type === 'text' && selection.id === x.id}
              onSelect={() => onSelect({ type: 'text', id: x.id })}
              onMove={(nx, ny) => onMoveText(x.id, nx, ny)}
            />
          ))}
          {audios.map((c) => (
            <AudioLayer key={c.id} clip={c} timeMs={timeMs} playing={playing} muted={muted('audio')} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  area: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#050507' },
  canvas: { backgroundColor: '#000', overflow: 'hidden' },
  selected: { borderWidth: 1.5, borderColor: colors.primary, borderStyle: 'dashed' },
});
